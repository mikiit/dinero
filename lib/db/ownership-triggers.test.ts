import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";

// Integration test against the LIVE linked Supabase project — the ownership
// trigger (supabase/migrations/20260804190008_add_ownership_triggers.sql)
// closes a gap RLS alone doesn't cover: a foreign key only checks that a
// referenced account/category *exists*, not that it belongs to the same
// user. That's only provable by hitting real Postgres with two real
// sessions, not something a pure-function unit test can fake.
//
// Skips (rather than fails) when .env.local isn't present, so `npm test`
// still works on a machine without project credentials configured.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("ownership triggers (live)", () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let clientB: SupabaseClient<Database>;
  let userA: string;
  let userB: string;
  let accountA: string;
  let accountB: string;
  let categoryAExpense: string;
  let categoryAIncome: string;
  let categoryBExpense: string;

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

    const [accA, accB] = await Promise.all([
      clientA
        .from("accounts")
        .insert({ user_id: userA, name: "A-cash", type: "cash" })
        .select()
        .single(),
      clientB
        .from("accounts")
        .insert({ user_id: userB, name: "B-cash", type: "cash" })
        .select()
        .single(),
    ]);
    if (accA.error || !accA.data) throw accA.error;
    if (accB.error || !accB.data) throw accB.error;
    accountA = accA.data.id;
    accountB = accB.data.id;

    const [catAExpense, catAIncome, catBExpense] = await Promise.all([
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
      clientB
        .from("categories")
        .insert({ user_id: userB, name: "B-groceries", kind: "expense" })
        .select()
        .single(),
    ]);
    if (catAExpense.error || !catAExpense.data) throw catAExpense.error;
    if (catAIncome.error || !catAIncome.data) throw catAIncome.error;
    if (catBExpense.error || !catBExpense.data) throw catBExpense.error;
    categoryAExpense = catAExpense.data.id;
    categoryAIncome = catAIncome.data.id;
    categoryBExpense = catBExpense.data.id;
  }, 30000);

  afterAll(async () => {
    if (!userA || !userB) return;
    await admin.from("budgets").delete().in("user_id", [userA, userB]);
    await admin.from("transactions").delete().in("user_id", [userA, userB]);
    await admin.from("categories").delete().in("user_id", [userA, userB]);
    await admin.from("accounts").delete().in("user_id", [userA, userB]);
    await admin.auth.admin.deleteUser(userA);
    await admin.auth.admin.deleteUser(userB);
  }, 30000);

  it("allows a transaction against the user's own account and category", async () => {
    const { data, error } = await clientA
      .from("transactions")
      .insert({
        user_id: userA,
        type: "expense",
        account_id: accountA,
        category_id: categoryAExpense,
        amount: 1000,
        currency: "RSD",
        occurred_on: today,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.account_id).toBe(accountA);
  });

  it("rejects a transaction against another user's account (cross-account)", async () => {
    const { data, error } = await clientB.from("transactions").insert({
      user_id: userB,
      type: "expense",
      account_id: accountA, // belongs to A, not B
      category_id: categoryBExpense,
      amount: 500,
      currency: "RSD",
      occurred_on: today,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/does not belong to user/);
  });

  it("rejects a transaction against another user's category (cross-category)", async () => {
    const { data, error } = await clientB.from("transactions").insert({
      user_id: userB,
      type: "expense",
      account_id: accountB, // B's own account, valid
      category_id: categoryAExpense, // belongs to A, not B
      amount: 500,
      currency: "RSD",
      occurred_on: today,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/does not belong to user/);
  });

  it("rejects a transaction whose category kind doesn't match its type", async () => {
    const { data, error } = await clientA.from("transactions").insert({
      user_id: userA,
      type: "income",
      account_id: accountA,
      category_id: categoryAExpense, // kind: expense, but type: income
      amount: 500,
      currency: "RSD",
      occurred_on: today,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/does not match transaction type/);
  });

  it("allows a budget against the user's own category", async () => {
    const { data, error } = await clientA
      .from("budgets")
      .insert({
        user_id: userA,
        category_id: categoryAExpense,
        period_month: periodMonth,
        amount: 20000,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.category_id).toBe(categoryAExpense);
  });

  it("rejects a budget against another user's category (cross-user-budget)", async () => {
    const { data, error } = await clientB.from("budgets").insert({
      user_id: userB,
      category_id: categoryAExpense, // belongs to A, not B
      period_month: periodMonth,
      amount: 5000,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/does not belong to user/);
  });

  it("still allows an income transaction against a matching-kind category", async () => {
    const { data, error } = await clientA
      .from("transactions")
      .insert({
        user_id: userA,
        type: "income",
        account_id: accountA,
        category_id: categoryAIncome,
        amount: 5000,
        currency: "RSD",
        occurred_on: today,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.category_id).toBe(categoryAIncome);
  });
});
