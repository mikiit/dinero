"use server";

import { revalidatePath } from "next/cache";
import { getContext, requireWriteContext } from "@/lib/context";
import {
  attachReceipt,
  getReceiptSignedUrl,
  removeReceipt,
} from "@/lib/db/receipts";

export type ReceiptActionResult = { error?: string };

/** A short-lived link for displaying a receipt; null if it can't be shown. */
export async function getReceiptUrlAction(path: string): Promise<string | null> {
  const ctx = await getContext();
  if (!ctx) return null;
  return getReceiptSignedUrl(ctx.supabase, ctx.scope, path);
}

export async function attachReceiptAction(
  transactionId: string,
  path: string,
): Promise<ReceiptActionResult> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    await attachReceipt(gate.ctx.supabase, gate.ctx.scope, transactionId, path);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not attach the photo." };
  }
  revalidatePath("/");
  return {};
}

export async function removeReceiptAction(
  transactionId: string,
): Promise<ReceiptActionResult> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    await removeReceipt(gate.ctx.supabase, gate.ctx.scope, transactionId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the photo." };
  }
  revalidatePath("/");
  return {};
}
