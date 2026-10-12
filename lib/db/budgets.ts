import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Currency } from "@/lib/currency";
import { fromDbAmount, toDbAmount } from "@/lib/money";
import { shiftMonth } from "@/lib/reports";
import { scopeColumns, scopeFilter, type Scope } from "@/lib/scope";

/** categoryId -> budget amount for one month (first-of-month ISO date) in
 * one currency. */
export async function listBudgets(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  monthStartIso: string,
  currency: Currency,
): Promise<Map<string, bigint>> {
  const { data, error } = await supabase
    .from("budgets")
    .select("category_id, amount")
    .filter(...scopeFilter(scope))
    .eq("period_month", monthStartIso)
    .eq("currency", currency);
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
  scope: Scope,
  categoryId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("categories")
    .select("kind, parent_id")
    .eq("id", categoryId)
    .filter(...scopeFilter(scope))
    .single();
  if (error) throw error;
  if (data.kind !== "expense") {
    throw new Error("Budgets can only be set on expense categories.");
  }
  if (data.parent_id !== null) {
    throw new Error("Set the budget on the top-level category, not a sub-category.");
  }
}

const UNIQUE_VIOLATION = "23505";

/** Updates a budget that already exists; returns whether one did. */
async function updateExistingBudget(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  categoryId: string,
  monthStartIso: string,
  currency: Currency,
  amount: bigint,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("budgets")
    .update({ amount: toDbAmount(amount) })
    .filter(...scopeFilter(scope))
    .eq("category_id", categoryId)
    .eq("period_month", monthStartIso)
    .eq("currency", currency)
    .select("id");
  if (error) throw error;
  return data.length > 0;
}

/**
 * Creates or replaces this month's budget for a category in this ledger.
 * Idempotent: a ledger holds at most one budget per (category, month), so a
 * second call updates the first.
 *
 * Update-then-insert rather than an ON CONFLICT upsert: the uniqueness is
 * enforced by two PARTIAL unique indexes (personal vs. space), and an
 * ON CONFLICT column list cannot infer a partial index. If two requests race
 * and both find nothing to update, the loser's INSERT hits the index
 * (23505) and simply updates what the winner inserted.
 */
export async function setBudget(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  categoryId: string,
  monthStartIso: string,
  currency: Currency,
  amount: bigint,
): Promise<void> {
  if (amount < 0n) throw new Error("Budget cannot be negative.");
  await assertBudgetableCategory(supabase, scope, categoryId);

  if (await updateExistingBudget(supabase, scope, categoryId, monthStartIso, currency, amount)) {
    return;
  }

  const { error } = await supabase.from("budgets").insert({
    ...scopeColumns(scope),
    category_id: categoryId,
    period_month: monthStartIso,
    currency,
    amount: toDbAmount(amount),
  });
  if (!error) return;
  if (error.code !== UNIQUE_VIOLATION) throw error;

  await updateExistingBudget(supabase, scope, categoryId, monthStartIso, currency, amount);
}

/** Removes a budget. budgets has no deleted_at (it's a setting, not ledger
 * data), so this is a real delete - there is no money history to lose. */
export async function clearBudget(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  categoryId: string,
  monthStartIso: string,
  currency: Currency,
): Promise<void> {
  const { error } = await supabase
    .from("budgets")
    .delete()
    .filter(...scopeFilter(scope))
    .eq("category_id", categoryId)
    .eq("period_month", monthStartIso)
    .eq("currency", currency);
  if (error) throw error;
}

/**
 * Copies the previous month's budgets into `monthStartIso`, skipping any
 * category that already has a budget there - it never overwrites a number
 * the user typed. Returns how many were added.
 */
export async function copyPreviousMonthBudgets(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  monthStartIso: string,
  currency: Currency,
): Promise<number> {
  const [previous, current] = await Promise.all([
    listBudgets(supabase, scope, shiftMonth(monthStartIso, -1), currency),
    listBudgets(supabase, scope, monthStartIso, currency),
  ]);

  const rows = [...previous.entries()]
    .filter(([categoryId]) => !current.has(categoryId))
    .map(([categoryId, amount]) => ({
      ...scopeColumns(scope),
      category_id: categoryId,
      period_month: monthStartIso,
      currency,
      amount: toDbAmount(amount),
    }));
  if (rows.length === 0) return 0;

  const { error } = await supabase.from("budgets").insert(rows);
  if (error) throw error;
  return rows.length;
}
