import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";

// Integration test against the LIVE linked Supabase project - proves
// supabase/migrations/20260813140100_add_category_hierarchy_trigger.sql
// actually enforces: max two levels deep (from both directions - a
// category with children can't become a child itself), a category's kind
// must match its parent's, and a parent must belong to the same user. A
// FK alone only proves parent_id references a real row.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("category hierarchy trigger (live)", () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let clientB: SupabaseClient<Database>;
  let userA: string;
  let userB: string;
  let topLevelExpense: string;
  let otherTopLevelExpense: string;

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

    const [expenseTop, otherExpenseTop] = await Promise.all([
      clientA
        .from("categories")
        .insert({ user_id: userA, name: "A-expense-top", kind: "expense" })
        .select()
        .single(),
      clientA
        .from("categories")
        .insert({ user_id: userA, name: "A-expense-top-2", kind: "expense" })
        .select()
        .single(),
    ]);
    if (expenseTop.error || !expenseTop.data) throw expenseTop.error;
    if (otherExpenseTop.error || !otherExpenseTop.data) throw otherExpenseTop.error;
    topLevelExpense = expenseTop.data.id;
    otherTopLevelExpense = otherExpenseTop.data.id;
  }, 30000);

  afterAll(async () => {
    if (!userA || !userB) return;
    await admin.from("categories").delete().in("user_id", [userA, userB]);
    await admin.auth.admin.deleteUser(userA);
    await admin.auth.admin.deleteUser(userB);
  }, 30000);

  it("allows a legitimate two-level child (matching kind, matching user)", async () => {
    const { data, error } = await clientA
      .from("categories")
      .insert({
        user_id: userA,
        name: "A-child",
        kind: "expense",
        parent_id: topLevelExpense,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.parent_id).toBe(topLevelExpense);
  });

  it("rejects a category whose kind doesn't match its parent's kind", async () => {
    const { data, error } = await clientA.from("categories").insert({
      user_id: userA,
      name: "A-mismatched-kind-child",
      kind: "income",
      parent_id: topLevelExpense,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/does not match parent kind/);
  });

  it("rejects a third level (parent already has a parent)", async () => {
    const { data: child, error: childError } = await clientA
      .from("categories")
      .insert({
        user_id: userA,
        name: "A-child-for-depth-test",
        kind: "expense",
        parent_id: topLevelExpense,
      })
      .select()
      .single();
    expect(childError).toBeNull();

    const { data, error } = await clientA.from("categories").insert({
      user_id: userA,
      name: "A-grandchild",
      kind: "expense",
      parent_id: child!.id,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/two levels deep/);
  });

  it("rejects re-parenting a category that already has children (reverse-direction depth check)", async () => {
    const { data, error } = await clientA
      .from("categories")
      .update({ parent_id: otherTopLevelExpense })
      .eq("id", topLevelExpense);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/already has children/);
  });

  it("rejects a parent belonging to another user", async () => {
    const { data, error } = await clientB.from("categories").insert({
      user_id: userB,
      name: "B-child-of-A",
      kind: "expense",
      parent_id: topLevelExpense, // belongs to A, not B
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/does not belong to user/);
  });

  it("rejects a category being its own parent", async () => {
    const { data: created, error: createError } = await clientA
      .from("categories")
      .insert({ user_id: userA, name: "A-self-parent-test", kind: "expense" })
      .select()
      .single();
    expect(createError).toBeNull();

    const { data, error } = await clientA
      .from("categories")
      .update({ parent_id: created!.id })
      .eq("id", created!.id);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/cannot be its own parent/);
  });

  it("still allows top-level categories with no parent", async () => {
    const { data, error } = await clientA
      .from("categories")
      .insert({ user_id: userA, name: "A-another-top-level", kind: "income" })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.parent_id).toBeNull();
  });
});
