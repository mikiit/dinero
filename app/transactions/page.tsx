import { listAccounts } from "@/lib/db/accounts";
import { listCategories, type Category } from "@/lib/db/categories";
import type { AnyTransactionType, TransactionFilters } from "@/lib/db/transactions";
import { TransactionList } from "@/components/transactions/transaction-list";
import { getContext } from "@/lib/context";
import { redirect } from "next/navigation";

const TYPES: readonly AnyTransactionType[] = [
  "expense",
  "income",
  "transfer",
  "adjustment",
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Filters from a link (Reports' drill-down). Anything malformed is simply
 * dropped - a bad param must never break the page or reach a query. */
function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
  categories: Category[],
): TransactionFilters {
  const one = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : undefined;
  };
  const filters: TransactionFilters = {};

  const type = one("type");
  if (type && (TYPES as readonly string[]).includes(type)) {
    filters.type = type as AnyTransactionType;
  }
  const from = one("from");
  if (from && DATE.test(from)) filters.dateFrom = from;
  const to = one("to");
  if (to && DATE.test(to)) filters.dateTo = to;

  const category = one("category");
  if (category && categories.some((c) => c.id === category)) {
    filters.categoryId = category;
  } else if (one("uncategorized") === "1") {
    filters.uncategorized = true;
  }
  return filters;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getContext();

  if (!ctx) redirect("/login");

  const { supabase, scope } = ctx;

  const [accounts, categories] = await Promise.all([
    listAccounts(supabase, scope),
    listCategories(supabase, scope),
  ]);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 lg:max-w-5xl lg:p-8">
      <h1 className="font-heading text-xl font-medium">Transactions</h1>
      <TransactionList
        accounts={accounts}
        categories={categories}
        initialFilters={filtersFromSearchParams(params, categories)}
      />
    </main>
  );
}
