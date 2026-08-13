import Link from "next/link";
import { NetWorthCard } from "@/components/home/net-worth-card";
import { MonthSummary } from "@/components/home/month-summary";
import { AccountsPanel } from "@/components/home/accounts-panel";
import { RecentTransactionsTable } from "@/components/home/recent-transactions-table";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import type { Transaction } from "@/lib/db/transactions";

/**
 * Genuinely different from MobileHome, not the same stack widened: two
 * real columns, so net worth, this month's summary, accounts, and recent
 * transactions are all visible together without scrolling on a normal
 * desktop viewport - a dashboard, not a phone screen stretched out.
 */
export function DesktopHome({
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
    <main className="mx-auto hidden max-w-6xl gap-6 p-8 lg:grid lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <NetWorthCard accounts={accounts} />

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Recent transactions</h2>
            <Link
              href="/transactions"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <RecentTransactionsTable
            transactions={recentTransactions}
            accounts={accounts}
            categories={categories}
          />
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="mb-3 text-sm font-medium">This month</h2>
          <MonthSummary
            income={monthlySummary.income}
            expense={monthlySummary.expense}
          />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Accounts</h2>
            <Link
              href="/accounts"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Manage
            </Link>
          </div>
          <AccountsPanel accounts={accounts} />
        </div>
      </div>
    </main>
  );
}
