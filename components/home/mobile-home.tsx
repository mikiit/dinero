import { NetWorthCard } from "@/components/home/net-worth-card";
import { AccountStrip } from "@/components/home/account-strip";
import { MonthSummary } from "@/components/home/month-summary";
import { RecentTransactionsList } from "@/components/home/recent-transactions-list";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import type { Transaction } from "@/lib/db/transactions";

export function MobileHome({
  accounts,
  categories,
  recentTransactions,
  monthlySummary,
}: {
  accounts: Account[];
  categories: Category[];
  recentTransactions: Transaction[];
  monthlySummary: { income: bigint; expense: bigint };
}) {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:hidden">
      <NetWorthCard accounts={accounts} />
      <AccountStrip accounts={accounts} />
      <MonthSummary
        income={monthlySummary.income}
        expense={monthlySummary.expense}
      />
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Recent transactions</h2>
        <RecentTransactionsList
          transactions={recentTransactions}
          accounts={accounts}
          categories={categories}
        />
      </div>
    </main>
  );
}
