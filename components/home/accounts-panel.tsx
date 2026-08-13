import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { utilizationPercent } from "@/lib/credit";
import type { Account } from "@/lib/db/accounts";

/** Desktop counterpart to AccountStrip - a vertical list for the dashboard
 * rail instead of a horizontal scroll-snap strip, which only makes sense
 * as a touch gesture. Same data, same Amount/"Owed" treatment. */
export function AccountsPanel({ accounts }: { accounts: Account[] }) {
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
    <ul className="space-y-3">
      {accounts.map((account) => {
        const isCredit = account.type === "credit";
        const owed = isCredit ? -account.balance : 0n;

        return (
          <li key={account.id}>
            <Link
              href="/accounts"
              className="block rounded-lg border p-3 hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{account.name}</p>
                {isCredit ? (
                  <Amount
                    value={owed}
                    size="sm"
                    tone={owed > 0n ? "expense" : "neutral"}
                  />
                ) : (
                  <Amount value={account.balance} size="sm" />
                )}
              </div>
              {isCredit && account.creditLimit != null && account.creditLimit > 0n && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-expense"
                    style={{
                      width: `${utilizationPercent(account.balance, account.creditLimit)}%`,
                    }}
                  />
                </div>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
