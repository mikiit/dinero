import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fromDbAmount, toDbAmount } from "@/lib/money";
import { fetchAllTransactionRows } from "./export";
import {
  planTransactionsImport,
  transactionKey,
  type ImportPlan,
  type PlannedTransaction,
} from "@/lib/import-transactions";

/**
 * Loads what the planner needs and plans the import for one user. Accounts
 * and categories include archived ones: an exported file legitimately
 * contains rows on them, and re-importing it should still match.
 */
export async function planImportForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  csvText: string,
): Promise<ImportPlan> {
  const [accountsRes, categoriesRes, existingRows] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, currency")
      .eq("user_id", userId),
    supabase
      .from("categories")
      .select("id, name, kind, parent_id")
      .eq("user_id", userId),
    fetchAllTransactionRows(supabase, userId),
  ]);
  if (accountsRes.error) throw accountsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;

  const existing = new Map<string, number>();
  for (const r of existingRows) {
    const key = transactionKey({
      type: r.type,
      accountId: r.account_id,
      toAccountId: r.to_account_id,
      categoryId: r.category_id,
      amount: fromDbAmount(r.amount),
      occurredOn: r.occurred_on,
      merchant: r.merchant,
      note: r.note,
    });
    existing.set(key, (existing.get(key) ?? 0) + 1);
  }

  return planTransactionsImport(
    csvText,
    accountsRes.data,
    categoriesRes.data.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind as "expense" | "income",
      parentId: c.parent_id,
    })),
    existing,
  );
}

/**
 * Inserts planned rows in ONE statement, so the import is all-or-nothing:
 * the planner caps a file at MAX_IMPORT_ROWS precisely so it fits in a
 * single request, and a failure partway can never leave half a file in the
 * ledger.
 */
export async function insertPlannedTransactions(
  supabase: SupabaseClient<Database>,
  userId: string,
  rows: PlannedTransaction[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("transactions").insert(
    rows.map((r) => ({
      user_id: userId,
      type: r.type,
      account_id: r.accountId,
      to_account_id: r.toAccountId,
      category_id: r.categoryId,
      amount: toDbAmount(r.amount),
      currency: r.currency,
      occurred_on: r.occurredOn,
      merchant: r.merchant,
      note: r.note,
    })),
  );
  if (error) throw error;
}
