import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { RECEIPT_BUCKET, isReceiptPathFor } from "@/lib/receipts";

/** How long a signed link to a receipt works. Long enough to look at the
 * photo, short enough that a copied link is not a standing key. */
const SIGNED_URL_SECONDS = 60 * 60;

/** A short-lived link to display a receipt, or null if there is none to
 * show. Only paths in the caller's own folder are signed - the storage
 * policy would refuse anyway, but a clear check here keeps this honest. */
export async function getReceiptSignedUrl(
  supabase: SupabaseClient<Database>,
  userId: string,
  path: string,
): Promise<string | null> {
  if (!path.startsWith(`${userId}/`)) return null;
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

async function currentReceiptPath(
  supabase: SupabaseClient<Database>,
  userId: string,
  transactionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("receipt_url")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data.receipt_url;
}

/** Deleting the object is best effort: a failure leaves an orphan file, not
 * a broken transaction, so it must never fail the operation that already
 * succeeded. */
async function removeObject(
  supabase: SupabaseClient<Database>,
  path: string | null,
): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
  if (error) console.error("receipt: could not delete object", path, error);
}

/**
 * Points a transaction at an already-uploaded receipt, replacing (and
 * deleting) any previous one. The path must be exactly
 * "<this user>/<this transaction>/<uuid>.<ext>".
 */
export async function attachReceipt(
  supabase: SupabaseClient<Database>,
  userId: string,
  transactionId: string,
  path: string,
): Promise<void> {
  if (!isReceiptPathFor(path, userId, transactionId)) {
    throw new Error("Invalid receipt.");
  }
  const previous = await currentReceiptPath(supabase, userId, transactionId);

  const { error } = await supabase
    .from("transactions")
    .update({ receipt_url: path })
    .eq("id", transactionId)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;

  if (previous && previous !== path) await removeObject(supabase, previous);
}

/** Clears the receipt from a transaction, then deletes the photo. */
export async function removeReceipt(
  supabase: SupabaseClient<Database>,
  userId: string,
  transactionId: string,
): Promise<void> {
  const previous = await currentReceiptPath(supabase, userId, transactionId);

  const { error } = await supabase
    .from("transactions")
    .update({ receipt_url: null })
    .eq("id", transactionId)
    .eq("user_id", userId);
  if (error) throw error;

  await removeObject(supabase, previous);
}
