import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fromDbAmount, toDbAmount } from "@/lib/money";

/** What the Add/Edit Transaction sheet can create - adjustment is its own
 * flow (createAdjustment below, "Set current balance"), though the list
 * still has to be able to *display* it if it exists. */
export type TransactionType = "expense" | "income" | "transfer";
export type AnyTransactionType = TransactionType | "adjustment";

export type Transaction = {
  id: string;
  type: AnyTransactionType;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  amount: bigint;
  currency: string;
  occurredOn: string;
  note: string | null;
  merchant: string | null;
};

export type TransactionFilters = {
  accountId?: string;
  categoryId?: string;
  type?: AnyTransactionType;
  /** Inclusive, YYYY-MM-DD. */
  dateFrom?: string;
  /** Inclusive, YYYY-MM-DD. */
  dateTo?: string;
  /** Matched against note OR merchant, case-insensitive substring. */
  search?: string;
};

export type TransactionsCursor = {
  occurredOn: string;
  createdAt: string;
  /** created_at alone isn't a reliable tiebreaker: rows inserted in the
   * same statement (bulk seeding, or just Postgres's now() being stable
   * within one transaction) can share the exact same created_at. id is
   * unique per row and makes the sort order - and therefore cursor
   * comparisons - strictly total. */
  id: string;
} | null;

export type TransactionsPage = {
  transactions: Transaction[];
  nextCursor: TransactionsCursor;
};

export type CreateTransactionInput = {
  type: TransactionType;
  accountId: string;
  /** Transfer only - the destination account. Ignored for expense/income. */
  toAccountId?: string | null;
  /** Expense/income only - null is written for transfer regardless of what's
   * passed here, matching the category_only_for_expense_income DB check. */
  categoryId?: string | null;
  amount: bigint;
  occurredOn: string;
  note?: string | null;
};

export type UpdateTransactionInput = CreateTransactionInput;

function toTransaction(
  row: Database["public"]["Tables"]["transactions"]["Row"],
): Transaction {
  return {
    id: row.id,
    type: row.type as AnyTransactionType,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    categoryId: row.category_id,
    amount: fromDbAmount(row.amount),
    currency: row.currency,
    occurredOn: row.occurred_on,
    note: row.note,
    merchant: row.merchant,
  };
}

/** PostgREST's `.or()` DSL uses `,` to separate conditions and `()` to
 * group them - strip those so a search term can never break out of the
 * intended note/merchant pair, and escape ilike's own wildcards so a
 * literal "%" or "_" in a note is matched literally. */
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[,()]/g, "").replace(/[%_]/g, (c) => `\\${c}`);
}

/** Builds the "strictly before this (occurred_on, created_at, id) tuple"
 * OR-condition for PostgREST, matching the (occurred_on desc, created_at
 * desc, id desc) sort order used throughout this file. id, not just
 * occurred_on/created_at, are all DB-controlled values (dates, timestamps,
 * UUIDs), never raw user input - unlike `search`, they don't need
 * sanitizing before interpolation. */
function beforeCursorFilter(cursor: {
  occurredOn: string;
  createdAt: string;
  id: string;
}): string {
  return [
    `occurred_on.lt.${cursor.occurredOn}`,
    `and(occurred_on.eq.${cursor.occurredOn},created_at.lt.${cursor.createdAt})`,
    `and(occurred_on.eq.${cursor.occurredOn},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
  ].join(",");
}

/** Same idea as beforeCursorFilter, but for the top-up query, which has
 * already pinned occurred_on via .eq() - only created_at/id need the
 * tiebreak. */
function beforeTimeIdFilter(createdAt: string, id: string): string {
  return [`created_at.lt.${createdAt}`, `and(created_at.eq.${createdAt},id.lt.${id})`].join(
    ",",
  );
}

/**
 * Fetches one page of transactions, most recent first, grouped-by-day-safe:
 * if the page's last row shares its occurred_on with rows beyond the page
 * limit, a supplemental query tops up the rest of that date so no day is
 * ever split across two pages - the list groups by day and shows daily
 * totals, and a partial day would make those totals wrong until more
 * pages loaded.
 */
export async function listTransactionsPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  filters: TransactionFilters,
  cursor: TransactionsCursor,
  pageSize = 40,
): Promise<TransactionsPage> {
  const searchPattern = filters.search?.trim()
    ? sanitizeSearchTerm(filters.search.trim())
    : null;

  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize);

  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.dateFrom) query = query.gte("occurred_on", filters.dateFrom);
  if (filters.dateTo) query = query.lte("occurred_on", filters.dateTo);
  if (searchPattern) {
    query = query.or(
      `note.ilike.%${searchPattern}%,merchant.ilike.%${searchPattern}%`,
    );
  }

  if (cursor) {
    query = query.or(beforeCursorFilter(cursor));
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const wasFullInitialPage = rows.length === pageSize;

  if (wasFullInitialPage) {
    const last = rows[rows.length - 1];
    let supplementalQuery = supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .eq("occurred_on", last.occurred_on)
      .or(beforeTimeIdFilter(last.created_at, last.id))
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (filters.accountId) {
      supplementalQuery = supplementalQuery.eq("account_id", filters.accountId);
    }
    if (filters.categoryId) {
      supplementalQuery = supplementalQuery.eq(
        "category_id",
        filters.categoryId,
      );
    }
    if (filters.type) {
      supplementalQuery = supplementalQuery.eq("type", filters.type);
    }
    if (filters.dateFrom) {
      supplementalQuery = supplementalQuery.gte(
        "occurred_on",
        filters.dateFrom,
      );
    }
    if (filters.dateTo) {
      supplementalQuery = supplementalQuery.lte("occurred_on", filters.dateTo);
    }
    if (searchPattern) {
      supplementalQuery = supplementalQuery.or(
        `note.ilike.%${searchPattern}%,merchant.ilike.%${searchPattern}%`,
      );
    }

    const { data: supplemental, error: supplementalError } =
      await supplementalQuery;
    if (supplementalError) throw supplementalError;

    rows.push(...(supplemental ?? []));
  }

  // wasFullInitialPage=false already proves there's no more data - fetching
  // fewer than pageSize rows with no cap other than pageSize itself means
  // Postgres had nothing left to give. Only when the page was exactly full
  // (so a boundary day might have been topped up) do we need to actually
  // check whether anything remains beyond the merged page's last row -
  // rows.length alone can't tell us that, since the top-up always grows
  // rows.length regardless of whether more *dates* exist after it.
  let nextCursor: TransactionsCursor = null;
  if (wasFullInitialPage && rows.length > 0) {
    const last = rows[rows.length - 1];
    const probeCursor = {
      occurredOn: last.occurred_on,
      createdAt: last.created_at,
      id: last.id,
    };

    let probeQuery = supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1);

    if (filters.accountId) probeQuery = probeQuery.eq("account_id", filters.accountId);
    if (filters.categoryId) probeQuery = probeQuery.eq("category_id", filters.categoryId);
    if (filters.type) probeQuery = probeQuery.eq("type", filters.type);
    if (filters.dateFrom) probeQuery = probeQuery.gte("occurred_on", filters.dateFrom);
    if (filters.dateTo) probeQuery = probeQuery.lte("occurred_on", filters.dateTo);
    if (searchPattern) {
      probeQuery = probeQuery.or(
        `note.ilike.%${searchPattern}%,merchant.ilike.%${searchPattern}%`,
      );
    }
    probeQuery = probeQuery.or(beforeCursorFilter(probeCursor));

    const { data: probeData, error: probeError } = await probeQuery;
    if (probeError) throw probeError;

    if ((probeData?.length ?? 0) > 0) {
      nextCursor = probeCursor;
    }
  }

  return {
    transactions: rows.map(toTransaction),
    nextCursor,
  };
}

/**
 * Inserts a single expense/income/transfer transaction. currency is looked
 * up from the source account rather than trusted from the caller - accounts
 * are always RSD today (no currency picker exists yet, SPEC.md Phase 3), but
 * this stays correct once that changes instead of silently hardcoding it.
 * For a transfer, the `transactions` table's own CHECK constraints
 * (transfer_requires_to_account, transfer_not_to_self,
 * category_only_for_expense_income) are the last line of defense if a
 * caller ever gets the type/toAccountId/categoryId combination wrong.
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
    to_account_id: input.type === "transfer" ? (input.toAccountId ?? null) : null,
    category_id: input.type === "transfer" ? null : (input.categoryId ?? null),
    amount: toDbAmount(input.amount),
    currency: account.currency,
    occurred_on: input.occurredOn,
    note: input.note ?? null,
  });

  if (error) throw error;
}

export async function updateTransaction(
  supabase: SupabaseClient<Database>,
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput,
): Promise<void> {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", input.accountId)
    .eq("user_id", userId)
    .single();

  if (accountError) throw accountError;

  const { error } = await supabase
    .from("transactions")
    .update({
      type: input.type,
      account_id: input.accountId,
      to_account_id: input.type === "transfer" ? (input.toAccountId ?? null) : null,
      category_id: input.type === "transfer" ? null : (input.categoryId ?? null),
      amount: toDbAmount(input.amount),
      currency: account.currency,
      occurred_on: input.occurredOn,
      note: input.note ?? null,
    })
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function softDeleteTransaction(
  supabase: SupabaseClient<Database>,
  userId: string,
  transactionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function restoreTransaction(
  supabase: SupabaseClient<Database>,
  userId: string,
  transactionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: null })
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (error) throw error;
}

/**
 * Plain, unpaginated "most recent N" fetch for the Home dashboard. Doesn't
 * use listTransactionsPage's day-boundary top-up - that machinery exists
 * to keep the Transactions list's day groups/totals complete, which
 * doesn't apply here (Home shows a flat list, not day groups), and would
 * make "last 10" sometimes return more than 10.
 */
export async function listRecentTransactions(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 10,
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(toTransaction);
}

export type MonthlySummary = {
  income: bigint;
  expense: bigint;
};

/**
 * This month's income/expense totals for the Home dashboard, from the
 * monthly_summary view - a SQL aggregate, not a sum of raw rows in
 * TypeScript (CLAUDE.md rule 2). monthIso is the first of the target
 * month, e.g. "2026-08-01".
 */
export async function getMonthlySummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  monthIso: string,
): Promise<MonthlySummary> {
  const { data, error } = await supabase
    .from("monthly_summary")
    .select("income, expense")
    .eq("user_id", userId)
    .eq("month", monthIso)
    .maybeSingle();

  if (error) throw error;

  return {
    income: fromDbAmount(data?.income ?? 0),
    expense: fromDbAmount(data?.expense ?? 0),
  };
}

/**
 * Writes a single signed adjustment transaction for "Set current balance" -
 * never touches opening_balance (CLAUDE.md rule 2: balances are derived,
 * never overwritten). delta is target - current derived balance, computed
 * by the caller from account_balances; a delta of exactly zero is the
 * caller's responsibility to skip (the amount_sign_matches_type CHECK
 * constraint also rejects a zero-amount adjustment as a backstop).
 */
export async function createAdjustment(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
  delta: bigint,
  occurredOn: string,
): Promise<void> {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", accountId)
    .eq("user_id", userId)
    .single();

  if (accountError) throw accountError;

  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    type: "adjustment",
    account_id: accountId,
    category_id: null,
    amount: toDbAmount(delta),
    currency: account.currency,
    occurred_on: occurredOn,
  });

  if (error) throw error;
}
