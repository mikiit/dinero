import { Amount } from "@/components/ui/amount";

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
        <Amount value={income} size="sm" tone="income" showUnit={false} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Expense</p>
        <Amount value={expense} size="sm" tone="expense" showUnit={false} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Net</p>
        <Amount
          value={net}
          size="sm"
          tone={net < 0n ? "expense" : "income"}
          showUnit={false}
        />
      </div>
    </div>
  );
}
