import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { createAccount, listAccounts } from "./accounts";
import { buildTransactionsCsv } from "./export";
import { insertPlannedTransactions, planImportForUser } from "./import";
import { getSpendByTag, listTags } from "./tags";
import {
  createTransaction,
  listTransactionsPage,
  softDeleteTransaction,
  updateTransaction,
} from "./transactions";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { personalScope } from "@/lib/scope";

// Live test of tags: stored normalized, filterable, counted, summed per month
// and currency, and preserved by a CSV export -> import round trip.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("tags (live)", () => {
  let admin: SupabaseClient<Database>;
  let a: SupabaseClient<Database>;
  let b: SupabaseClient<Database>;
  let userA: string;
  let userB: string;
  let rsdId: string;
  let eurId: string;
  let foodId: string;

  const MONTH = "2026-04-01";
  const scopeA = () => personalScope(userA);

  async function seedUser(client: SupabaseClient<Database>, id: string) {
    const scope = personalScope(id);
    await createAccount(client, scope, { name: "Wallet", type: "cash", openingBalance: 0n });
    await createAccount(client, scope, { name: "Euro", type: "cash", currency: "EUR", openingBalance: 0n });
    const accounts = await listAccounts(client, scope);
    const { data, error } = await client
      .from("categories")
      .insert({ user_id: id, name: "Food", kind: "expense" })
      .select()
      .single();
    if (error || !data) throw error;
    return {
      rsd: accounts.find((x) => x.name === "Wallet")!.id,
      eur: accounts.find((x) => x.name === "Euro")!.id,
      food: data.id,
    };
  }

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    a = createClient<Database>(url!, anonKey!);
    b = createClient<Database>(url!, anonKey!);
    const [sa, sb] = await Promise.all([
      signInAnonymouslyWithRetry(a),
      signInAnonymouslyWithRetry(b),
    ]);
    if (sa.error || !sa.data.user) throw sa.error;
    if (sb.error || !sb.data.user) throw sb.error;
    userA = sa.data.user.id;
    userB = sb.data.user.id;
    const seeded = await seedUser(a, userA);
    rsdId = seeded.rsd;
    eurId = seeded.eur;
    foodId = seeded.food;
    await seedUser(b, userB);

    const add = (accountId: string, amount: bigint, tags: string[], day = "2026-04-10") =>
      createTransaction(a, scopeA(), {
        type: "expense",
        accountId,
        categoryId: foodId,
        amount,
        occurredOn: day,
        tags,
      });
    await add(rsdId, 10_000n, ["trip", "food"]);
    await add(rsdId, 5_000n, ["trip"]);
    await add(rsdId, 700n, []);
    await add(eurId, 2_000n, ["trip"]);
    await add(rsdId, 900n, ["trip"], "2026-05-02"); // another month
  }, 60000);

  afterAll(async () => {
    for (const id of [userA, userB]) {
      if (!id) continue;
      await admin.from("transactions").delete().eq("user_id", id);
      await admin.from("categories").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }, 30000);

  it("filters by tag and returns the tags on each row", async () => {
    const page = await listTransactionsPage(a, scopeA(), { tag: "trip" }, null);
    expect(page.transactions).toHaveLength(4);
    expect(page.transactions.every((t) => t.tags.includes("trip"))).toBe(true);

    const food = await listTransactionsPage(a, scopeA(), { tag: "food" }, null);
    expect(food.transactions).toHaveLength(1);
    expect(food.transactions[0].tags).toEqual(["trip", "food"]);

    const none = await listTransactionsPage(a, scopeA(), { tag: "nope" }, null);
    expect(none.transactions).toHaveLength(0);
  });

  it("treats the tag filter as a plain tag, never as array syntax", async () => {
    // Normalized like any typed tag: split on the comma, braces dropped, only
    // the first tag is used - so this is the plain "trip" filter, not a
    // crafted array literal.
    const crafted = await listTransactionsPage(a, scopeA(), { tag: "trip},{food" }, null);
    const plain = await listTransactionsPage(a, scopeA(), { tag: "trip" }, null);
    expect(crafted.transactions.map((t) => t.id)).toEqual(plain.transactions.map((t) => t.id));
  });

  it("counts tags in use", async () => {
    expect(await listTags(a, scopeA())).toEqual([
      { tag: "trip", count: 4 },
      { tag: "food", count: 1 },
    ]);
    expect(await listTags(b, personalScope(userB))).toEqual([]);
  });

  it("sums expense per tag for one month and currency", async () => {
    expect(await getSpendByTag(a, scopeA(), MONTH, "RSD")).toEqual([
      { tag: "trip", total: 15_000n, count: 2 },
      { tag: "food", total: 10_000n, count: 1 },
    ]);
    expect(await getSpendByTag(a, scopeA(), MONTH, "EUR")).toEqual([
      { tag: "trip", total: 2_000n, count: 1 },
    ]);
    expect(await getSpendByTag(a, scopeA(), "2026-06-01", "RSD")).toEqual([]);
  });

  it("editing replaces the tags; clearing them stores none; deleted rows drop out", async () => {
    const page = await listTransactionsPage(a, scopeA(), { tag: "food" }, null);
    const t = page.transactions[0];
    await updateTransaction(a, scopeA(), t.id, {
      type: "expense",
      accountId: t.accountId,
      categoryId: t.categoryId,
      amount: t.amount,
      occurredOn: t.occurredOn,
      tags: ["lunch"],
    });
    expect((await listTags(a, scopeA())).map((x) => x.tag).sort()).toEqual(["lunch", "trip"]);

    await updateTransaction(a, scopeA(), t.id, {
      type: "expense",
      accountId: t.accountId,
      categoryId: t.categoryId,
      amount: t.amount,
      occurredOn: t.occurredOn,
      tags: [],
    });
    const { data } = await a.from("transactions").select("tags").eq("id", t.id).single();
    expect(data!.tags).toBeNull();

    const trips = await listTransactionsPage(a, scopeA(), { tag: "trip" }, null);
    await softDeleteTransaction(a, scopeA(), trips.transactions[0].id);
    expect((await listTags(a, scopeA()))[0]).toEqual({ tag: "trip", count: 2 });
  }, 60000);

  it("survives an export -> import round trip into another user", async () => {
    const csv = await buildTransactionsCsv(a, scopeA());
    expect(csv).toContain(",tags");

    const scopeB = personalScope(userB);
    const plan = await planImportForUser(b, scopeB, csv);
    expect(plan.errors).toEqual([]);
    expect(plan.toInsert.some((r) => r.tags.includes("trip"))).toBe(true);
    await insertPlannedTransactions(b, scopeB, plan.toInsert);

    expect((await listTags(b, scopeB)).find((x) => x.tag === "trip")?.count).toBe(2);
  }, 60000);
});
