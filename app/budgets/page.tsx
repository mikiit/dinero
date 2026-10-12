import { format, startOfMonth } from "date-fns";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { currenciesInUse, isCurrency } from "@/lib/currency";
import { CurrencyTabs } from "@/components/reports/currency-tabs";
import { listBudgets } from "@/lib/db/budgets";
import { getSpendBreakdown } from "@/lib/db/reports";
import { parseMonthParam } from "@/lib/reports";
import { MonthNav } from "@/components/reports/month-nav";
import { BudgetEditor, type BudgetRowData } from "@/components/budgets/budget-editor";
import { getContext } from "@/lib/context";
import { redirect } from "next/navigation";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; c?: string }>;
}) {
  const { m, c } = await searchParams;

  const ctx = await getContext();

  if (!ctx) redirect("/login");

  const { supabase, scope } = ctx;

  // Unlike Reports, budgets can be planned for next month, so only the
  // current month is the default - future months are not clamped away.
  const currentMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const month = parseMonthParam(m) ?? currentMonth;

  const accounts = await listAccounts(supabase, scope);
  const currencies = currenciesInUse([
    ...accounts.map((a) => a.currency),
    ...(isCurrency(c) ? [c] : []),
  ]);
  const currency = isCurrency(c) ? c : currencies[0];

  const [categories, budgets, spend] = await Promise.all([
    listCategories(supabase, scope),
    listBudgets(supabase, scope, month, currency),
    getSpendBreakdown(supabase, scope, month, currency),
  ]);

  const spentById = new Map(
    spend.items.flatMap((i) => (i.categoryId ? [[i.categoryId, i.total] as const] : [])),
  );

  const rows: BudgetRowData[] = categories
    .filter((c) => c.kind === "expense" && c.parentId === null)
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      budget: budgets.get(c.id) ?? null,
      spent: spentById.get(c.id) ?? 0n,
    }));

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:max-w-xl lg:p-8">
      <h1 className="font-heading text-xl font-medium">Budgets</h1>

      <MonthNav
        monthStartIso={month}
        currentMonthStartIso={currentMonth}
        basePath="/budgets"
        allowFuture
        currency={currency}
      />

      <CurrencyTabs
        currencies={currencies}
        selected={currency}
        monthStartIso={month}
        basePath="/budgets"
      />

      <BudgetEditor
        rows={rows}
        monthStartIso={month}
        currency={currency}
        readOnly={!ctx.canWrite}
      />
    </main>
  );
}
