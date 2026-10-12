import { format, parseISO } from "date-fns";
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

/** Desktop counterpart to RecentTransactionsList - same data, same
 * Amount/TransactionTypeIcon primitives, but a real <table> instead of a
 * card list: density is the whole point of a dashboard's main column. */
export function RecentTransactionsTable({
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
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          <th className="w-24 py-2 font-medium">Date</th>
          <th className="py-2 font-medium">Description</th>
          <th className="py-2 font-medium">Account</th>
          <th className="py-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((t) => {
          const category = t.categoryId ? categoryById.get(t.categoryId) : undefined;
          const account = accountById.get(t.accountId);
          const isExpense = t.type === "expense";
          const isIncome = t.type === "income";
          const signedAmount = isExpense ? -t.amount : t.amount;

          return (
            <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
              <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                {format(parseISO(t.occurredOn), "d MMM")}
              </td>
              <td className="py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: category?.color ?? "#94a3b8" }}
                  />
                  <span className="truncate">
                    {category?.name ??
                      (t.type === "transfer"
                        ? "Transfer"
                        : t.type === "adjustment"
                          ? "Balance adjustment"
                          : "Uncategorized")}
                  </span>
                </span>
              </td>
              <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                {transferAccountLabel(account?.name, t.type, t.toAccountId, accountById)}
              </td>
              <td className="py-2.5 text-right">
                <span className="inline-flex items-center gap-1.5">
                  <TransactionTypeIcon type={t.type} />
                  <Amount
                    value={signedAmount}
                currency={t.currency}
                    size="sm"
                    tone={transactionAmountTone(t.type)}
                    showSign={isIncome || t.type === "adjustment"}
                    showUnit={t.currency !== DEFAULT_CURRENCY}
                  />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
