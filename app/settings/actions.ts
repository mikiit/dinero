"use server";

import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/sign-out";
import { revalidatePath } from "next/cache";
import { insertPlannedTransactions, planImportForUser } from "@/lib/db/import";
import type { ImportRowError } from "@/lib/import-transactions";
import { requireWriteContext } from "@/lib/context";
import { cookies } from "next/headers";
import { removeReceiptFolder } from "@/lib/db/receipts";
import { SPACE_COOKIE } from "@/lib/scope";

export type SignOutActionResult = { error?: string };

/**
 * No server-side redirect - the client does a hard `window.location`
 * navigation on success (see components/settings/account-section.tsx),
 * so the fresh anonymous session proxy.ts creates on the next request
 * renders cleanly instead of risking a stale render of the old account's
 * data still sitting in React Query's cache.
 */
export async function signOutAction(): Promise<SignOutActionResult> {
  const supabase = await createClient();

  try {
    await signOut(supabase);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to sign out.",
    };
  }

  return {};
}

export type ImportActionState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | {
      status: "preview";
      total: number;
      toInsert: number;
      duplicates: number;
      errors: ImportRowError[];
    }
  | { status: "done"; inserted: number; duplicates: number; skipped: number };

// Next.js caps a server-action body at 1 MB by default; stay under it so the
// user sees this message rather than a generic framework error.
const MAX_IMPORT_BYTES = 900 * 1024;

/**
 * Two-step CSV import behind one action: `mode=preview` plans the file and
 * reports counts/errors without writing; `mode=import` re-plans the same
 * file from scratch on the server and writes only what that fresh plan
 * says. The client never sends a plan back, so what is previewed and what
 * is written can't drift apart (or be tampered with).
 */
export async function importTransactionsAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", error: "Choose a CSV file first." };
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { status: "error", error: "File is too large (limit 900 KB)." };
  }

  const gate = await requireWriteContext();
  if (!gate.ctx) return { status: "error", error: gate.error };
  const { supabase, scope } = gate.ctx;

  try {
    const plan = await planImportForUser(supabase, scope, await file.text());

    if (formData.get("mode") !== "import") {
      return {
        status: "preview",
        total: plan.total,
        toInsert: plan.toInsert.length,
        duplicates: plan.duplicates,
        errors: plan.errors,
      };
    }

    await insertPlannedTransactions(supabase, scope, plan.toInsert);
    revalidatePath("/", "layout");
    return {
      status: "done",
      inserted: plan.toInsert.length,
      duplicates: plan.duplicates,
      skipped: plan.errors.length,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Import failed.",
    };
  }
}

export type DeleteAccountResult = { error?: string };

type DeletionCheck = { blocked_by: string | null; purge_space_ids: string[] };

function parseDeletionCheck(value: unknown): DeletionCheck | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const ids = v.purge_space_ids;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) return null;
  const blocked = v.blocked_by;
  if (blocked !== null && typeof blocked !== "string") return null;
  return { blocked_by: blocked, purge_space_ids: ids as string[] };
}

/**
 * Erases the signed-in person's account and everything in it.
 *
 * The order matters. Receipt photos live in storage, which only the person
 * themselves (while still signed in) may delete, so they go FIRST; if that
 * fails nothing has been deleted and they can simply try again. Only then
 * does the database function remove the rows and the login. (The reverse
 * order would leave photos behind that nobody could ever remove.)
 */
export async function deleteAccountAction(
  confirmation: string,
): Promise<DeleteAccountResult> {
  if (confirmation.trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const check = await supabase.rpc("account_deletion_check");
  const plan = check.error ? null : parseDeletionCheck(check.data);
  if (!plan) return { error: "Could not check your account. Nothing was deleted." };

  if (plan.blocked_by) {
    return {
      error: `You own a shared space with other people (${plan.blocked_by}). Make someone else an owner, or delete the space, first.`,
    };
  }

  try {
    for (const folder of [user.id, ...plan.purge_space_ids]) {
      await removeReceiptFolder(supabase, folder);
    }
  } catch (err) {
    console.error("account deletion: could not remove receipt photos", err);
    return { error: "Could not remove your receipt photos. Nothing was deleted - please try again." };
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    console.error("account deletion failed", error);
    return { error: error.message || "Could not delete the account." };
  }

  // The login is gone; clear what the browser still holds. Errors here do
  // not matter - the session no longer refers to anyone.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }
  (await cookies()).delete(SPACE_COOKIE);
  return {};
}
