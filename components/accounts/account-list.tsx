import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRSD } from "@/lib/money";
import { utilizationPercent } from "@/lib/credit";
import type { Account } from "@/lib/db/accounts";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { ArchiveAccountButton } from "@/components/accounts/archive-account-button";
import { SetBalanceDialog } from "@/components/accounts/set-balance-dialog";

const ACCOUNT_TYPE_LABELS: Record<Account["type"], string> = {
  cash: "Cash",
  debit: "Debit card",
  credit: "Credit card",
  savings: "Savings",
};

export function AccountList({ accounts }: { accounts: Account[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No accounts yet. Add your first one to get started.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {accounts.map((account) => {
        const isCredit = account.type === "credit";

        return (
          <li key={account.id}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>{account.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {ACCOUNT_TYPE_LABELS[account.type]}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-medium tabular-nums">
                    {isCredit
                      ? `Owed: ${formatRSD(-account.balance)}`
                      : formatRSD(account.balance)}
                  </p>
                  {isCredit && account.creditLimit != null && (
                    <p className="text-xs text-muted-foreground">
                      Limit {formatRSD(account.creditLimit)}
                    </p>
                  )}
                </div>
              </CardHeader>
              {isCredit && account.creditLimit != null && account.creditLimit > 0n && (
                <CardContent className="pt-0">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-destructive"
                      style={{
                        width: `${utilizationPercent(account.balance, account.creditLimit)}%`,
                      }}
                    />
                  </div>
                </CardContent>
              )}
              {isCredit &&
                (account.statementDay != null || account.dueDay != null) && (
                  <CardContent className="flex gap-4 pt-0 text-xs text-muted-foreground">
                    {account.statementDay != null && (
                      <span>Statement day {account.statementDay}</span>
                    )}
                    {account.dueDay != null && (
                      <span>Due day {account.dueDay}</span>
                    )}
                  </CardContent>
                )}
              <CardContent className="flex flex-wrap justify-end gap-2 pt-0">
                <SetBalanceDialog account={account} />
                <AccountDialog account={account} />
                <ArchiveAccountButton accountId={account.id} />
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
