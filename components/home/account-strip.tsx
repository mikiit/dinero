import Link from "next/link";
import { formatRSD } from "@/lib/money";
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

        return (
          <Link
            key={account.id}
            href="/accounts"
            className="w-56 shrink-0 rounded-lg border p-3"
          >
            <p className="truncate text-sm font-medium">{account.name}</p>

            {isCredit ? (
              <>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  Owed: {formatRSD(-account.balance)}
                </p>
                {account.creditLimit != null && account.creditLimit > 0n && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-destructive"
                        style={{
                          width: `${utilizationPercent(account.balance, account.creditLimit)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Limit {formatRSD(account.creditLimit)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatRSD(account.balance)}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
