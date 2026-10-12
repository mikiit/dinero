import type { SupabaseClient } from "@supabase/supabase-js";
import { format, subDays } from "date-fns";
import type { Database } from "@/lib/database.types";
import { fromDbAmount } from "@/lib/money";
import { buildQuickTemplates, type QuickTemplate } from "@/lib/quick-templates";
import { scopeFilter, type Scope } from "@/lib/scope";

/** How far back "what you usually enter" looks. Long enough to catch a
 * monthly subscription twice, short enough that a habit you dropped fades. */
const WINDOW_DAYS = 120;
const MAX_ROWS = 500;

/**
 * Quick-add suggestions for the active ledger, derived from recent
 * expenses and income (transfers and balance adjustments are not things you
 * "repeat"). Deleted rows are excluded like everywhere else.
 */
export async function listQuickTemplates(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  now: Date = new Date(),
): Promise<QuickTemplate[]> {
  const since = format(subDays(now, WINDOW_DAYS), "yyyy-MM-dd");

  const { data, error } = await supabase
    .from("transactions")
    .select("type, account_id, category_id, amount, note, occurred_on")
    .filter(...scopeFilter(scope))
    .is("deleted_at", null)
    .in("type", ["expense", "income"])
    .gte("occurred_on", since)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;

  return buildQuickTemplates(
    (data ?? []).map((r) => ({
      type: r.type as "expense" | "income",
      accountId: r.account_id,
      categoryId: r.category_id,
      amount: fromDbAmount(r.amount),
      note: r.note,
      occurredOn: r.occurred_on,
    })),
  );
}
