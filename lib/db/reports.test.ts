import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { getMonthlySeries, getSpendBreakdown } from "./reports";
import {
  listTransactionsPage,
  type Transaction,
  type TransactionFilters,
} from "./transactions";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { personalScope } from "@/lib/scope";

// Live test of the Reports data layer. The property that matters most for a
// finance report: the per-category breakdown must sum to the SAME number the
// SQL monthly_summary view reports as the month's expense - two independent
// paths to one figure. Also: credit card payments (transfers) and balance
// adjustments must not count as spending, and 1001 rows must cross the
// 1000-row page boundary without losing the last one.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("reports data layer (live)", () => {
  let admin: SupabaseClient<Database>;
  let client: SupabaseClient<Database>;
  let userId: string;
  let foodId: string;
  let grocId: string;
  let rentId: string;

  const MONTH = "2026-03-01";

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    client = createClient<Database>(url!, anonKey!);

    const { data, error } = await signInAnonymouslyWithRetry(client);
    if (error || !data.user) throw error;
    userId = data.user.id;

    const { data: wallet } = await client
      .from("accounts")
      .insert({ user_id: userId, name: "Wallet", type: "cash" })
      .select()
      .single();
    const { data: card } = await client
      .from("accounts")
      .insert({ user_id: userId, name: "Card", type: "credit" })
      .select()
      .single();
    if (!wallet || !card) throw new Error("account seed failed");

    const { data: food } = await client
      .from("categories")
      .insert({ user_id: userId, name: "Food", kind: "expense" })
      .select()
      .single();
    if (!food) throw new Error("category seed failed");
    foodId = food.id;
    const { data: groc } = await client
      .from("categories")
      .insert({
        user_id: userId,
        name: "Groceries",
        kind: "expense",
        parent_id: foodId,
      })
      .select()
      .single();
    // Archived on purpose: money spent must not vanish when a category is.
    const { data: rent } = await client
      .from("categories")
      .insert({
        user_id: userId,
        name: "Rent",
        kind: "expense",
        archived_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (!groc || !rent) throw new Error("category seed failed");
    grocId = groc.id;
    rentId = rent.id;

    const base = { user_id: userId, currency: "RSD", account_id: wallet.id };
    const rows = [
      // 1001 small child-category expenses in March: crosses the page size.
      ...Array.from({ length: 1001 }, () => ({
        ...base,
        type: "expense" as const,
        category_id: grocId,
        amount: 100,
        occurred_on: "2026-03-10",
      })),
      { ...base, type: "expense" as const, category_id: foodId, amount: 5000, occurred_on: "2026-03-31" },
      { ...base, type: "expense" as const, category_id: rentId, amount: 70000, occurred_on: "2026-03-01" },
      { ...base, type: "expense" as const, category_id: null, amount: 300, occurred_on: "2026-03-15" },
      // Boundary neighbours that must NOT land in March.
      { ...base, type: "expense" as const, category_id: foodId, amount: 999, occurred_on: "2026-02-28" },
      { ...base, type: "expense" as const, category_id: foodId, amount: 888, occurred_on: "2026-04-01" },
      // Not spending: card payment (transfer), income, balance adjustment.
      { ...base, type: "transfer" as const, to_account_id: card.id, amount: 40000, occurred_on: "2026-03-20" },
      { ...base, type: "income" as const, category_id: null, amount: 90000, occurred_on: "2026-03-02" },
      { ...base, type: "adjustment" as const, amount: -1234, occurred_on: "2026-03-05" },
      // Soft-deleted: must not count.
      { ...base, type: "expense" as const, category_id: foodId, amount: 777, occurred_on: "2026-03-12", deleted_at: new Date().toISOString() },
    ];
    const { error: insertError } = await client.from("transactions").insert(rows);
    if (insertError) throw insertError;
  }, 90000);

  afterAll(async () => {
    if (!userId) return;
    await admin.from("transactions").delete().eq("user_id", userId);
    await admin.from("categories").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }, 30000);

  // 1001*100 + 5000 + 70000 + 300
  const EXPECTED_MARCH = 175400n;

  it("breakdown rolls children into parents and counts only March expenses", async () => {
    const r = await getSpendBreakdown(client, personalScope(userId), MONTH);
    expect(r.total).toBe(EXPECTED_MARCH);
    expect(r.items.map((i) => [i.name, i.total])).toEqual([
      ["Food", 105100n], // 1001*100 (Groceries) + 5000 (Food)
      ["Rent", 70000n], // archived category still reported
      ["Uncategorized", 300n],
    ]);
  }, 60000);

  it("breakdown total equals the SQL monthly_summary expense for that month", async () => {
    const breakdown = await getSpendBreakdown(client, personalScope(userId), MONTH);
    const series = await getMonthlySeries(client, personalScope(userId), MONTH);
    const march = series[series.length - 1];
    expect(march.month).toBe(MONTH);
    expect(breakdown.total).toBe(march.expense);
    expect(march.income).toBe(90000n);
  }, 60000);

  it("12-month series is contiguous and zero-filled", async () => {
    const series = await getMonthlySeries(client, personalScope(userId), "2026-06-01");
    expect(series).toHaveLength(12);
    expect(series[0].month).toBe("2025-07-01");
    const feb = series.find((m) => m.month === "2026-02-01")!;
    expect(feb.expense).toBe(999n);
    expect(series.find((m) => m.month === "2025-12-01")!.expense).toBe(0n);
  }, 60000);

  /** Walks the cursor pages the way the real list does (PostgREST caps one
   * response at 1000 rows, so a single huge page can't be requested). */
  async function allPages(filters: TransactionFilters): Promise<Transaction[]> {
    const out: Transaction[] = [];
    let cursor = null as Awaited<ReturnType<typeof listTransactionsPage>>["nextCursor"];
    do {
      const page = await listTransactionsPage(client, personalScope(userId), filters, cursor, 400);
      out.push(...page.transactions);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  }

  it("Transactions' category filter includes sub-categories; uncategorized works", async () => {
    const march = { dateFrom: "2026-03-01", dateTo: "2026-03-31", type: "expense" as const };

    const parent = await allPages({ ...march, categoryId: foodId });
    expect(parent).toHaveLength(1001 + 1); // children + the parent's own row

    const child = await allPages({ ...march, categoryId: grocId });
    expect(child).toHaveLength(1001);

    const none = await allPages({ ...march, uncategorized: true });
    expect(none.map((t) => t.amount)).toEqual([300n]);
  }, 60000);
});
