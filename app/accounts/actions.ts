"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  archiveAccount,
  createAccount,
  updateAccount,
  type AccountType,
} from "@/lib/db/accounts";
import { toMinor } from "@/lib/money";

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: "error", error: "Not signed in." };
    }

    const type = parseAccountType(formData.get("type"));
    const openingBalanceRaw = formData.get("openingBalance");
    const openingBalance =
      typeof openingBalanceRaw === "string" && openingBalanceRaw.trim() !== ""
        ? toMinor(openingBalanceRaw)
        : 0n;

    await createAccount(supabase, user.id, {
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: "error", error: "Not signed in." };
    }

    const accountId = formData.get("accountId");
    if (typeof accountId !== "string" || accountId === "") {
      throw new Error("Missing account id.");
    }

    // type can't be changed after creation (DB trigger enforces this too) -
    // this is the account's existing type, carried through a hidden field
    // purely to decide whether the credit-only fields below apply. It is
    // never written back.
    const type = parseAccountType(formData.get("type"));

    await updateAccount(supabase, user.id, accountId, {
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

export async function archiveAccountAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const accountId = formData.get("accountId");
  if (typeof accountId !== "string" || accountId === "") return;

  await archiveAccount(supabase, user.id, accountId);
  revalidatePath("/accounts");
}
