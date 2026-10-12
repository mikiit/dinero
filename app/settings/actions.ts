"use server";

import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/sign-out";
import { revalidatePath } from "next/cache";
import { insertPlannedTransactions, planImportForUser } from "@/lib/db/import";
import type { ImportRowError } from "@/lib/import-transactions";
import { requireWriteContext } from "@/lib/context";

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
