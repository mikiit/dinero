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

export type TransactionType = CategoryKind;

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
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
}: {
  state: TransactionFormState;
  onChange: (next: Partial<TransactionFormState>) => void;
  accounts: Account[];
  categories: Category[];
  autoFocusAmount?: boolean;
  error?: string | null;
}) {
  const categoryOptions = buildCategoryOptions(categories, state.type);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4">
      <div className="flex gap-2">
        {TRANSACTION_TYPES.map((t) => (
          <Button
            key={t}
            type="button"
            variant={state.type === t ? "default" : "outline"}
            className="flex-1"
            onClick={() => onChange({ type: t, categoryId: "" })}
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
          value={state.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="account">Account</Label>
        <Select
          value={state.accountId}
          onValueChange={(value) => onChange({ accountId: value as string })}
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
