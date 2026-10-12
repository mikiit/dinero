"use client";

import { format } from "date-fns";
import { RotateCcwIcon } from "lucide-react";
import { formatMoneyParts, toDecimalString } from "@/lib/money";
import type { QuickTemplate } from "@/lib/quick-templates";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import type { TransactionFormState } from "@/components/transactions/transaction-form-fields";
import { cn } from "@/lib/utils";

/** What picking a suggestion puts into the form. Today's date, always: a
 * repeat is a NEW entry, not a copy of the old day. */
export function templateToForm(
  t: QuickTemplate,
  today: string,
): Partial<TransactionFormState> {
  return {
    type: t.type,
    accountId: t.accountId,
    toAccountId: "",
    categoryId: t.categoryId ?? "",
    amount: toDecimalString(BigInt(t.amount)),
    note: t.note ?? "",
    occurredOn: today,
  };
}

/**
 * One-tap chips above the Add form: "repeat the last entry" and the entries
 * you keep making (coffee, a subscription). Tapping fills the form; you still
 * press Save, so a mis-tap can never record anything by itself.
 * Suggestions pointing at an archived account or category are skipped.
 */
export function QuickTemplates({
  templates,
  accounts,
  categories,
  onPick,
}: {
  templates: QuickTemplate[];
  accounts: Account[];
  categories: Category[];
  onPick: (patch: Partial<TransactionFormState>) => void;
}) {
  const accountIds = new Set(accounts.map((a) => a.id));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const usable = templates.filter(
    (t) =>
      accountIds.has(t.accountId) &&
      (t.categoryId === null || categoryName.has(t.categoryId)),
  );
  if (usable.length === 0) return null;

  return (
    <div className="space-y-1.5 px-4" aria-label="Quick add">
      <p className="text-xs text-muted-foreground">Repeat or quick add</p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {usable.map((t) => {
          const title =
            t.note?.trim() ||
            (t.categoryId ? categoryName.get(t.categoryId) : undefined) ||
            (t.type === "income" ? "Income" : "Expense");
          const currency = accounts.find((a) => a.id === t.accountId)?.currency ?? "RSD";
          const { number, unit } = formatMoneyParts(BigInt(t.amount), currency);
          const amount = currency === "RSD" ? number : `${number} ${unit}`;
          return (
            <button
              key={`${t.kind}-${t.type}-${t.accountId}-${t.categoryId}-${t.amount}-${t.note}`}
              type="button"
              onClick={() => onPick(templateToForm(t, format(new Date(), "yyyy-MM-dd")))}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                t.kind === "last" ? "border-primary/50 bg-primary/10" : "bg-background",
              )}
            >
              {t.kind === "last" && <RotateCcwIcon className="size-3.5" aria-hidden />}
              <span className="max-w-[9rem] truncate">{title}</span>
              <span
                className={cn(
                  "font-mono text-xs",
                  t.type === "income" ? "text-income" : "text-expense",
                )}
              >
                {t.type === "income" ? "+" : "-"}
                {amount}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
