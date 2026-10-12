import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { getMonthlySeries, getSpendBreakdown } from "@/lib/db/reports";
import { listCategories } from "@/lib/db/categories";
import { listBudgets } from "@/lib/db/budgets";
import { budgetProgress } from "@/lib/budgets";
import { monthKey, parseMonthParam } from "@/lib/reports";
import { MonthNav } from "@/components/reports/month-nav";
import { MonthSummary } from "@/components/home/month-summary";
import { CategorySpendChart } from "@/components/reports/category-spend";
import { CashFlowChart } from "@/components/reports/cash-flow-chart";
import {
  BudgetProgressList,
  type BudgetProgressRow,
} from "@/components/reports/budget-progress";
import { getContext } from "@/lib/context";
import { redirect } from "next/navigation";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;

  const ctx = await getContext();

  if (!ctx) redirect("/login");

  const { supabase, scope } = ctx;

  const currentMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
  // Future months have no data; clamp rather than render an empty report.
  const requested = parseMonthParam(m);
  const month = requested && requested <= currentMonth ? requested : currentMonth;

  const [series, spend, categories, budgets] = await Promise.all([
    getMonthlySeries(supabase, scope, month),
    getSpendBreakdown(supabase, scope, month),
    listCategories(supabase, scope),
    listBudgets(supabase, scope, month),
  ]);
  const selected = series[series.length - 1];

  const monthEnd = format(endOfMonth(parseISO(month)), "yyyy-MM-dd");
  const hrefs = spend.items.map((item) => {
    const params = new URLSearchParams({
      type: "expense",
      from: month,
      to: monthEnd,
    });
    if (item.categoryId) params.set("category", item.categoryId);
    else params.set("uncategorized", "1");
    return `/transactions?${params.toString()}`;
  });

  const budgetCtx = {
    monthStartIso: month,
    todayIso: format(new Date(), "yyyy-MM-dd"),
  };
  const spentById = new Map(
    spend.items.flatMap((i) => (i.categoryId ? [[i.categoryId, i.total] as const] : [])),
  );
  const budgetRows: BudgetProgressRow[] = categories
    .filter((c) => budgets.has(c.id))
    .map((c) => ({
      key: c.id,
      name: c.name,
      progress: budgetProgress(budgets.get(c.id)!, spentById.get(c.id) ?? 0n, budgetCtx),
    }));
  // The total only compares budgeted categories, so unbudgeted spending
  // (which has no limit to exceed) can't make it look overspent.
  const totalRow: BudgetProgressRow | null =
    budgetRows.length > 1
      ? {
          key: "total",
          name: "Total budgeted",
          progress: budgetProgress(
            budgetRows.reduce((s, r) => s + r.progress.budget, 0n),
            budgetRows.reduce((s, r) => s + r.progress.spent, 0n),
            budgetCtx,
          ),
        }
      : null;

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:max-w-5xl lg:p-8">
      <h1 className="font-heading text-xl font-medium">Reports</h1>

      <MonthNav monthStartIso={month} currentMonthStartIso={currentMonth} />

      <MonthSummary income={selected.income} expense={selected.expense} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Budgets</h2>
        <BudgetProgressList
          total={totalRow}
          rows={budgetRows}
          editHref={`/budgets?m=${monthKey(month)}`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Spending by category
          </h2>
          <CategorySpendChart
            key={monthKey(month)}
            total={spend.total}
            items={spend.items}
            hrefs={hrefs}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Income vs. expense, last 12 months
          </h2>
          <CashFlowChart series={series} selectedMonthIso={month} />
        </section>
      </div>
    </main>
  );
}
