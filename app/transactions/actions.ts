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
export type TransactionListItem = Omit<Transaction, "amount"> & {
  amount: string;
};

export type ListTransactionsResult = {
  transactions: TransactionListItem[];
  nextCursor: TransactionsCursor;
};

function validateTransactionInput(input: {
  type: TransactionType;
  accountId: string;
  categoryId: string;
  toAccountId?: string;
  occurredOn: string;
  amount: string;
}): { error: string } | { amount: bigint } {
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
  return { amount };
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
    transactions: page.transactions.map((t) => ({
      ...t,
      amount: t.amount.toString(),
    })),
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

export async function listRecentTransactionsAction(
  limit = 10,
): Promise<TransactionListItem[]> {
  const ctx = await getContext();
  const gate = { ctx, error: "Not signed in." };
  if (!gate.ctx) return [];
  const { supabase, scope } = gate.ctx;

  const transactions = await listRecentTransactions(supabase, scope, limit);
  return transactions.map((t) => ({ ...t, amount: t.amount.toString() }));
}

export type MonthlySummaryResult = { income: string; expense: string };

export async function getMonthlySummaryAction(
  monthIso: string,
): Promise<MonthlySummaryResult> {
  const ctx = await getContext();
  const gate = { ctx, error: "Not signed in." };
  if (!gate.ctx) return { income: "0", expense: "0" };
  const { supabase, scope } = gate.ctx;

  const summary = await getMonthlySummary(supabase, scope, monthIso);
  return {
    income: summary.income.toString(),
    expense: summary.expense.toString(),
  };
}
