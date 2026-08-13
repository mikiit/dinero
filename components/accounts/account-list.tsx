import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
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
        const owed = isCredit ? -account.balance : 0n;

        return (
          <li key={account.id}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="truncate">{account.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {ACCOUNT_TYPE_LABELS[account.type]}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {isCredit ? (
                    <>
                      <p className="text-xs text-muted-foreground">Owed</p>
                      <Amount
                        value={owed}
                        size="lg"
                        tone={owed > 0n ? "expense" : "neutral"}
                      />
                    </>
                  ) : (
                    <Amount value={account.balance} size="lg" />
                  )}
                  {isCredit && account.creditLimit != null && (
                    <p className="text-xs text-muted-foreground">
                      Limit{" "}
                      <Amount value={account.creditLimit} size="sm" tone="muted" />
                    </p>
                  )}
                </div>
              </CardHeader>
              {isCredit && account.creditLimit != null && account.creditLimit > 0n && (
                <CardContent className="pt-0">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-expense"
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
