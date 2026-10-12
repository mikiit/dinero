import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { signInWithPassword } from "@/lib/auth/sign-in";
import { loadTestEnv } from "./test-env";

// SPEC.md §7, Phase 4 acceptance check, made permanent: "Log in as user B;
// zero rows from user A are visible in any query, verified against the
// database directly, not just the UI."
//
// "Directly" means: first prove with the admin (RLS-bypassing) client that
// A's rows exist - otherwise "B sees zero" would pass on an empty database -
// then prove B, signed in with a real email + password (the Phase 4 login
// path, not an anonymous session), can neither read, change, delete nor
// forge rows in A's name, in every table and view that holds user data.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

type Db = SupabaseClient<Database>;

const TABLES = [
  "profiles",
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "recurring_rules",
] as const;

const VIEWS = ["account_balances", "monthly_summary"] as const;

describe.skipIf(!hasCredentials)("user isolation (live, SPEC.md P4)", () => {
  let admin: Db;
  let a: Db;
  let b: Db;
  let userA: string;
  let userB: string;
  let accountA: string;
  let categoryA: string;
  let transactionA: string;
  let budgetA: string;
  let ruleA: string;

  const stamp = Date.now();
  const emailOf = (who: string) => `p4-${who}-${stamp}@example.com`;
  const PASSWORD = "isolation-test-pw-1";

  async function emailUser(who: string): Promise<{ client: Db; id: string }> {
    const { data, error } = await admin.auth.admin.createUser({
      email: emailOf(who),
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error;
    const client = createClient<Database>(url!, anonKey!);
    await signInWithPassword(client, emailOf(who), PASSWORD);
    return { client, id: data.user.id };
  }

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    ({ client: a, id: userA } = await emailUser("a"));
    ({ client: b, id: userB } = await emailUser("b"));

    const { data: account } = await a
      .from("accounts")
      .insert({ user_id: userA, name: "A wallet", type: "cash", opening_balance: 12345 })
      .select()
      .single();
    const { data: category } = await a
      .from("categories")
      .insert({ user_id: userA, name: "A food", kind: "expense" })
      .select()
      .single();
    if (!account || !category) throw new Error("seed failed");
    accountA = account.id;
    categoryA = category.id;

    const { data: tx } = await a
      .from("transactions")
      .insert({
        user_id: userA,
        type: "expense",
        account_id: accountA,
        category_id: categoryA,
        amount: 999,
        currency: "RSD",
        occurred_on: "2026-10-12",
        note: "A secret",
      })
      .select()
      .single();
    const { data: budget } = await a
      .from("budgets")
      .insert({ user_id: userA, category_id: categoryA, period_month: "2026-10-01", amount: 5000 })
      .select()
      .single();
    const { data: rule } = await a
      .from("recurring_rules")
      .insert({
        user_id: userA,
        template: { type: "expense", accountId: accountA, amount: "100" },
        frequency: "monthly",
        next_run_on: "2026-11-01",
      })
      .select()
      .single();
    if (!tx || !budget || !rule) throw new Error("seed failed");
    transactionA = tx.id;
    budgetA = budget.id;
    ruleA = rule.id;
  }, 90000);

  afterAll(async () => {
    for (const id of [userA, userB]) {
      if (!id) continue;
      for (const t of ["budgets", "transactions", "recurring_rules", "categories", "accounts"] as const) {
        await admin.from(t).delete().eq("user_id", id);
      }
      await admin.auth.admin.deleteUser(id);
    }
  }, 60000);

  const count = async (client: Db, table: string, userId: string) => {
    const { count: n, error } = await (client as SupabaseClient)
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(table === "profiles" ? "id" : "user_id", userId);
    if (error) throw error;
    return n;
  };

  it("A's rows really exist (so 'B sees zero' is not just an empty database)", async () => {
    for (const table of TABLES) {
      expect(await count(admin, table, userA), table).toBeGreaterThan(0);
    }
  }, 60000);

  it("B sees zero of A's rows in every table, even when asking for them by user_id", async () => {
    for (const table of TABLES) {
      expect(await count(b, table, userA), table).toBe(0);
    }
  }, 60000);

  it("B sees nothing of A in an unfiltered select either", async () => {
    // No filter at all: whatever B can see must be B's own.
    for (const table of TABLES) {
      const { data, error } = await (b as SupabaseClient).from(table).select("*");
      expect(error, table).toBeNull();
      const owners = (data ?? []).map((r: Record<string, unknown>) => r.user_id ?? r.id);
      expect(owners.every((o) => o === userB), table).toBe(true);
    }
  }, 60000);

  it("the balance and monthly views do not leak A's numbers", async () => {
    for (const view of VIEWS) {
      const { data, error } = await (b as SupabaseClient).from(view).select("*");
      expect(error, view).toBeNull();
      expect((data ?? []).filter((r: { user_id: string }) => r.user_id === userA), view).toEqual([]);
    }
    // ...while A sees its own (the views work; they just filter by caller).
    const own = await a.from("account_balances").select("balance").eq("account_id", accountA).single();
    expect(own.data?.balance).toBe(12345 - 999);
  }, 60000);

  it("B cannot change or delete A's rows - verified in the database", async () => {
    await b.from("transactions").update({ note: "hacked", amount: 1 }).eq("id", transactionA);
    await b.from("accounts").update({ name: "hacked" }).eq("id", accountA);
    await b.from("budgets").update({ amount: 1 }).eq("id", budgetA);
    await b.from("recurring_rules").update({ auto_post: true }).eq("id", ruleA);
    await b.from("transactions").delete().eq("id", transactionA);
    await b.from("categories").delete().eq("id", categoryA);
    await b.from("recurring_rules").delete().eq("id", ruleA);

    // Read back as the admin: nothing moved.
    const tx = await admin.from("transactions").select("note, amount, deleted_at").eq("id", transactionA).single();
    expect(tx.data).toEqual({ note: "A secret", amount: 999, deleted_at: null });
    expect((await admin.from("accounts").select("name").eq("id", accountA).single()).data?.name).toBe("A wallet");
    expect((await admin.from("budgets").select("amount").eq("id", budgetA).single()).data?.amount).toBe(5000);
    expect((await admin.from("recurring_rules").select("auto_post").eq("id", ruleA).single()).data?.auto_post).toBe(false);
    expect((await admin.from("categories").select("id").eq("id", categoryA)).data).toHaveLength(1);
    expect((await admin.from("recurring_rules").select("id").eq("id", ruleA)).data).toHaveLength(1);
  }, 60000);

  it("B cannot insert rows in A's name or attach its own rows to A's records", async () => {
    const forged = await b.from("accounts").insert({ user_id: userA, name: "forged", type: "cash" });
    expect(forged.error).not.toBeNull();

    // B's own transaction pointing at A's account / category: refused by the
    // ownership triggers, not just by RLS.
    const ownAccount = await b
      .from("accounts")
      .insert({ user_id: userB, name: "B wallet", type: "cash" })
      .select()
      .single();
    const intoAccountA = await b.from("transactions").insert({
      user_id: userB,
      type: "expense",
      account_id: accountA,
      amount: 1,
      currency: "RSD",
      occurred_on: "2026-10-12",
    });
    expect(intoAccountA.error).not.toBeNull();

    const withCategoryA = await b.from("transactions").insert({
      user_id: userB,
      type: "expense",
      account_id: ownAccount.data!.id,
      category_id: categoryA,
      amount: 1,
      currency: "RSD",
      occurred_on: "2026-10-12",
    });
    expect(withCategoryA.error).not.toBeNull();

    // And nothing of that landed under A.
    expect(
      (await admin.from("accounts").select("id").eq("user_id", userA).eq("name", "forged")).data,
    ).toHaveLength(0);
  }, 60000);
});
