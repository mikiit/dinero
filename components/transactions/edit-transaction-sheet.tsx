"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toDecimalString, toMinor } from "@/lib/money";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import {
  TransactionFormFields,
  type TransactionFormState,
  type TransactionType,
} from "@/components/transactions/transaction-form-fields";
import type { TransactionListItem } from "@/app/transactions/actions";
import { ReceiptField } from "@/components/transactions/receipt-field";
import {
  attachReceiptAction,
  removeReceiptAction,
} from "@/app/transactions/receipt-actions";
import { formatTags } from "@/lib/tags";

// Only reachable for expense/income rows (transaction-list.tsx disables
// opening this sheet for transfer/adjustment), so toAccountId is always
// "" here in practice - present only because TransactionFormState requires
// it.
function toFormState(transaction: TransactionListItem): TransactionFormState {
  return {
    type: transaction.type as TransactionType,
    accountId: transaction.accountId,
    toAccountId: transaction.toAccountId ?? "",
    categoryId: transaction.categoryId ?? "",
    amount: transaction.amount, // minor units string; toMinor requires a
    // major-unit decimal string, so this gets reformatted below.
    occurredOn: transaction.occurredOn,
    note: transaction.note ?? "",
    tags: formatTags(transaction.tags),
  };
}

function EditTransactionForm({
  transaction,
  accounts,
  categories,
  onOpenChange,
  onSave,
}: {
  transaction: TransactionListItem;
  accounts: Account[];
  categories: Category[];
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, input: TransactionFormState) => void;
}) {
  const [form, setForm] = useState<TransactionFormState>(() => ({
    ...toFormState(transaction),
    amount: toDecimalString(BigInt(transaction.amount)),
  }));
  const [formError, setFormError] = useState<string | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(
    transaction.receiptPath,
  );
  const queryClient = useQueryClient();

  // Receipt changes hit the database straight away rather than waiting for
  // "Save changes": a photo is its own action, and saving the form must not
  // be able to undo it.
  async function attach(path: string) {
    const result = await attachReceiptAction(transaction.id, path);
    if (!result.error) {
      setReceiptPath(path);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
    return result;
  }

  async function remove() {
    const result = await removeReceiptAction(transaction.id);
    if (!result.error) {
      setReceiptPath(null);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
    return result;
  }

  function submit() {
    if (!form.accountId) return setFormError("Choose an account.");
    if (!form.categoryId) return setFormError("Choose a category.");
    if (!form.amount.trim()) return setFormError("Enter an amount.");
    try {
      if (toMinor(form.amount) <= 0n) {
        return setFormError("Enter an amount greater than zero.");
      }
    } catch {
      return setFormError("Enter a valid amount.");
    }
    if (!form.occurredOn) return setFormError("Choose a date.");

    onSave(transaction.id, form);
    onOpenChange(false);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit transaction</SheetTitle>
        <SheetDescription>Update this transaction&apos;s details.</SheetDescription>
      </SheetHeader>

      <TransactionFormFields
        state={form}
        onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
        accounts={accounts}
        categories={categories}
        error={formError}
        allowedTypes={["expense", "income"]}
        withTags
      >
        <ReceiptField
          transactionId={transaction.id}
          path={receiptPath}
          onAttach={attach}
          onRemove={remove}
        />
      </TransactionFormFields>

      <SheetFooter>
        <Button type="button" onClick={submit}>
          Save changes
        </Button>
      </SheetFooter>
    </>
  );
}

export function EditTransactionSheet({
  open,
  onOpenChange,
  transaction,
  accounts,
  categories,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionListItem | null;
  accounts: Account[];
  categories: Category[];
  onSave: (id: string, input: TransactionFormState) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        {transaction && (
          <EditTransactionForm
            key={transaction.id}
            transaction={transaction}
            accounts={accounts}
            categories={categories}
            onOpenChange={onOpenChange}
            onSave={onSave}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
