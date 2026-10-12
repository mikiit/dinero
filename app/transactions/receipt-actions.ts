"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  attachReceipt,
  getReceiptSignedUrl,
  removeReceipt,
} from "@/lib/db/receipts";

export type ReceiptActionResult = { error?: string };

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/** A short-lived link for displaying a receipt; null if it can't be shown. */
export async function getReceiptUrlAction(path: string): Promise<string | null> {
  const { supabase, userId } = await session();
  if (!userId) return null;
  return getReceiptSignedUrl(supabase, userId, path);
}

export async function attachReceiptAction(
  transactionId: string,
  path: string,
): Promise<ReceiptActionResult> {
  try {
    const { supabase, userId } = await session();
    if (!userId) return { error: "Not signed in." };
    await attachReceipt(supabase, userId, transactionId, path);
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
    const { supabase, userId } = await session();
    if (!userId) return { error: "Not signed in." };
    await removeReceipt(supabase, userId, transactionId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the photo." };
  }
  revalidatePath("/");
  return {};
}
