"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createTransaction, type TransactionType } from "@/lib/db/transactions";
import { toMinor } from "@/lib/money";

export type CreateTransactionActionInput = {
  type: TransactionType;
  accountId: string;
  categoryId: string;
  /** Raw decimal string (e.g. "12,50") - parsed and validated here, never
   * trusted from the client beyond this point. */
  amount: string;
  occurredOn: string;
  note?: string;
};

export type CreateTransactionResult = { error?: string };

export async function createTransactionAction(
  input: CreateTransactionActionInput,
): Promise<CreateTransactionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Not signed in." };
    }

    if (!input.accountId) return { error: "Choose an account." };
    if (!input.categoryId) return { error: "Choose a category." };
    if (!input.occurredOn) return { error: "Choose a date." };

    const amount = toMinor(input.amount);
    if (amount <= 0n) {
      return { error: "Enter an amount greater than zero." };
    }

    await createTransaction(supabase, user.id, {
      type: input.type,
      accountId: input.accountId,
      categoryId: input.categoryId,
      amount,
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
  return {};
}
