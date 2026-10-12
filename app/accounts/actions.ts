"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import {
  archiveAccount,
  restoreAccount,
  createAccount,
  getAccountBalance,
  updateAccount,
  type AccountType,
} from "@/lib/db/accounts";
import { createAdjustment } from "@/lib/db/transactions";
import { toMinor } from "@/lib/money";
import { requireWriteContext } from "@/lib/context";

export type AccountFormState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success" };

const ACCOUNT_TYPES: readonly AccountType[] = [
  "cash",
  "debit",
  "credit",
  "savings",
];

function parseAccountType(value: FormDataEntryValue | null): AccountType {
  if (typeof value === "string" && (ACCOUNT_TYPES as string[]).includes(value)) {
    return value as AccountType;
  }
  throw new Error(`Invalid account type: ${String(value)}`);
}

function parseRequiredName(value: FormDataEntryValue | null): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name === "") {
    throw new Error("Name is required.");
  }
  return name;
}

function parseOptionalMoney(value: FormDataEntryValue | null): bigint | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return toMinor(value);
}

function parseOptionalDay(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 28) {
    throw new Error(`Day must be between 1 and 28: ${value}`);
  }
  return n;
}

export async function createAccountAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) {
      return { status: "error", error: gate.error };
    }
    const { supabase, scope } = gate.ctx;

    const type = parseAccountType(formData.get("type"));
    const openingBalanceRaw = formData.get("openingBalance");
    const openingBalance =
      typeof openingBalanceRaw === "string" && openingBalanceRaw.trim() !== ""
        ? toMinor(openingBalanceRaw)
        : 0n;

    await createAccount(supabase, scope, {
      name: parseRequiredName(formData.get("name")),
      type,
      openingBalance,
      creditLimit:
        type === "credit" ? parseOptionalMoney(formData.get("creditLimit")) : null,
      statementDay:
        type === "credit" ? parseOptionalDay(formData.get("statementDay")) : null,
      dueDay: type === "credit" ? parseOptionalDay(formData.get("dueDay")) : null,
      includeInNetWorth: formData.get("includeInNetWorth") === "on",
    });
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Failed to create account.",
    };
  }

  revalidatePath("/accounts");
  return { status: "success" };
}

export async function updateAccountAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) {
      return { status: "error", error: gate.error };
    }
    const { supabase, scope } = gate.ctx;

    const accountId = formData.get("accountId");
    if (typeof accountId !== "string" || accountId === "") {
      throw new Error("Missing account id.");
    }

    // type can't be changed after creation (DB trigger enforces this too) -
    // this is the account's existing type, carried through a hidden field
    // purely to decide whether the credit-only fields below apply. It is
    // never written back.
    const type = parseAccountType(formData.get("type"));

    await updateAccount(supabase, scope, accountId, {
      name: parseRequiredName(formData.get("name")),
      creditLimit:
        type === "credit" ? parseOptionalMoney(formData.get("creditLimit")) : null,
      statementDay:
        type === "credit" ? parseOptionalDay(formData.get("statementDay")) : null,
      dueDay: type === "credit" ? parseOptionalDay(formData.get("dueDay")) : null,
      includeInNetWorth: formData.get("includeInNetWorth") === "on",
    });
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Failed to update account.",
    };
  }

  revalidatePath("/accounts");
  return { status: "success" };
}

export type ArchiveResult = { error?: string };

export async function archiveAccountAction(accountId: string): Promise<ArchiveResult> {
  const gate = await requireWriteContext();
  if (!gate.ctx) return { error: gate.error };
  const { supabase, scope } = gate.ctx;
  if (!accountId) return { error: "Missing account." };

  try {
    await archiveAccount(supabase, scope, accountId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not archive." };
  }
  revalidatePath("/", "layout");
  return {};
}

/** Undo for archiveAccountAction. */
export async function restoreAccountAction(accountId: string): Promise<ArchiveResult> {
  const gate = await requireWriteContext();
  if (!gate.ctx) return { error: gate.error };
  const { supabase, scope } = gate.ctx;
  if (!accountId) return { error: "Missing account." };

  try {
    await restoreAccount(supabase, scope, accountId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not restore." };
  }
  revalidatePath("/", "layout");
  return {};
}

export type SetAccountBalanceResult = {
  error?: string;
  /** True when the target already matched the current balance - nothing
   * was written (an adjustment of exactly zero is also rejected by the
   * amount_sign_matches_type CHECK constraint, so this check avoids
   * hitting the DB at all for the expected no-op case). */
  noChange?: boolean;
};

/**
 * "Set current balance": writes a single signed adjustment transaction for
 * the difference between the target and the *current derived* balance -
 * never touches opening_balance (CLAUDE.md rule 2). targetBalance must
 * already be correctly signed by the caller (e.g. the UI negates a credit
 * card's "Owed" input before sending, since the account's true balance
 * convention is negative = owed).
 */
export async function setAccountBalanceAction(input: {
  accountId: string;
  targetBalance: string;
}): Promise<SetAccountBalanceResult> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;

    if (!input.accountId) return { error: "Missing account." };

    const target = toMinor(input.targetBalance);
    const current = await getAccountBalance(supabase, scope, input.accountId);
    const delta = target - current;

    if (delta === 0n) {
      return { noChange: true };
    }

    await createAdjustment(
      supabase,
      scope,
      input.accountId,
      delta,
      format(new Date(), "yyyy-MM-dd"),
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to set balance.",
    };
  }

  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}
