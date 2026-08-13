import { formatRSD } from "@/lib/money";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import type { Transaction } from "@/lib/db/transactions";

export function RecentTransactionsList({
  transactions,
  accounts,
  categories,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
}) {
  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
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
                  {account?.name ?? "Unknown account"}
                </span>
              </span>
            </div>
            <span
              className={
                "shrink-0 text-sm font-medium tabular-nums " +
                (isIncome
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isExpense
                    ? "text-destructive"
                    : "")
              }
            >
              {isIncome ? "+" : ""}
              {formatRSD(signedAmount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
