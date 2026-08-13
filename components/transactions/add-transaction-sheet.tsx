"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toMinor } from "@/lib/money";
import type { Account } from "@/lib/db/accounts";
import type { Category, CategoryKind } from "@/lib/db/categories";
import { createTransactionAction } from "@/app/transactions/actions";

type TransactionType = CategoryKind;

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
};

const TRANSACTION_TYPES = Object.keys(TYPE_LABELS) as TransactionType[];

function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildCategoryOptions(categories: Category[], kind: CategoryKind) {
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

export function AddTransactionSheet({
  accounts,
  categories,
  onBackgroundError,
}: {
  accounts: Account[];
  categories: Category[];
  onBackgroundError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransactionType>("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({ mutationFn: createTransactionAction });

  const categoryOptions = buildCategoryOptions(categories, type);

  function validate(): string | null {
    if (!accountId) return "Choose an account.";
    if (!categoryId) return "Choose a category.";
    if (!amount.trim()) return "Enter an amount.";
    try {
      if (toMinor(amount) <= 0n) return "Enter an amount greater than zero.";
    } catch {
      return "Enter a valid amount.";
    }
    if (!occurredOn) return "Choose a date.";
    return null;
  }

  function submit(andAnother: boolean) {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);

    const payload = { type, accountId, categoryId, amount, occurredOn, note };
    mutation.mutate(payload, {
      onSuccess: (result) => {
        if (result.error) onBackgroundError(result.error);
      },
      onError: () => {
        onBackgroundError("Failed to save transaction. Please try again.");
      },
    });

    // Optimistic: update the UI immediately rather than waiting for the
    // mutation to resolve - the actual insert happens in the background,
    // and onBackgroundError above surfaces a failure after the fact.
    if (andAnother) {
      setAmount("");
      setCategoryId("");
      setNote("");
      setOccurredOn(todayIso());
    } else {
      setOpen(false);
      setType("expense");
      setAccountId(accounts[0]?.id ?? "");
      setCategoryId("");
      setAmount("");
      setOccurredOn(todayIso());
      setNote("");
    }
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add an account before logging a transaction.
      </p>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormError(null);
      }}
    >
      <SheetTrigger render={<Button size="lg" />}>Add transaction</SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Add transaction</SheetTitle>
          <SheetDescription>Log an expense or income.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4">
          <div className="flex gap-2">
            {TRANSACTION_TYPES.map((t) => (
              <Button
                key={t}
                type="button"
                variant={type === t ? "default" : "outline"}
                className="flex-1"
                onClick={() => {
                  setType(t);
                  setCategoryId("");
                }}
              >
                {TYPE_LABELS[t]}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              inputMode="decimal"
              autoFocus
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account">Account</Label>
            <Select
              value={accountId}
              onValueChange={(value) => setAccountId(value as string)}
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
              value={categoryId}
              onValueChange={(value) => setCategoryId(value as string)}
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
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
            />
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>

        <SheetFooter className="flex-row">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => submit(true)}
          >
            Save and add another
          </Button>
          <Button type="button" className="flex-1" onClick={() => submit(false)}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
