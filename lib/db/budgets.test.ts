import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import {
  clearBudget,
  copyPreviousMonthBudgets,
  listBudgets,
  setBudget,
} from "./budgets";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { personalScope } from "@/lib/scope";

// Live test of the budgets data layer: idempotent set, validation of what a
// budget may attach to, copy-forward that never overwrites, and per-user
// isolation through RLS.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("budgets data layer (live)", () => {
  let admin: SupabaseClient<Database>;
  let a: SupabaseClient<Database>;
  let b: SupabaseClient<Database>;
  let userA: string;
  let userB: string;
  let foodId: string;
  let rentId: string;
  let groceriesId: string; // child of food
  let salaryId: string; // income

  const SEP = "2026-09-01";
  const OCT = "2026-10-01";

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

    const mk = async (
      name: string,
      kind: "expense" | "income",
      parent_id: string | null = null,
    ) => {
      const { data, error } = await a
        .from("categories")
        .insert({ user_id: userA, name, kind, parent_id })
        .select()
        .single();
      if (error || !data) throw error;
      return data.id;
    };
    foodId = await mk("Food", "expense");
    rentId = await mk("Rent", "expense");
    groceriesId = await mk("Groceries", "expense", foodId);
    salaryId = await mk("Salary", "income");
  }, 60000);

  afterAll(async () => {
    for (const id of [userA, userB]) {
      if (!id) continue;
      await admin.from("budgets").delete().eq("user_id", id);
      await admin.from("categories").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }, 30000);

  it("setBudget is an idempotent upsert; clearBudget removes it", async () => {
    await setBudget(a, personalScope(userA), foodId, SEP, "RSD", 100000n);
    await setBudget(a, personalScope(userA), foodId, SEP, "RSD", 150000n); // second call updates
    expect((await listBudgets(a, personalScope(userA), SEP, "RSD")).get(foodId)).toBe(150000n);

    const { count } = await a
      .from("budgets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userA)
      .eq("category_id", foodId)
      .eq("period_month", SEP);
    expect(count).toBe(1);

    await clearBudget(a, personalScope(userA), foodId, SEP, "RSD");
    expect((await listBudgets(a, personalScope(userA), SEP, "RSD")).has(foodId)).toBe(false);
  }, 60000);

  it("accepts a zero budget but rejects negatives", async () => {
    await setBudget(a, personalScope(userA), rentId, SEP, "RSD", 0n);
    expect((await listBudgets(a, personalScope(userA), SEP, "RSD")).get(rentId)).toBe(0n);
    await expect(setBudget(a, personalScope(userA), rentId, SEP, "RSD", -1n)).rejects.toThrow(/negative/);
    await clearBudget(a, personalScope(userA), rentId, SEP, "RSD");
  }, 60000);

  it("only top-level expense categories can have a budget", async () => {
    await expect(setBudget(a, personalScope(userA), salaryId, SEP, "RSD", 100n)).rejects.toThrow(/expense/);
    await expect(setBudget(a, personalScope(userA), groceriesId, SEP, "RSD", 100n)).rejects.toThrow(/top-level/);
  }, 60000);

  it("copy-forward fills missing categories and never overwrites", async () => {
    await setBudget(a, personalScope(userA), foodId, SEP, "RSD", 50000n);
    await setBudget(a, personalScope(userA), rentId, SEP, "RSD", 70000n);
    await setBudget(a, personalScope(userA), foodId, OCT, "RSD", 99999n); // already set in the target

    const added = await copyPreviousMonthBudgets(a, personalScope(userA), OCT, "RSD");
    expect(added).toBe(1); // only Rent

    const oct = await listBudgets(a, personalScope(userA), OCT, "RSD");
    expect(oct.get(foodId)).toBe(99999n); // untouched
    expect(oct.get(rentId)).toBe(70000n);

    expect(await copyPreviousMonthBudgets(a, personalScope(userA), OCT, "RSD")).toBe(0); // idempotent
  }, 60000);

  it("another user sees none of these budgets, and cannot write to this user's categories", async () => {
    expect((await listBudgets(b, personalScope(userB), SEP, "RSD")).size).toBe(0);
    expect((await listBudgets(b, personalScope(userB), OCT, "RSD")).size).toBe(0);
    // Reading A's rows by A's id through B's session returns nothing (RLS).
    expect((await listBudgets(b, personalScope(userA), SEP, "RSD")).size).toBe(0);
    await expect(setBudget(b, personalScope(userB), foodId, SEP, "RSD", 1n)).rejects.toThrow();
  }, 60000);
});
