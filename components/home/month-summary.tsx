import { Amount } from "@/components/ui/amount";

export function MonthSummary({
  income,
  expense,
  currency = "RSD",
  showCurrency = false,
}: {
  income: bigint;
  expense: bigint;
  currency?: string;
  /** Name the currency above the figures - for when more than one is shown. */
  showCurrency?: boolean;
}) {
  const net = income - expense;

  return (
    <div className="space-y-1">
      {showCurrency && (
        <p className="text-xs font-medium text-muted-foreground">{currency}</p>
      )}
      <div className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Income</p>
          <Amount value={income} currency={currency} size="sm" tone="income" showUnit={false} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Expense</p>
          <Amount value={expense} currency={currency} size="sm" tone="expense" showUnit={false} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Net</p>
          <Amount
            value={net}
            currency={currency}
            size="sm"
            tone={net < 0n ? "expense" : "income"}
            showUnit={false}
          />
        </div>
      </div>
    </div>
  );
}
