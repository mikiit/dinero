import { MonthSummary } from "@/components/home/month-summary";
import type { MonthlySummary } from "@/lib/db/transactions";

/** This month's totals, one block per currency that had activity. They are
 * never added together; with a single currency it looks like before. */
export function MonthSummaries({ summaries }: { summaries: MonthlySummary[] }) {
  return (
    <div className="space-y-3">
      {summaries.map((s) => (
        <MonthSummary
          key={s.currency}
          income={s.income}
          expense={s.expense}
          currency={s.currency}
          showCurrency={summaries.length > 1}
        />
      ))}
    </div>
  );
}
