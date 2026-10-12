import { NetWorthCard } from "@/components/home/net-worth-card";
import { AccountStrip } from "@/components/home/account-strip";
import { MonthSummaries } from "@/components/home/month-summaries";
import { RecentTransactionsList } from "@/components/home/recent-transactions-list";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import type { Transaction } from "@/lib/db/transactions";
import type { MonthlySummary } from "@/lib/db/transactions";

export function MobileHome({
  accounts,
  categories,
  recentTransactions,
  monthlySummary,
  canWrite = true,
}: {
  accounts: Account[];
  categories: Category[];
  recentTransactions: Transaction[];
  monthlySummary: MonthlySummary[];
  canWrite?: boolean;
}) {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:hidden">
      <NetWorthCard accounts={accounts} />
      <AccountStrip accounts={accounts} />
      <MonthSummaries summaries={monthlySummary} />
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Recent transactions</h2>
        <RecentTransactionsList
          canWrite={canWrite}
          transactions={recentTransactions}
          accounts={accounts}
          categories={categories}
        />
      </div>
    </main>
  );
}
