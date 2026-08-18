import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";

// Integration test against the LIVE linked Supabase project - proves
// supabase/migrations/20260814120000_create_monthly_summary_view.sql was
// actually applied with `security_invoker = true`, the same way
// account_balances is. A view's SQL text on disk isn't proof of what's
// live: without security_invoker, the view would run as its owner and
// bypass the querying user's RLS on `transactions`, leaking other users'
// month totals to anyone who guesses their user_id. That's only provable
// by hitting real Postgres with two real sessions, not by reading the
// migration file.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("monthly_summary view security_invoker (live)", () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let clientB: SupabaseClient<Database>;
  let userA: string;
  let userB: string;

  const today = new Date().toISOString().slice(0, 10);
  const periodMonth = `${today.slice(0, 7)}-01`;

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    clientA = createClient<Database>(url!, anonKey!);
    clientB = createClient<Database>(url!, anonKey!);

    const [sessionA, sessionB] = await Promise.all([
      signInAnonymouslyWithRetry(clientA),
      signInAnonymouslyWithRetry(clientB),
    ]);
    if (sessionA.error || !sessionA.data.user) throw sessionA.error;
    if (sessionB.error || !sessionB.data.user) throw sessionB.error;
    userA = sessionA.data.user.id;
    userB = sessionB.data.user.id;

    const { data: account, error: accountError } = await clientA
      .from("accounts")
      .insert({ user_id: userA, name: "A-cash", type: "cash" })
      .select()
      .single();
    if (accountError || !account) throw accountError;

    const [expenseCategory, incomeCategory] = await Promise.all([
      clientA
        .from("categories")
        .insert({ user_id: userA, name: "A-groceries", kind: "expense" })
        .select()
        .single(),
      clientA
        .from("categories")
        .insert({ user_id: userA, name: "A-salary", kind: "income" })
        .select()
        .single(),
    ]);
    if (expenseCategory.error || !expenseCategory.data) throw expenseCategory.error;
    if (incomeCategory.error || !incomeCategory.data) throw incomeCategory.error;

    const [expenseTxn, incomeTxn] = await Promise.all([
      clientA.from("transactions").insert({
        user_id: userA,
        type: "expense",
        account_id: account.id,
        category_id: expenseCategory.data.id,
        amount: 123456,
        currency: "RSD",
        occurred_on: today,
      }),
      clientA.from("transactions").insert({
        user_id: userA,
        type: "income",
        account_id: account.id,
        category_id: incomeCategory.data.id,
        amount: 789000,
        currency: "RSD",
        occurred_on: today,
      }),
    ]);
    if (expenseTxn.error) throw expenseTxn.error;
    if (incomeTxn.error) throw incomeTxn.error;
  }, 30000);

  afterAll(async () => {
    if (!userA || !userB) return;
    await admin.from("transactions").delete().in("user_id", [userA, userB]);
    await admin.from("categories").delete().in("user_id", [userA, userB]);
    await admin.from("accounts").delete().in("user_id", [userA, userB]);
    await admin.auth.admin.deleteUser(userA);
    await admin.auth.admin.deleteUser(userB);
  }, 30000);

  it("lets a user read their own month totals through the view", async () => {
    const { data, error } = await clientA
      .from("monthly_summary")
      .select("income, expense")
      .eq("user_id", userA)
      .eq("month", periodMonth)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.expense).toBe(123456);
    expect(data?.income).toBe(789000);
  });

  it("hides another user's month totals even when their user_id is known and requested directly", async () => {
    const { data, error } = await clientB
      .from("monthly_summary")
      .select("income, expense")
      .eq("user_id", userA) // A's id, guessed/known by B - not B's own
      .eq("month", periodMonth)
      .maybeSingle();

    // No error: PostgREST returns zero matching rows, not a permission
    // error, because RLS makes the row invisible rather than forbidden.
    // A null row here (not A's real 123456/789000 totals) is exactly what
    // proves security_invoker=true is live - if the view ran as its
    // owner instead, B's query would successfully return A's real sums.
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
