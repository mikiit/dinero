"use server";

import { revalidatePath } from "next/cache";
import {
  createTransaction,
  getMonthlySummary,
  listRecentTransactions,
  listTransactionsPage,
  restoreTransaction,
  softDeleteTransaction,
  updateTransaction,
  type Transaction,
  type TransactionFilters,
  type TransactionsCursor,
  type TransactionType,
} from "@/lib/db/transactions";
import { toMinor } from "@/lib/money";
import { isReceiptPathFor } from "@/lib/receipts";
import { listQuickTemplates } from "@/lib/db/quick-templates";
import type { QuickTemplate } from "@/lib/quick-templates";
import { receiptOwnerKey } from "@/lib/scope";
import { getContext, requireWriteContext } from "@/lib/context";

export type CreateTransactionActionInput = {
  /** Client-generated id; required whenever `receiptPath` is set, because
   * the photo was uploaded under this transaction's folder first. */
  id?: string;
  receiptPath?: string;
  type: TransactionType;
  accountId: string;
  /** Ignored (written as null) when type is "transfer". */
  categoryId: string;
  /** Transfer only - the destination account. */
  toAccountId?: string;
  /** Raw decimal string (e.g. "12,50") - parsed and validated here, never
   * trusted from the client beyond this point. */
  amount: string;
  /** Transfer between accounts of different currencies only: the amount
   * that arrives, as a raw decimal string. */
  toAmount?: string;
  occurredOn: string;
  note?: string;
};

export type UpdateTransactionActionInput = CreateTransactionActionInput & {
  id: string;
};

export type TransactionActionResult = { error?: string };

/** Server Action return values go through RSC serialization, which - like
 * the Server Action *argument* boundary - shouldn't be trusted with raw
 * bigint. amount travels as a string and gets turned back into bigint
 * client-side before it touches formatRSD/toMinor. */
export type TransactionListItem = Omit<Transaction, "amount" | "toAmount"> & {
  amount: string;
  toAmount: string | null;
};

export type ListTransactionsResult = {
  transactions: TransactionListItem[];
  nextCursor: TransactionsCursor;
};

function toListItem(t: Transaction): TransactionListItem {
  return {
    ...t,
    amount: t.amount.toString(),
    toAmount: t.toAmount === null ? null : t.toAmount.toString(),
  };
}

function validateTransactionInput(input: {
  type: TransactionType;
  accountId: string;
  categoryId: string;
  toAccountId?: string;
  occurredOn: string;
  amount: string;
  toAmount?: string;
}): { error: string } | { amount: bigint; toAmount: bigint | null } {
  if (!input.accountId) return { error: "Choose an account." };
  if (input.type === "transfer") {
    if (!input.toAccountId) return { error: "Choose a destination account." };
    if (input.toAccountId === input.accountId) {
      return { error: "Choose two different accounts." };
    }
  } else if (!input.categoryId) {
    return { error: "Choose a category." };
  }
  if (!input.occurredOn) return { error: "Choose a date." };

  const amount = toMinor(input.amount);
  if (amount <= 0n) {
    return { error: "Enter an amount greater than zero." };
  }
  // Whether a received amount is needed depends on the two accounts'
  // currencies, which only the DB layer looks up; here it is just parsed.
  const toAmount =
    input.type === "transfer" && input.toAmount?.trim()
      ? toMinor(input.toAmount)
      : null;
  if (toAmount !== null && toAmount <= 0n) {
    return { error: "Enter a received amount greater than zero." };
  }
  return { amount, toAmount };
}

export async function listTransactionsAction(
  filters: TransactionFilters,
  cursor: TransactionsCursor,
): Promise<ListTransactionsResult> {
  const ctx = await getContext();
  const gate = { ctx, error: "Not signed in." };
  if (!gate.ctx) {
    return { transactions: [], nextCursor: null };
  }
  const { supabase, scope } = gate.ctx;

  const page = await listTransactionsPage(supabase, scope, filters, cursor);
  return {
    transactions: page.transactions.map(toListItem),
    nextCursor: page.nextCursor,
  };
}

export async function createTransactionAction(
  input: CreateTransactionActionInput,
): Promise<TransactionActionResult> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;

    const validated = validateTransactionInput(input);
    if ("error" in validated) return validated;

    if (
      input.receiptPath &&
      !(input.id && isReceiptPathFor(input.receiptPath, receiptOwnerKey(scope), input.id))
    ) {
      return { error: "Invalid receipt." };
    }

    await createTransaction(supabase, scope, {
      id: input.id,
      receiptPath: input.receiptPath ?? null,
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.type === "transfer" ? input.toAccountId : null,
      categoryId: input.type === "transfer" ? null : input.categoryId,
      amount: validated.amount,
      toAmount: validated.toAmount,
      occurredOn: input.occurredOn,
      note: input.note?.trim() || null,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save transaction.",
    };
  }

  // The account's balance (shown on /accounts) just changed.
  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}

export async function updateTransactionAction(
  input: UpdateTransactionActionInput,
): Promise<TransactionActionResult> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;

    const validated = validateTransactionInput(input);
    if ("error" in validated) return validated;

    await updateTransaction(supabase, scope, input.id, {
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.type === "transfer" ? input.toAccountId : null,
      categoryId: input.type === "transfer" ? null : input.categoryId,
      amount: validated.amount,
      toAmount: validated.toAmount,
      occurredOn: input.occurredOn,
      note: input.note?.trim() || null,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to update transaction.",
    };
  }

  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}

export async function deleteTransactionAction(
  id: string,
): Promise<TransactionActionResult> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;

    await softDeleteTransaction(supabase, scope, id);
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to delete transaction.",
    };
  }

  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}

export async function restoreTransactionAction(
  id: string,
): Promise<TransactionActionResult> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;

    await restoreTransaction(supabase, scope, id);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to undo delete.",
    };
  }

  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}

/** Quick-add suggestions for the active ledger (see lib/quick-templates.ts). */
export async function listQuickTemplatesAction(): Promise<QuickTemplate[]> {
  const ctx = await getContext();
  if (!ctx) return [];
  try {
    return await listQuickTemplates(ctx.supabase, ctx.scope);
  } catch (err) {
    // Suggestions are a convenience; failing to load them must never get in
    // the way of adding a transaction.
    console.error("quick templates failed", err);
    return [];
  }
}

export async function listRecentTransactionsAction(
  limit = 10,
): Promise<TransactionListItem[]> {
  const ctx = await getContext();
  const gate = { ctx, error: "Not signed in." };
  if (!gate.ctx) return [];
  const { supabase, scope } = gate.ctx;

  const transactions = await listRecentTransactions(supabase, scope, limit);
  return transactions.map(toListItem);
}

export type MonthlySummaryResult = {
  currency: string;
  income: string;
  expense: string;
}[];

export async function getMonthlySummaryAction(
  monthIso: string,
): Promise<MonthlySummaryResult> {
  const ctx = await getContext();
  if (!ctx) return [];
  const { supabase, scope } = ctx;

  const summary = await getMonthlySummary(supabase, scope, monthIso);
  return summary.map((s) => ({
    currency: s.currency,
    income: s.income.toString(),
    expense: s.expense.toString(),
  }));
}
