import { format, startOfMonth } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { getMonthlySummary, listRecentTransactions } from "@/lib/db/transactions";
import { listDue } from "@/lib/db/recurring";
import { ensureRecurringPosted } from "@/lib/recurring-sync";
import { todayInAppTimeZone } from "@/lib/recurring";
import { DueRecurring, type DueRow } from "@/components/home/due-recurring";
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

  // Auto-post rules first, so what they add is in the numbers below. The
  // layout calls this too; `cache` makes the second call free.
  await ensureRecurringPosted(user.id);

  const [accounts, categories, recentTransactions, monthlySummary, due] =
    await Promise.all([
      listAccounts(supabase, user.id),
      listCategories(supabase, user.id),
      listRecentTransactions(supabase, user.id, 10),
      getMonthlySummary(supabase, user.id, monthIso),
      // A failure here must not take Home down; the prompt just won't show.
      listDue(supabase, user.id, todayInAppTimeZone()).catch((err) => {
        console.error("recurring: listing due rules failed", err);
        return [];
      }),
    ]);

  const dueRows: DueRow[] = due.map(({ rule, date, more }) => {
    const t = rule.template;
    return {
      ruleId: rule.id,
      date,
      title:
        t.note ??
        categories.find((c) => c.id === t.categoryId)?.name ??
        (t.type === "transfer" ? "Transfer" : "Recurring"),
      type: t.type,
      amount: t.amount,
      accountName: accounts.find((a) => a.id === t.accountId)?.name ?? "Unknown account",
      more,
    };
  });

  return (
    <>
      {dueRows.length > 0 && (
        <div className="mx-auto max-w-md px-4 pt-4 lg:max-w-5xl lg:px-8 lg:pt-8">
          <DueRecurring rows={dueRows} />
        </div>
      )}
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
