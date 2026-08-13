import { format, startOfMonth } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { getMonthlySummary, listRecentTransactions } from "@/lib/db/transactions";
import { NetWorthCard } from "@/components/home/net-worth-card";
import { AccountStrip } from "@/components/home/account-strip";
import { MonthSummary } from "@/components/home/month-summary";
import { RecentTransactionsList } from "@/components/home/recent-transactions-list";
import { FloatingAddButton } from "@/components/home/floating-add-button";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted-foreground">
          Setting up your session — refresh in a moment.
        </p>
      </main>
    );
  }

  const monthIso = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const [accounts, categories, recentTransactions, monthlySummary] =
    await Promise.all([
      listAccounts(supabase, user.id),
      listCategories(supabase, user.id),
      listRecentTransactions(supabase, user.id, 10),
      getMonthlySummary(supabase, user.id, monthIso),
    ]);

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 pb-24">
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
      <FloatingAddButton accounts={accounts} categories={categories} />
    </main>
  );
}
