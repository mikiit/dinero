import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { toCsv } from "@/lib/csv";
import { fromDbAmount, toDecimalString } from "@/lib/money";

// PostgREST caps a response at 1000 rows by default, so the export pages
// through the table instead of trusting a single select.
const PAGE_SIZE = 1000;

type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];

/**
 * Builds the full-history transactions CSV for one user. Exports every
 * non-deleted transaction, including ones on archived accounts/categories
 * (names are looked up without the archived filter, so they still resolve).
 * Amounts are plain decimals with "." (via toDecimalString), unambiguous
 * regardless of locale; the sign is carried by `type`, except adjustments,
 * which are signed in the ledger.
 */
export async function buildTransactionsCsv(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const [accountsRes, categoriesRes] = await Promise.all([
    supabase.from("accounts").select("id, name").eq("user_id", userId),
    supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("user_id", userId),
  ]);
  if (accountsRes.error) throw accountsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;

  const accountNames = new Map(accountsRes.data.map((a) => [a.id, a.name]));
  const categories = new Map(categoriesRes.data.map((c) => [c.id, c]));

  const rows: TransactionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("occurred_on", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return toCsv(rows, [
    { header: "date", value: (r) => r.occurred_on, text: false },
    { header: "type", value: (r) => r.type, text: false },
    { header: "account", value: (r) => accountNames.get(r.account_id) ?? "" },
    {
      header: "to_account",
      value: (r) => (r.to_account_id ? (accountNames.get(r.to_account_id) ?? "") : ""),
    },
    {
      header: "category",
      value: (r) => {
        const c = r.category_id ? categories.get(r.category_id) : undefined;
        if (!c) return "";
        const parent = c.parent_id ? categories.get(c.parent_id) : undefined;
        return parent ? `${parent.name} > ${c.name}` : c.name;
      },
    },
    {
      header: "amount",
      value: (r) => toDecimalString(fromDbAmount(r.amount)),
      text: false,
    },
    { header: "currency", value: (r) => r.currency, text: false },
    { header: "merchant", value: (r) => r.merchant ?? "" },
    { header: "note", value: (r) => r.note ?? "" },
  ]);
}
