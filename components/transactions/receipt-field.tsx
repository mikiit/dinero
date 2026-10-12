"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getReceiptUrlAction } from "@/app/transactions/receipt-actions";
import {
  deleteUploadedReceipt,
  prepareReceiptImage,
  uploadReceipt,
} from "@/lib/receipts-client";
import { RECEIPT_MIME_TYPES } from "@/lib/receipts";

type Result = { error?: string };

/**
 * Attach / view / replace / remove a receipt photo. It owns the upload and
 * the preview; what "attached" means is the caller's business, passed as
 * callbacks:
 *   - editing an existing transaction: attach/remove hit the database now;
 *   - adding a new one: attach just remembers the path until Save.
 * If `onAttach` fails, the object just uploaded is deleted again so a
 * failed attach never leaves a stray file behind.
 */
export function ReceiptField({
  transactionId,
  path,
  onAttach,
  onRemove,
}: {
  transactionId: string;
  /** The currently attached object path, or null. */
  path: string | null;
  onAttach: (path: string) => Promise<Result>;
  onRemove: (path: string) => Promise<Result>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A blob URL for a photo picked this session shows instantly, with no
  // round trip; a receipt that was already attached is fetched as a link.
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path || localPreview) return;
    let cancelled = false;
    getReceiptUrlAction(path).then((url) => {
      if (!cancelled) setSignedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path, localPreview]);

  // Release the blob URL when it is replaced or the field goes away.
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    let uploaded: string | null = null;
    try {
      const prepared = await prepareReceiptImage(file);
      uploaded = await uploadReceipt(prepared, transactionId);
      const result = await onAttach(uploaded);
      if (result.error) {
        await deleteUploadedReceipt(uploaded);
        setError(result.error);
        return;
      }
      setLocalPreview(URL.createObjectURL(prepared.blob));
      setSignedUrl(null);
    } catch (err) {
      if (uploaded) await deleteUploadedReceipt(uploaded);
      setError(err instanceof Error ? err.message : "Could not add the photo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!path) return;
    setError(null);
    setBusy(true);
    const result = await onRemove(path);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setLocalPreview(null);
    setSignedUrl(null);
  }

  const previewUrl = localPreview ?? signedUrl;

  return (
    <div className="space-y-2">
      <Label htmlFor="receipt">Receipt photo (optional)</Label>

      {path && (
        <div className="flex items-center gap-3">
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noreferrer" aria-label="Open receipt photo">
              {/* A signed Storage URL, not a static asset: next/image would
                  need the host allow-listed and adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Receipt"
                className="h-20 w-20 rounded-lg border object-cover"
              />
            </a>
          ) : (
            <div className="h-20 w-20 animate-pulse rounded-lg border bg-muted" />
          )}
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy}>
            Remove
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        id="receipt"
        type="file"
        accept={RECEIPT_MIME_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <CameraIcon />
        {busy ? "Uploading…" : path ? "Replace photo" : "Add photo"}
      </Button>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
