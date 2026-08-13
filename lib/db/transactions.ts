import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { toDbAmount } from "@/lib/money";

/** Scoped to what the Add Transaction screen creates - transfer and
 * adjustment are their own, later flows (SPEC.md Phase 2). */
export type TransactionType = "expense" | "income";

export type CreateTransactionInput = {
  type: TransactionType;
  accountId: string;
  categoryId: string;
  amount: bigint;
  occurredOn: string;
  note?: string | null;
};

/**
 * Inserts a single expense/income transaction. currency is looked up from
 * the target account rather than trusted from the caller - accounts are
 * always RSD today (no currency picker exists yet, SPEC.md Phase 3), but
 * this stays correct once that changes instead of silently hardcoding it.
 */
export async function createTransaction(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateTransactionInput,
): Promise<void> {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", input.accountId)
    .eq("user_id", userId)
    .single();

  if (accountError) throw accountError;

  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    type: input.type,
    account_id: input.accountId,
    category_id: input.categoryId,
    amount: toDbAmount(input.amount),
    currency: account.currency,
    occurred_on: input.occurredOn,
    note: input.note ?? null,
  });

  if (error) throw error;
}
