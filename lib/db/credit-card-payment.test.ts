import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";

// Integration test against the LIVE linked Supabase project - this is
// SPEC.md §7's Phase 2 acceptance check, made permanent: "Swipe a credit
// card for 5.000, pay it from debit; net worth changes by −5.000 total,
// not −10.000." Net worth itself is just a client-side sum of
// account_balances rows (components/home/net-worth-card.tsx), so what
// actually needs proving isn't the addition - it's that the swipe (an
// expense against the credit account) and the payment (a transfer from
// debit into that same credit account) combine, through the real
// account_balances view, to move net worth by the expense amount exactly
// once. Double-counting the payment as a second expense - or as unrelated
// income to the card - is the single most common thing expense apps get
// wrong (SPEC.md §3), and only provable against real Postgres.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("credit card payment net worth (live, SPEC.md P2)", () => {
  let admin: SupabaseClient<Database>;
  let client: SupabaseClient<Database>;
  let userId: string;
  let debitId: string;
  let creditId: string;

  const today = new Date().toISOString().slice(0, 10);
  const DEBIT_OPENING = 1_000_000; // 10,000.00 RSD
  const CREDIT_LIMIT = 2_000_000; // 20,000.00 RSD
  const SWIPE_AMOUNT = 500_000; // 5,000.00 RSD - SPEC.md §7's "5.000"
  const STARTING_NET_WORTH = DEBIT_OPENING; // credit card opens at 0

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    client = createClient<Database>(url!, anonKey!);

    const { data, error } = await signInAnonymouslyWithRetry(client);
    if (error || !data.user) throw error;
    userId = data.user.id;

    const { data: debit, error: debitError } = await client
      .from("accounts")
      .insert({
        user_id: userId,
        name: "Debit",
        type: "debit",
        opening_balance: DEBIT_OPENING,
      })
      .select()
      .single();
    if (debitError || !debit) throw debitError;
    debitId = debit.id;

    const { data: credit, error: creditError } = await client
      .from("accounts")
      .insert({
        user_id: userId,
        name: "Credit Card",
        type: "credit",
        opening_balance: 0,
        credit_limit: CREDIT_LIMIT,
      })
      .select()
      .single();
    if (creditError || !credit) throw creditError;
    creditId = credit.id;
  }, 30000);

  afterAll(async () => {
    if (!userId) return;
    await admin.from("transactions").delete().eq("user_id", userId);
    await admin.from("categories").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }, 30000);

  /** Sum of account_balances rows for just the two test accounts - the same
   * shape as NetWorthCard's client-side reduce, but reading the DB's own
   * derived balances rather than trusting local arithmetic. */
  async function netWorth(): Promise<number> {
    const { data, error } = await client
      .from("account_balances")
      .select("account_id, balance")
      .eq("user_id", userId)
      .in("account_id", [debitId, creditId]);
    if (error) throw error;
    return (data ?? []).reduce((sum, row) => sum + (row.balance ?? 0), 0);
  }

  it("swiping the card then paying it from debit moves net worth by the swipe amount once, not twice", async () => {
    expect(await netWorth()).toBe(STARTING_NET_WORTH);

    // The swipe: an expense against the credit card, not a transfer.
    const { data: category, error: categoryError } = await client
      .from("categories")
      .insert({ user_id: userId, name: "Shopping", kind: "expense" })
      .select()
      .single();
    if (categoryError || !category) throw categoryError;

    const { error: swipeError } = await client.from("transactions").insert({
      user_id: userId,
      type: "expense",
      account_id: creditId,
      category_id: category.id,
      amount: SWIPE_AMOUNT,
      currency: "RSD",
      occurred_on: today,
    });
    if (swipeError) throw swipeError;

    expect(await netWorth()).toBe(STARTING_NET_WORTH - SWIPE_AMOUNT);

    // The payment: a transfer from debit to the credit card, not a second
    // expense (CLAUDE.md rule 5 / SPEC.md §3).
    const { error: paymentError } = await client.from("transactions").insert({
      user_id: userId,
      type: "transfer",
      account_id: debitId,
      to_account_id: creditId,
      amount: SWIPE_AMOUNT,
      currency: "RSD",
      occurred_on: today,
    });
    if (paymentError) throw paymentError;

    const netWorthAfterPayment = await netWorth();

    // The acceptance check, verbatim: down by exactly one swipe, not two.
    expect(netWorthAfterPayment).toBe(STARTING_NET_WORTH - SWIPE_AMOUNT);
    expect(netWorthAfterPayment).not.toBe(STARTING_NET_WORTH - SWIPE_AMOUNT * 2);
  });
});
