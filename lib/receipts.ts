// Pure receipt helpers: where an object lives, what may be uploaded. The
// path shape matters for security - the storage policies authorize by the
// first folder (the user id), and the server re-checks the whole shape
// before it will store a path on a transaction.

export const RECEIPT_BUCKET = "receipts";

/** Matches the bucket's own limit (supabase/migrations/*_receipts_bucket). */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export const RECEIPT_MIME_TYPES = Object.keys(EXTENSIONS);

export function extensionFor(mimeType: string): string | null {
  return EXTENSIONS[mimeType] ?? null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function buildReceiptPath(
  userId: string,
  transactionId: string,
  objectId: string,
  extension: string,
): string {
  return `${userId}/${transactionId}/${objectId}.${extension}`;
}

/** True only for "<userId>/<transactionId>/<uuid>.<ext>" with exactly these
 * two ids: a path for someone else's folder, another transaction, or with
 * any ".." / extra segments is rejected. */
export function isReceiptPathFor(
  path: string,
  userId: string,
  transactionId: string,
): boolean {
  const pattern = new RegExp(
    `^${userId}/${transactionId}/${UUID}\\.(${Object.values(EXTENSIONS).join("|")})$`,
    "i",
  );
  return /^[0-9a-f-]{36}$/i.test(userId) &&
    /^[0-9a-f-]{36}$/i.test(transactionId) &&
    pattern.test(path);
}

/** Null when the file is acceptable, otherwise a message for the user. */
export function validateReceiptFile(file: { type: string; size: number }): string | null {
  if (!RECEIPT_MIME_TYPES.includes(file.type)) {
    return "Choose a photo (JPEG, PNG, WebP or HEIC).";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_RECEIPT_BYTES) {
    return "That photo is larger than 5 MB.";
  }
  return null;
}

/** Longest edge, in pixels, a receipt photo is scaled down to before
 * upload: legible for a till receipt, a fraction of a phone camera's size. */
export const RECEIPT_MAX_EDGE = 1600;

/** Dimensions after scaling to fit RECEIPT_MAX_EDGE, never enlarging. */
export function scaledSize(
  width: number,
  height: number,
  maxEdge: number = RECEIPT_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
