import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { RECEIPT_BUCKET, isReceiptPathFor } from "@/lib/receipts";
import { receiptOwnerKey, scopeFilter, type Scope } from "@/lib/scope";

/** How long a signed link to a receipt works. Long enough to look at the
 * photo, short enough that a copied link is not a standing key. */
const SIGNED_URL_SECONDS = 60 * 60;

/** A short-lived link to display a receipt, or null if there is none to
 * show. Only paths in the caller's own folder are signed - the storage
 * policy would refuse anyway, but a clear check here keeps this honest. */
export async function getReceiptSignedUrl(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  path: string,
): Promise<string | null> {
  if (!path.startsWith(`${receiptOwnerKey(scope)}/`)) return null;
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

async function currentReceiptPath(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  transactionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("receipt_url")
    .eq("id", transactionId)
    .filter(...scopeFilter(scope))
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
  scope: Scope,
  transactionId: string,
  path: string,
): Promise<void> {
  if (!isReceiptPathFor(path, receiptOwnerKey(scope), transactionId)) {
    throw new Error("Invalid receipt.");
  }
  const previous = await currentReceiptPath(supabase, scope, transactionId);

  const { error } = await supabase
    .from("transactions")
    .update({ receipt_url: path })
    .eq("id", transactionId)
    .filter(...scopeFilter(scope))
    .is("deleted_at", null);
  if (error) throw error;

  if (previous && previous !== path) await removeObject(supabase, previous);
}

/** Clears the receipt from a transaction, then deletes the photo. */
export async function removeReceipt(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  transactionId: string,
): Promise<void> {
  const previous = await currentReceiptPath(supabase, scope, transactionId);

  const { error } = await supabase
    .from("transactions")
    .update({ receipt_url: null })
    .eq("id", transactionId)
    .filter(...scopeFilter(scope));
  if (error) throw error;

  await removeObject(supabase, previous);
}

type ReceiptBucket = ReturnType<SupabaseClient<Database>["storage"]["from"]>;

/** Every file under `prefix`, descending into the per-transaction folders
 * (receipts live at "<owner>/<transaction>/<file>"). Paged: a listing returns
 * at most 100 entries at a time. */
async function listAllFiles(bucket: ReceiptBucket, prefix: string): Promise<string[]> {
  const PAGE = 100;
  const files: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    for (const entry of data) {
      // A folder has no id; a file does.
      if (entry.id === null) {
        files.push(...(await listAllFiles(bucket, `${prefix}/${entry.name}`)));
      } else {
        files.push(`${prefix}/${entry.name}`);
      }
    }
    if (data.length < PAGE) break;
  }
  return files;
}

/**
 * Deletes every receipt photo in one owner folder (a user id or a space id).
 * Unlike removeObject this is NOT best effort: it is part of erasing an
 * account, so a failure must stop that rather than leave photos behind.
 */
export async function removeReceiptFolder(
  supabase: SupabaseClient<Database>,
  folder: string,
): Promise<number> {
  const bucket = supabase.storage.from(RECEIPT_BUCKET);
  const files = await listAllFiles(bucket, folder);
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await bucket.remove(files.slice(i, i + 100));
    if (error) throw error;
  }
  return files.length;
}
