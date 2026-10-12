import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Currency } from "@/lib/currency";
import { fromDbAmount } from "@/lib/money";
import { shiftMonth } from "@/lib/reports";
import { scopeFilter, type Scope } from "@/lib/scope";
import { countTags, spendByTag, type TagCount, type TagSpend } from "@/lib/tags";

const PAGE_SIZE = 1000;

/** Every tag in use in this ledger with how many transactions carry it, most
 * used first - for suggestions and the filter. */
export async function listTags(
  supabase: SupabaseClient<Database>,
  scope: Scope,
): Promise<TagCount[]> {
  const rows: string[][] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, tags")
      .filter(...scopeFilter(scope))
      .is("deleted_at", null)
      .not("tags", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const r of data) if (r.tags) rows.push(r.tags);
    if (data.length < PAGE_SIZE) break;
  }
  return countTags(rows);
}

/** Expense per tag for one month in one currency (see spendByTag for why the
 * figures are not additive). */
export async function getSpendByTag(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  monthStartIso: string,
  currency: Currency,
): Promise<TagSpend[]> {
  const nextMonth = shiftMonth(monthStartIso, 1);
  const rows: { tags: string[]; amount: bigint }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, amount, tags")
      .filter(...scopeFilter(scope))
      .eq("type", "expense")
      .eq("currency", currency)
      .is("deleted_at", null)
      .not("tags", "is", null)
      .gte("occurred_on", monthStartIso)
      .lt("occurred_on", nextMonth)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const r of data) {
      if (r.tags) rows.push({ tags: r.tags, amount: fromDbAmount(r.amount) });
    }
    if (data.length < PAGE_SIZE) break;
  }
  return spendByTag(rows);
}
