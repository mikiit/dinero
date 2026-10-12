import { format, startOfMonth } from "date-fns";
import { listCategories } from "@/lib/db/categories";
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
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;

  const ctx = await getContext();

  if (!ctx) redirect("/login");

  const { supabase, scope } = ctx;

  // Unlike Reports, budgets can be planned for next month, so only the
  // current month is the default - future months are not clamped away.
  const currentMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const month = parseMonthParam(m) ?? currentMonth;

  const [categories, budgets, spend] = await Promise.all([
    listCategories(supabase, scope),
    listBudgets(supabase, scope, month),
    getSpendBreakdown(supabase, scope, month),
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
      />

      <BudgetEditor rows={rows} monthStartIso={month} readOnly={!ctx.canWrite} />
    </main>
  );
}
