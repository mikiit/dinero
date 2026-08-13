import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRSD } from "@/lib/money";
import type { Account } from "@/lib/db/accounts";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { ArchiveAccountButton } from "@/components/accounts/archive-account-button";

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
      {accounts.map((account) => (
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
                  {formatRSD(account.balance)}
                </p>
                {account.type === "credit" && account.creditLimit != null && (
                  <p className="text-xs text-muted-foreground">
                    Limit {formatRSD(account.creditLimit)}
                  </p>
                )}
              </div>
            </CardHeader>
            {account.type === "credit" &&
              (account.statementDay != null || account.dueDay != null) && (
                <CardContent className="flex gap-4 text-xs text-muted-foreground">
                  {account.statementDay != null && (
                    <span>Statement day {account.statementDay}</span>
                  )}
                  {account.dueDay != null && <span>Due day {account.dueDay}</span>}
                </CardContent>
              )}
            <CardContent className="flex justify-end gap-2 pt-0">
              <AccountDialog account={account} />
              <ArchiveAccountButton accountId={account.id} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
