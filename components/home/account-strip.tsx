import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { utilizationPercent } from "@/lib/credit";
import type { Account } from "@/lib/db/accounts";

export function AccountStrip({ accounts }: { accounts: Account[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/accounts" className="underline">
          Add an account
        </Link>{" "}
        to get started.
      </p>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {accounts.map((account) => {
        const isCredit = account.type === "credit";
        const owed = isCredit ? -account.balance : 0n;

        return (
          <Link
            key={account.id}
            href="/accounts"
            className="w-64 shrink-0 rounded-lg border p-3"
          >
            <p className="truncate text-sm font-medium">{account.name}</p>

            {isCredit ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">Owed</p>
                <Amount
                  value={owed}
                  size="lg"
                  tone={owed > 0n ? "expense" : "neutral"}
                  className="mt-0.5"
                />
                {account.creditLimit != null && account.creditLimit > 0n && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-expense"
                        style={{
                          width: `${utilizationPercent(account.balance, account.creditLimit)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Limit{" "}
                      <Amount
                        value={account.creditLimit}
                        size="sm"
                        tone="muted"
                        className="text-xs"
                      />
                    </p>
                  </div>
                )}
              </>
            ) : (
              <Amount value={account.balance} size="lg" className="mt-1" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
