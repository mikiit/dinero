import { format, startOfMonth } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { getMonthlySummary, listRecentTransactions } from "@/lib/db/transactions";
import { MobileHome } from "@/components/home/mobile-home";
import { DesktopHome } from "@/components/home/desktop-home";

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
    <>
      <MobileHome
        accounts={accounts}
        categories={categories}
        recentTransactions={recentTransactions}
        monthlySummary={monthlySummary}
      />
      <DesktopHome
        accounts={accounts}
        categories={categories}
        recentTransactions={recentTransactions}
        monthlySummary={monthlySummary}
      />
    </>
  );
}
