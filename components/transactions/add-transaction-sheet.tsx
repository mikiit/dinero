"use client";

import { cloneElement, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  createTransactionAction,
  deleteTransactionAction,
  listQuickTemplatesAction,
} from "@/app/transactions/actions";
import { QuickTemplates } from "@/components/transactions/quick-templates";
import { useToast } from "@/components/ui/toaster";
import { ReceiptField } from "@/components/transactions/receipt-field";
import { deleteUploadedReceipt } from "@/lib/receipts-client";

function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function emptyForm(accounts: Account[]): TransactionFormState {
  return {
    type: "expense",
    accountId: accounts[0]?.id ?? "",
    toAccountId: "",
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
  const [rawForm, setForm] = useState<TransactionFormState>(() =>
    emptyForm(accounts),
  );
  // The account picked when the form was first built can stop existing in
  // `accounts` (none existed yet, or the ledger's accounts changed since):
  // fall back to the first one rather than submitting a stale or empty id.
  const form: TransactionFormState = accounts.some((a) => a.id === rawForm.accountId)
    ? rawForm
    : { ...rawForm, accountId: accounts[0]?.id ?? "" };
  const [formError, setFormError] = useState<string | null>(null);
  // The id is chosen here, not by the database, so a receipt photo can be
  // uploaded under this transaction's own folder before the row exists.
  const [transactionId, setTransactionId] = useState(() => crypto.randomUUID());
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const router = useRouter();
  const { show } = useToast();
  const mutation = useMutation({
    mutationFn: createTransactionAction,
    // Without this the Transactions list keeps showing its cached pages
    // and the new entry only appears after a reload.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      // What you usually enter just changed.
      queryClient.invalidateQueries({ queryKey: ["quick-templates"] });
    },
  });
  const templates = useQuery({
    queryKey: ["quick-templates"],
    queryFn: listQuickTemplatesAction,
    enabled: open,
    staleTime: 30_000,
  });

  function validate(): string | null {
    if (!form.accountId) return "Choose an account.";
    if (form.type === "transfer") {
      if (!form.toAccountId) return "Choose a destination account.";
      if (form.toAccountId === form.accountId) {
        return "Choose two different accounts.";
      }
    } else if (!form.categoryId) {
      return "Choose a category.";
    }
    if (!form.amount.trim()) return "Enter an amount.";
    try {
      if (toMinor(form.amount) <= 0n) return "Enter an amount greater than zero.";
    } catch {
      return "Enter a valid amount.";
    }
    if (form.type === "transfer") {
      const from = accounts.find((a) => a.id === form.accountId);
      const to = accounts.find((a) => a.id === form.toAccountId);
      if (from && to && from.currency !== to.currency) {
        try {
          if (!form.toAmount?.trim()) return `Enter the amount received in ${to.currency}.`;
          if (toMinor(form.toAmount) <= 0n) return "Enter a received amount greater than zero.";
        } catch {
          return "Enter a valid received amount.";
        }
      }
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

    const payload = {
      ...form,
      id: transactionId,
      receiptPath: receiptPath ?? undefined,
    };
    setTransactionId(crypto.randomUUID());
    setReceiptPath(null);
    mutation.mutate(payload, {
      onSuccess: (result) => {
        if (result.error) {
          onBackgroundError(result.error);
          return;
        }
        // Only once the server has it: Undo removes this exact row (its id
        // was chosen above, so we know it without asking the server).
        show({
          message: "Transaction saved.",
          undo: async () => {
            const undone = await deleteTransactionAction(payload.id);
            if (!undone.error) {
              await queryClient.invalidateQueries({ queryKey: ["transactions"] });
              router.refresh();
            }
            return undone;
          },
        });
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
        toAmount: "",
        categoryId: "",
        toAccountId: "",
        note: "",
        occurredOn: todayIso(),
      }));
    } else {
      setOpen(false);
      setForm(emptyForm(accounts));
    }
  }

  if (accounts.length === 0) {
    // Nothing to log a transaction against yet. Keep the same button (it
    // sits in the tab bar / sidebar, and a paragraph of text there wrecks
    // the layout) but make it take the user to add their first account.
    return cloneElement(trigger ?? <Button size="lg">Add transaction</Button>, {
      onClick: () => router.push("/accounts"),
      title: "Add an account first",
    } as Record<string, unknown>);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormError(null);
        else if (receiptPath) {
          // Closed without saving: don't leave the uploaded photo behind.
          void deleteUploadedReceipt(receiptPath);
          setReceiptPath(null);
          setTransactionId(crypto.randomUUID());
        }
      }}
    >
      <SheetTrigger render={trigger ?? <Button size="lg" />}>
        {trigger ? undefined : "Add transaction"}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Add transaction</SheetTitle>
          <SheetDescription>Log an expense, income, or transfer.</SheetDescription>
        </SheetHeader>

        <QuickTemplates
          templates={templates.data ?? []}
          accounts={accounts}
          categories={categories}
          onPick={(patch) => {
            setFormError(null);
            setForm((prev) => ({ ...prev, ...patch }));
          }}
        />

        <TransactionFormFields
          state={form}
          onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
          accounts={accounts}
          categories={categories}
          autoFocusAmount
          error={formError}
        >
          <ReceiptField
            // Remounts after each save so "Save and add another" starts clean.
            key={transactionId}
            transactionId={transactionId}
            path={receiptPath}
            onAttach={async (path) => {
              setReceiptPath(path);
              return {};
            }}
            onRemove={async (path) => {
              await deleteUploadedReceipt(path);
              setReceiptPath(null);
              return {};
            }}
          />
        </TransactionFormFields>

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
