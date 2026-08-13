import { formatRSD } from "@/lib/money";

export function MonthSummary({
  income,
  expense,
}: {
  income: bigint;
  expense: bigint;
}) {
  const net = income - expense;

  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
      <div>
        <p className="text-xs text-muted-foreground">Income</p>
        <p className="text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatRSD(income)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Expense</p>
        <p className="text-sm font-medium tabular-nums text-destructive">
          {formatRSD(expense)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Net</p>
        <p className="text-sm font-medium tabular-nums">{formatRSD(net)}</p>
      </div>
    </div>
  );
}
