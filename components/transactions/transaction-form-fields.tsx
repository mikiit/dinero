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
  occurredOn: string;
  note: string;
};

export function TransactionFormFields({
  state,
  onChange,
  accounts,
  categories,
  autoFocusAmount = false,
  error,
  allowedTypes = TRANSACTION_TYPES,
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
}) {
  const isTransfer = state.type === "transfer";
  const categoryOptions = isTransfer
    ? []
    : buildCategoryOptions(categories, state.type as CategoryKind);
  const toAccountOptions = accounts.filter((a) => a.id !== state.accountId);

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
        <Label htmlFor="amount">Amount</Label>
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
                {a.name}
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
                  {a.name}
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

      <div className="space-y-1.5">
        <Label htmlFor="occurredOn">Date</Label>
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

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
