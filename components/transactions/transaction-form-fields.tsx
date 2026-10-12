"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account } from "@/lib/db/accounts";
import type { Category, CategoryKind } from "@/lib/db/categories";
import { toCurrency } from "@/lib/currency";
import { useQuery } from "@tanstack/react-query";
import { listTagsAction } from "@/app/transactions/actions";
import { parseTags } from "@/lib/tags";

export type TransactionType = "expense" | "income" | "transfer";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

export const TRANSACTION_TYPES = Object.keys(
  TRANSACTION_TYPE_LABELS,
) as TransactionType[];

export function buildCategoryOptions(categories: Category[], kind: CategoryKind) {
  const topLevel = categories.filter(
    (c) => c.kind === kind && c.parentId === null,
  );
  const options: { id: string; label: string }[] = [];
  for (const parent of topLevel) {
    options.push({ id: parent.id, label: parent.name });
    for (const child of categories.filter((c) => c.parentId === parent.id)) {
      options.push({ id: child.id, label: `↳ ${child.name}` });
    }
  }
  return options;
}

export type TransactionFormState = {
  type: TransactionType;
  accountId: string;
  /** Transfer only - the destination account. */
  toAccountId: string;
  categoryId: string;
  amount: string;
  /** Transfer between accounts of different currencies only: what arrives
   * in the destination account. Unused (and ignored) otherwise. */
  toAmount?: string;
  occurredOn: string;
  note: string;
  /** What is typed in the tags box ("trip, gift"); normalized on save. */
  tags?: string;
};

/** Tags box with one-tap suggestions from tags already in use. */
function TagsField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const known = useQuery({
    queryKey: ["tags"],
    queryFn: listTagsAction,
    staleTime: 10_000,
  });
  const chosen = new Set(parseTags(value));
  const suggestions = (known.data ?? [])
    .filter((t) => !chosen.has(t.tag))
    .slice(0, 8);

  function add(tag: string) {
    const trimmed = value.trim().replace(/[,;]+$/, "");
    onChange(trimmed === "" ? tag : `${trimmed}, ${tag}`);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="tags">Tags (optional)</Label>
      <Input
        id="tags"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. trip, gift"
        autoCapitalize="none"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggested tags">
          {suggestions.map((t) => (
            <button
              key={t.tag}
              type="button"
              onClick={() => add(t.tag)}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              #{t.tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TransactionFormFields({
  state,
  onChange,
  accounts,
  categories,
  autoFocusAmount = false,
  error,
  allowedTypes = TRANSACTION_TYPES,
  dateLabel = "Date",
  sameCurrencyTransfersOnly = false,
  withTags = false,
  children,
}: {
  state: TransactionFormState;
  onChange: (next: Partial<TransactionFormState>) => void;
  accounts: Account[];
  categories: Category[];
  autoFocusAmount?: boolean;
  error?: string | null;
  /** Which type toggle buttons to show - editing an existing transaction
   * only ever offers expense/income (see edit-transaction-sheet.tsx);
   * turning an expense into a transfer, or vice versa, isn't a supported
   * flow, so transfer is left out of that toggle entirely rather than
   * exposed and then rejected. */
  allowedTypes?: TransactionType[];
  /** Recurring rules reuse this form and call the date "Next date". */
  dateLabel?: string;
  /** Recurring rules cannot know the amount that will arrive in another
   * currency, so they only offer destinations in the source's currency. */
  sameCurrencyTransfersOnly?: boolean;
  /** Show the tags box (not used by recurring rules, whose template has no
   * tags). */
  withTags?: boolean;
  /** Extra fields rendered inside the scrolling area, below the note. */
  children?: React.ReactNode;
}) {
  const isTransfer = state.type === "transfer";
  const categoryOptions = isTransfer
    ? []
    : buildCategoryOptions(categories, state.type as CategoryKind);
  const fromAccount = accounts.find((a) => a.id === state.accountId);
  const toAccount = accounts.find((a) => a.id === state.toAccountId);
  const toAccountOptions = accounts.filter(
    (a) =>
      a.id !== state.accountId &&
      (!sameCurrencyTransfersOnly || a.currency === fromAccount?.currency),
  );
  const crossCurrency =
    isTransfer &&
    fromAccount !== undefined &&
    toAccount !== undefined &&
    fromAccount.currency !== toAccount.currency;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
      <div className="flex gap-2">
        {allowedTypes.map((t) => (
          <Button
            key={t}
            type="button"
            variant={state.type === t ? "default" : "outline"}
            className="flex-1"
            onClick={() => onChange({ type: t, categoryId: "", toAccountId: "" })}
          >
            {TRANSACTION_TYPE_LABELS[t]}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="amount">
          {crossCurrency ? "Amount sent" : "Amount"}
          {fromAccount ? ` (${toCurrency(fromAccount.currency)})` : ""}
        </Label>
        <Input
          id="amount"
          inputMode="decimal"
          autoFocus={autoFocusAmount}
          placeholder="0"
          className="font-mono tabular-nums"
          value={state.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="account">{isTransfer ? "From account" : "Account"}</Label>
        <Select
          value={state.accountId}
          onValueChange={(value) =>
            onChange({
              accountId: value as string,
              // A from/to pair that just became equal would otherwise sit
              // in an invalid state until submit's validation catches it -
              // clearing the now-stale destination surfaces that
              // immediately as "choose a destination" instead.
              toAccountId: value === state.toAccountId ? "" : state.toAccountId,
            })
          }
        >
          <SelectTrigger id="account" className="w-full">
            <SelectValue>
              {(value: string) =>
                accounts.find((a) => a.id === value)?.name ??
                "Choose an account"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isTransfer ? (
        <div className="space-y-1.5">
          <Label htmlFor="toAccount">To account</Label>
          <Select
            value={state.toAccountId}
            onValueChange={(value) => onChange({ toAccountId: value as string })}
          >
            <SelectTrigger id="toAccount" className="w-full">
              <SelectValue>
                {(value: string) =>
                  toAccountOptions.find((a) => a.id === value)?.name ??
                  "Choose a destination account"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {toAccountOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Select
            value={state.categoryId}
            onValueChange={(value) => onChange({ categoryId: value as string })}
          >
            <SelectTrigger id="category" className="w-full">
              <SelectValue>
                {(value: string) =>
                  categoryOptions.find((c) => c.id === value)?.label ??
                  "Choose a category"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {crossCurrency && toAccount && (
        <div className="space-y-1.5">
          <Label htmlFor="toAmount">
            Amount received ({toCurrency(toAccount.currency)})
          </Label>
          <Input
            id="toAmount"
            inputMode="decimal"
            placeholder="0"
            className="font-mono tabular-nums"
            value={state.toAmount ?? ""}
            onChange={(e) => onChange({ toAmount: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            The two accounts are in different currencies, so enter what actually
            arrived.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="occurredOn">{dateLabel}</Label>
        <Input
          id="occurredOn"
          type="date"
          value={state.occurredOn}
          onChange={(e) => onChange({ occurredOn: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Input
          id="note"
          value={state.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Optional note"
        />
      </div>

      {withTags && (
        <TagsField
          value={state.tags ?? ""}
          onChange={(tags) => onChange({ tags })}
        />
      )}

      {children}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
