import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { loadTestEnv } from "./test-env";
import { listTransactionsPage, type TransactionsCursor } from "./transactions";

// Integration test against the LIVE linked Supabase project for
// listTransactionsPage's riskiest behavior: the Transactions list groups
// by day and shows a running total per day, so a day split across two
// fetched pages would show a wrong (partial) total until the next page
// happened to load - listTransactionsPage tops up the last date on a page
// boundary with a supplemental query rather than let that happen. A small
// pageSize here forces a real mid-day boundary, which 30 real transactions
// in the app's manual page size (40) never hits.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("listTransactionsPage pagination (live)", () => {
  let admin: SupabaseClient<Database>;
  let client: SupabaseClient<Database>;
  let userId: string;
  let accountId: string;
  let categoryId: string;

  // 7 + 3 + 5 = 15 transactions across 3 days, fetched with pageSize=4 -
  // guarantees at least one page boundary lands inside the 7-transaction
  // day.
  const DAY_COUNTS = [7, 3, 5];

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    client = createClient<Database>(url!, anonKey!);

    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.user) throw error;
    userId = data.user.id;

    const { data: account, error: accountError } = await client
      .from("accounts")
      .insert({ user_id: userId, name: "Wallet", type: "cash" })
      .select()
      .single();
    if (accountError || !account) throw accountError;
    accountId = account.id;

    const { data: category, error: categoryError } = await client
      .from("categories")
      .insert({ user_id: userId, name: "Misc", kind: "expense" })
      .select()
      .single();
    if (categoryError || !category) throw categoryError;
    categoryId = category.id;

    const rows: Database["public"]["Tables"]["transactions"]["Insert"][] = [];
    DAY_COUNTS.forEach((count, dayIndex) => {
      const date = new Date();
      date.setDate(date.getDate() - dayIndex);
      const occurredOn = date.toISOString().slice(0, 10);
      for (let i = 0; i < count; i++) {
        rows.push({
          user_id: userId,
          type: "expense",
          account_id: accountId,
          category_id: categoryId,
          amount: 100 + i, // distinct amounts just to tell rows apart if needed
          currency: "RSD",
          occurred_on: occurredOn,
        });
      }
    });

    const { error: insertError } = await client.from("transactions").insert(rows);
    if (insertError) throw insertError;
  }, 30000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("transactions").delete().eq("user_id", userId);
    await admin.from("categories").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }, 30000);

  it("never splits a day across two pages, and returns every row exactly once", async () => {
    const pageSize = 4;
    let cursor: TransactionsCursor = null;
    const allIds: string[] = [];
    const pageLengths: number[] = [];
    let iterations = 0;

    do {
      const page = await listTransactionsPage(
        client,
        userId,
        {},
        cursor,
        pageSize,
      );
      pageLengths.push(page.transactions.length);
      allIds.push(...page.transactions.map((t) => t.id));
      cursor = page.nextCursor;
      iterations += 1;
      // Guard against an infinite loop if the cursor logic is broken.
      expect(iterations).toBeLessThan(20);
    } while (cursor !== null);

    // All 15 seeded rows, no duplicates, none missing.
    expect(allIds).toHaveLength(15);
    expect(new Set(allIds).size).toBe(15);

    // More than one page was actually fetched (proves this test exercises
    // pagination, not just a single fetch that happens to return everything).
    expect(pageLengths.length).toBeGreaterThan(1);

    // Re-fetch everything in one big page purely to get each row's
    // occurred_on for the day-contiguity check below.
    const full = await listTransactionsPage(client, userId, {}, null, 100);
    const idToDate = new Map(full.transactions.map((t) => [t.id, t.occurredOn]));

    // Walk the ORDER pages were actually returned in and assert each date
    // forms exactly one contiguous run - if a day were split across two
    // pages, its rows would appear as two separate runs.
    let cursor2: TransactionsCursor = null;
    const orderedDates: string[] = [];
    do {
      const page = await listTransactionsPage(client, userId, {}, cursor2, pageSize);
      orderedDates.push(...page.transactions.map((t) => idToDate.get(t.id)!));
      cursor2 = page.nextCursor;
    } while (cursor2 !== null);

    const runs: { date: string; count: number }[] = [];
    for (const date of orderedDates) {
      const last = runs[runs.length - 1];
      if (last && last.date === date) {
        last.count += 1;
      } else {
        runs.push({ date, count: 1 });
      }
    }

    expect(runs).toHaveLength(3);
    expect(runs.map((r) => r.count).sort((a, b) => b - a)).toEqual([7, 5, 3]);
  });
});
