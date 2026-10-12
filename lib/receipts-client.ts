"use client";

import { createClient } from "@/lib/supabase/client";
import {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPT_INPUT_BYTES,
  RECEIPT_BUCKET,
  RECEIPT_MAX_EDGE,
  buildReceiptPath,
  extensionFor,
  scaledSize,
  validateReceiptFile,
} from "@/lib/receipts";

export type PreparedReceipt = { blob: Blob; mimeType: string };

/**
 * Shrinks a phone photo before upload: a modern camera shot is several MB,
 * a legible receipt is a few hundred KB at 1600px. Falls back to the
 * original file when the browser can't decode it (HEIC outside Safari), in
 * which case the stored 5 MB limit applies to that original. Throws a
 * user-facing Error on an unacceptable file.
 */
export async function prepareReceiptImage(file: File): Promise<PreparedReceipt> {
  // The picker limit is generous (the photo is about to be shrunk); the
  // stored limit is enforced on whatever actually gets uploaded, below.
  const problem = validateReceiptFile(file, MAX_RECEIPT_INPUT_BYTES);
  if (problem) throw new Error(problem);

  try {
    // imageOrientation "from-image" applies the EXIF rotation, so a photo
    // taken in portrait isn't uploaded sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = scaledSize(bitmap.width, bitmap.height, RECEIPT_MAX_EDGE);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    // Keep whichever is smaller: re-encoding an already tiny image can grow it.
    if (blob && blob.size < file.size && blob.size <= MAX_RECEIPT_BYTES) {
      return { blob, mimeType: "image/jpeg" };
    }
  } catch {
    // Not decodable here: fall through to the original.
  }

  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error(
      "That photo is too large and can't be shrunk in this browser. Try a smaller one.",
    );
  }
  return { blob: file, mimeType: file.type };
}

/** Uploads straight from the browser to Storage under the user's own
 * folder (the bucket policy enforces it), so a multi-MB photo never goes
 * through a server action's 1 MB body limit. Returns the object path. */
export async function uploadReceipt(
  prepared: PreparedReceipt,
  transactionId: string,
): Promise<string> {
  const extension = extensionFor(prepared.mimeType);
  if (!extension) throw new Error("Choose a photo (JPEG, PNG, WebP or HEIC).");

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");

  const path = buildReceiptPath(
    session.user.id,
    transactionId,
    crypto.randomUUID(),
    extension,
  );
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, prepared.blob, { contentType: prepared.mimeType, upsert: false });
  if (error) throw new Error("Could not upload the photo. Please try again.");
  return path;
}

/** Deletes an uploaded object (used to clean up a photo that never got
 * attached). Best effort - a leftover file is harmless. */
export async function deleteUploadedReceipt(path: string): Promise<void> {
  const { error } = await createClient().storage.from(RECEIPT_BUCKET).remove([path]);
  if (error) console.error("receipt: could not delete object", path, error);
}
