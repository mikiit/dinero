import { formatRSD } from "@/lib/money";
import type { Account } from "@/lib/db/accounts";

export function NetWorthCard({ accounts }: { accounts: Account[] }) {
  const netWorth = accounts
    .filter((a) => a.includeInNetWorth)
    .reduce((sum, a) => sum + a.balance, 0n);

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">Net worth</p>
      <p className="text-3xl font-semibold tabular-nums">{formatRSD(netWorth)}</p>
    </div>
  );
}
