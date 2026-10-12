import { Amount } from "@/components/ui/amount";
import type { Account } from "@/lib/db/accounts";
import { DEFAULT_CURRENCY, sumByCurrency } from "@/lib/currency";

/** Net worth is a total per currency - there is no exchange rate here, so
 * RSD and EUR are never added into one figure. With a single currency this
 * is the one big number it always was. */
export function NetWorthCard({ accounts }: { accounts: Account[] }) {
  const totals = sumByCurrency(
    accounts.filter((a) => a.includeInNetWorth),
    (a) => a.currency,
    (a) => a.balance,
  );
  const shown = totals.length > 0 ? totals : [{ currency: DEFAULT_CURRENCY, total: 0n }];

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">Net worth</p>
      <div className="space-y-0.5">
        {shown.map(({ currency, total }, i) => (
          <div key={currency}>
            <Amount
              value={total}
              currency={currency}
              size={i === 0 ? "hero" : "lg"}
              tone={total < 0n ? "expense" : "neutral"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
