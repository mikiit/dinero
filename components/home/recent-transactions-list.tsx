import { Amount } from "@/components/ui/amount";
import {
  TransactionTypeIcon,
  transactionAmountTone,
  transferAccountLabel,
} from "@/components/transactions/transaction-type-icon";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import type { Transaction } from "@/lib/db/transactions";
import { NoTransactionsYet } from "@/components/home/no-transactions-yet";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { transferReceivedLabel } from "@/components/transactions/transaction-type-icon";

export function RecentTransactionsList({
  transactions,
  accounts,
  categories,
  canWrite = true,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  canWrite?: boolean;
}) {
  if (transactions.length === 0) {
    return <NoTransactionsYet canWrite={canWrite} />;
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <ul className="divide-y rounded-lg border">
      {transactions.map((t) => {
        const category = t.categoryId ? categoryById.get(t.categoryId) : undefined;
        const account = accountById.get(t.accountId);
        const isExpense = t.type === "expense";
        const isIncome = t.type === "income";
        const signedAmount = isExpense ? -t.amount : t.amount;

        return (
          <li key={t.id} className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category?.color ?? "#94a3b8" }}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  {category?.name ??
                    (t.type === "transfer"
                      ? "Transfer"
                      : t.type === "adjustment"
                        ? "Balance adjustment"
                        : "Uncategorized")}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {transferAccountLabel(account?.name, t.type, t.toAccountId, accountById)}
                  {transferReceivedLabel(t.type, t.toAmount, t.toAccountId, accountById)}
                </span>
              </span>
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              <TransactionTypeIcon type={t.type} />
              <Amount
                value={signedAmount}
                currency={t.currency}
                size="md"
                tone={transactionAmountTone(t.type)}
                showSign={isIncome || t.type === "adjustment"}
                showUnit={t.currency !== DEFAULT_CURRENCY}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
