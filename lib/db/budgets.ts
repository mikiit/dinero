import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fromDbAmount, toDbAmount } from "@/lib/money";
import { shiftMonth } from "@/lib/reports";

/** categoryId -> budget amount for one month (first-of-month ISO date). */
export async function listBudgets(
  supabase: SupabaseClient<Database>,
  userId: string,
  monthStartIso: string,
): Promise<Map<string, bigint>> {
  const { data, error } = await supabase
    .from("budgets")
    .select("category_id, amount")
    .eq("user_id", userId)
    .eq("period_month", monthStartIso);
  if (error) throw error;
  return new Map(
    (data ?? []).map((b) => [b.category_id, fromDbAmount(b.amount)]),
  );
}

/** Budgets attach to top-level expense categories only: that is the level
 * Reports rolls spending up to, so budget and spend always compare like for
 * like. */
async function assertBudgetableCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("categories")
    .select("kind, parent_id")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  if (data.kind !== "expense") {
    throw new Error("Budgets can only be set on expense categories.");
  }
  if (data.parent_id !== null) {
    throw new Error("Set the budget on the top-level category, not a sub-category.");
  }
}

/** Creates or replaces this month's budget for a category. Idempotent: the
 * (user, category, month) unique key makes a second call an update. */
export async function setBudget(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
  monthStartIso: string,
  amount: bigint,
): Promise<void> {
  if (amount < 0n) throw new Error("Budget cannot be negative.");
  await assertBudgetableCategory(supabase, userId, categoryId);

  const { error } = await supabase.from("budgets").upsert(
    {
      user_id: userId,
      category_id: categoryId,
      period_month: monthStartIso,
      amount: toDbAmount(amount),
    },
    { onConflict: "user_id,category_id,period_month" },
  );
  if (error) throw error;
}

/** Removes a budget. budgets has no deleted_at (it's a setting, not ledger
 * data), so this is a real delete - there is no money history to lose. */
export async function clearBudget(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
  monthStartIso: string,
): Promise<void> {
  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .eq("period_month", monthStartIso);
  if (error) throw error;
}

/**
 * Copies the previous month's budgets into `monthStartIso`, skipping any
 * category that already has a budget there - it never overwrites a number
 * the user typed. Returns how many were added.
 */
export async function copyPreviousMonthBudgets(
  supabase: SupabaseClient<Database>,
  userId: string,
  monthStartIso: string,
): Promise<number> {
  const [previous, current] = await Promise.all([
    listBudgets(supabase, userId, shiftMonth(monthStartIso, -1)),
    listBudgets(supabase, userId, monthStartIso),
  ]);

  const rows = [...previous.entries()]
    .filter(([categoryId]) => !current.has(categoryId))
    .map(([categoryId, amount]) => ({
      user_id: userId,
      category_id: categoryId,
      period_month: monthStartIso,
      amount: toDbAmount(amount),
    }));
  if (rows.length === 0) return 0;

  const { error } = await supabase.from("budgets").insert(rows);
  if (error) throw error;
  return rows.length;
}
