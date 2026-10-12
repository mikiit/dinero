import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getMonthlySeries, getSpendBreakdown } from "@/lib/db/reports";
import { monthKey, parseMonthParam } from "@/lib/reports";
import { MonthNav } from "@/components/reports/month-nav";
import { MonthSummary } from "@/components/home/month-summary";
import { CategorySpendChart } from "@/components/reports/category-spend";
import { CashFlowChart } from "@/components/reports/cash-flow-chart";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted-foreground">
          Setting up your session — refresh in a moment.
        </p>
      </main>
    );
  }

  const currentMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
  // Future months have no data; clamp rather than render an empty report.
  const requested = parseMonthParam(m);
  const month = requested && requested <= currentMonth ? requested : currentMonth;

  const [series, spend] = await Promise.all([
    getMonthlySeries(supabase, user.id, month),
    getSpendBreakdown(supabase, user.id, month),
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

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:max-w-5xl lg:p-8">
      <h1 className="font-heading text-xl font-medium">Reports</h1>

      <MonthNav monthStartIso={month} currentMonthStartIso={currentMonth} />

      <MonthSummary income={selected.income} expense={selected.expense} />

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
