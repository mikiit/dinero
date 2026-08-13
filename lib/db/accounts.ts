import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fromDbAmount, toDbAmount } from "@/lib/money";

export type AccountType = "cash" | "debit" | "credit" | "savings";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: bigint;
  color: string | null;
  icon: string | null;
  creditLimit: bigint | null;
  statementDay: number | null;
  dueDay: number | null;
  includeInNetWorth: boolean;
  sortOrder: number;
  /** From account_balances - opening_balance + sum(transactions), computed
   * entirely in SQL. Never recompute this in TypeScript (CLAUDE.md rule 2). */
  balance: bigint;
};

export type CreateAccountInput = {
  name: string;
  type: AccountType;
  openingBalance: bigint;
  creditLimit?: bigint | null;
  statementDay?: number | null;
  dueDay?: number | null;
  includeInNetWorth?: boolean;
  color?: string | null;
  icon?: string | null;
};

/** type and currency are immutable after creation (also enforced by a DB
 * trigger - see supabase/migrations/*_lock_account_type_and_currency.sql) -
 * neither is settable here. */
export type UpdateAccountInput = {
  name?: string;
  creditLimit?: bigint | null;
  statementDay?: number | null;
  dueDay?: number | null;
  includeInNetWorth?: boolean;
  color?: string | null;
  icon?: string | null;
};

function toAccount(
  row: Database["public"]["Tables"]["accounts"]["Row"],
  balance: bigint,
): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    currency: row.currency,
    openingBalance: fromDbAmount(row.opening_balance),
    color: row.color,
    icon: row.icon,
    creditLimit: row.credit_limit === null ? null : fromDbAmount(row.credit_limit),
    statementDay: row.statement_day,
    dueDay: row.due_day,
    includeInNetWorth: row.include_in_net_worth,
    sortOrder: row.sort_order,
    balance,
  };
}

/**
 * Lists a user's non-archived accounts with their current balance. Balance
 * always comes from the account_balances view - never recomputed here.
 */
export async function listAccounts(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Account[]> {
  const [accountsResult, balancesResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("account_balances")
      .select("account_id, balance")
      .eq("user_id", userId),
  ]);

  if (accountsResult.error) throw accountsResult.error;
  if (balancesResult.error) throw balancesResult.error;

  const balanceByAccountId = new Map(
    (balancesResult.data ?? []).map((b) => [b.account_id as string, b.balance]),
  );

  return (accountsResult.data ?? []).map((row) =>
    toAccount(row, fromDbAmount(balanceByAccountId.get(row.id) ?? 0)),
  );
}

/**
 * Fetches one account's current derived balance fresh - used right before
 * writing a "set current balance" adjustment, since the delta must be
 * computed against the true current balance at write time, not whatever
 * the client last saw when the page loaded.
 */
export async function getAccountBalance(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
): Promise<bigint> {
  const { data, error } = await supabase
    .from("account_balances")
    .select("balance")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) throw error;
  return fromDbAmount(data?.balance ?? 0);
}

export async function createAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateAccountInput,
): Promise<void> {
  const { error } = await supabase.from("accounts").insert({
    user_id: userId,
    name: input.name,
    type: input.type,
    opening_balance: toDbAmount(input.openingBalance),
    credit_limit:
      input.creditLimit == null ? null : toDbAmount(input.creditLimit),
    statement_day: input.statementDay ?? null,
    due_day: input.dueDay ?? null,
    include_in_net_worth: input.includeInNetWorth ?? true,
    color: input.color ?? null,
    icon: input.icon ?? null,
  });

  if (error) throw error;
}

export async function updateAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
  input: UpdateAccountInput,
): Promise<void> {
  const patch: Database["public"]["Tables"]["accounts"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.creditLimit !== undefined) {
    patch.credit_limit =
      input.creditLimit == null ? null : toDbAmount(input.creditLimit);
  }
  if (input.statementDay !== undefined) patch.statement_day = input.statementDay;
  if (input.dueDay !== undefined) patch.due_day = input.dueDay;
  if (input.includeInNetWorth !== undefined) {
    patch.include_in_net_worth = input.includeInNetWorth;
  }
  if (input.color !== undefined) patch.color = input.color;
  if (input.icon !== undefined) patch.icon = input.icon;

  const { error } = await supabase
    .from("accounts")
    .update(patch)
    .eq("id", accountId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function archiveAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
): Promise<void> {
  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", accountId)
    .eq("user_id", userId);

  if (error) throw error;
}
