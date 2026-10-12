import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { listRules } from "@/lib/db/recurring";
import {
  describeSchedule,
  isEnded,
  todayInAppTimeZone,
} from "@/lib/recurring";
import { scheduleOf } from "@/lib/db/recurring";
import { formValuesForRule } from "@/lib/recurring-form";
import {
  RecurringManager,
  type RuleItem,
} from "@/components/recurring/recurring-manager";

export default async function RecurringPage() {
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

  const [rules, accounts, categories] = await Promise.all([
    listRules(supabase, user.id),
    listAccounts(supabase, user.id),
    listCategories(supabase, user.id),
  ]);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Unknown account";
  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? null) : null;

  const items: RuleItem[] = rules.map((rule) => {
    const t = rule.template;
    return {
      id: rule.id,
      title: t.note ?? categoryName(t.categoryId) ?? (t.type === "transfer" ? "Transfer" : "Recurring"),
      type: t.type,
      amount: t.amount,
      accountName: accountName(t.accountId),
      toAccountName: t.toAccountId ? accountName(t.toAccountId) : null,
      scheduleText: describeSchedule(scheduleOf(rule)),
      nextRunOn: rule.nextRunOn,
      endOn: rule.endOn,
      autoPost: rule.autoPost,
      paused: rule.paused,
      ended: isEnded(rule.nextRunOn, rule.endOn),
      form: formValuesForRule({
        type: t.type,
        accountId: t.accountId,
        toAccountId: t.toAccountId,
        categoryId: t.categoryId,
        amountMinor: t.amount,
        note: t.note,
        nextRunOn: rule.nextRunOn,
        frequency: rule.frequency,
        interval: rule.interval,
        endOn: rule.endOn,
        autoPost: rule.autoPost,
      }),
    };
  });

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:max-w-xl lg:p-8">
      <h1 className="font-heading text-xl font-medium">Recurring</h1>
      <RecurringManager
        rules={items}
        accounts={accounts}
        categories={categories}
        today={todayInAppTimeZone()}
      />
    </main>
  );
}
