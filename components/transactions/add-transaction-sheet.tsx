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
import { toMinor } from "@/lib/money";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import {
  TransactionFormFields,
  type TransactionFormState,
} from "@/components/transactions/transaction-form-fields";
import { createTransactionAction } from "@/app/transactions/actions";

function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function emptyForm(accounts: Account[]): TransactionFormState {
  return {
    type: "expense",
    accountId: accounts[0]?.id ?? "",
    categoryId: "",
    amount: "",
    occurredOn: todayIso(),
    note: "",
  };
}

export function AddTransactionSheet({
  accounts,
  categories,
  onBackgroundError,
  trigger,
}: {
  accounts: Account[];
  categories: Category[];
  onBackgroundError: (message: string) => void;
  /** Defaults to a plain "Add transaction" button - pass a differently
   * styled element (e.g. a floating action button) to change the trigger
   * without duplicating the sheet/form logic. */
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TransactionFormState>(() =>
    emptyForm(accounts),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({ mutationFn: createTransactionAction });

  function validate(): string | null {
    if (!form.accountId) return "Choose an account.";
    if (!form.categoryId) return "Choose a category.";
    if (!form.amount.trim()) return "Enter an amount.";
    try {
      if (toMinor(form.amount) <= 0n) return "Enter an amount greater than zero.";
    } catch {
      return "Enter a valid amount.";
    }
    if (!form.occurredOn) return "Choose a date.";
    return null;
  }

  function submit(andAnother: boolean) {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);

    const payload = { ...form };
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
      setForm((prev) => ({
        ...prev,
        amount: "",
        categoryId: "",
        note: "",
        occurredOn: todayIso(),
      }));
    } else {
      setOpen(false);
      setForm(emptyForm(accounts));
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
      <SheetTrigger render={trigger ?? <Button size="lg" />}>
        {trigger ? undefined : "Add transaction"}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Add transaction</SheetTitle>
          <SheetDescription>Log an expense or income.</SheetDescription>
        </SheetHeader>

        <TransactionFormFields
          state={form}
          onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
          accounts={accounts}
          categories={categories}
          autoFocusAmount
          error={formError}
        />

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
