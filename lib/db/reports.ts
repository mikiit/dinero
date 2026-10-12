import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fromDbAmount } from "@/lib/money";
import {
  fillMonthSeries,
  shiftMonth,
  spendByCategory,
  type MonthTotals,
  type ReportCategory,
  type SpendBreakdown,
} from "@/lib/reports";
import { scopeFilter, type Scope } from "@/lib/scope";

const PAGE_SIZE = 1000;

/** Income/expense for the 12 months ending at `endMonthIso`, from the
 * monthly_summary SQL view, zero-filled for empty months. */
export async function getMonthlySeries(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  endMonthIso: string,
): Promise<MonthTotals[]> {
  const startMonth = shiftMonth(endMonthIso, -11);
  const { data, error } = await supabase
    .from("monthly_summary")
    .select("month, income, expense")
    .filter(...scopeFilter(scope))
    .gte("month", startMonth)
    .lte("month", endMonthIso);
  if (error) throw error;

  return fillMonthSeries(
    (data ?? []).flatMap((r) =>
      r.month === null
        ? []
        : [
            {
              month: r.month,
              income: fromDbAmount(r.income ?? 0),
              expense: fromDbAmount(r.expense ?? 0),
            },
          ],
    ),
    endMonthIso,
  );
}

/**
 * Spend per top-level category for one month. Only `expense` rows: credit
 * card payments are transfers (CLAUDE.md rule 5) and adjustments are
 * corrections, so neither is spending. Archived categories are included -
 * money spent in March doesn't vanish because the category was archived
 * in May.
 */
export async function getSpendBreakdown(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  monthStartIso: string,
): Promise<SpendBreakdown> {
  const nextMonth = shiftMonth(monthStartIso, 1);

  const [categoriesRes, rows] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, parent_id")
      .filter(...scopeFilter(scope)),
    fetchMonthExpenses(supabase, scope, monthStartIso, nextMonth),
  ]);
  if (categoriesRes.error) throw categoriesRes.error;

  const categories: ReportCategory[] = categoriesRes.data.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parent_id,
  }));

  return spendByCategory(rows, categories);
}

async function fetchMonthExpenses(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  fromIso: string,
  toExclusiveIso: string,
): Promise<{ categoryId: string | null; amount: bigint }[]> {
  const out: { categoryId: string | null; amount: bigint }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, category_id, amount")
      .filter(...scopeFilter(scope))
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("occurred_on", fromIso)
      .lt("occurred_on", toExclusiveIso)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const r of data) {
      out.push({ categoryId: r.category_id, amount: fromDbAmount(r.amount) });
    }
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}
