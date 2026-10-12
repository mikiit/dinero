"use client";

import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  importTransactionsAction,
  type ImportActionState,
} from "@/app/settings/actions";

const MAX_ERRORS_SHOWN = 10;

export function ImportSection() {
  // React 19 resets the form (clearing the file input) once a form action
  // finishes, so "Check file" would leave "Import" with nothing to send. The
  // chosen File lives in state instead and is re-attached on every submit.
  const [file, setFile] = useState<File | null>(null);
  const [state, formAction, isPending] = useActionState<
    ImportActionState,
    FormData
  >(async (prev, formData) => {
    if (file) formData.set("file", file);
    return importTransactionsAction(prev, formData);
  }, { status: "idle" });

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Import transactions (CSV)</p>
        <p className="text-xs text-muted-foreground">
          Use a file exported from this app. Accounts and categories must
          already exist, rows that are already in your ledger are skipped, and
          nothing is written until you confirm.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label
          htmlFor="import-file"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Choose file
        </label>
        <input
          id="import-file"
          type="file"
          name="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <span className="truncate text-sm text-muted-foreground">
          {file ? file.name : "No file chosen"}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="mode"
          value="preview"
          variant="outline"
          size="sm"
          disabled={isPending}
        >
          {isPending ? "Checking…" : "Check file"}
        </Button>
        {state.status === "preview" && state.toInsert > 0 && (
          <Button
            type="submit"
            name="mode"
            value="import"
            size="sm"
            disabled={isPending}
          >
            Import {state.toInsert} transaction{state.toInsert === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      <div aria-live="polite" className="space-y-2 text-sm">
        {state.status === "error" && (
          <p className="text-destructive">{state.error}</p>
        )}

        {state.status === "preview" && (
          <>
            <p>
              {state.total} row{state.total === 1 ? "" : "s"} in file:{" "}
              <strong>{state.toInsert} new</strong>, {state.duplicates} already
              in your ledger, {state.errors.length} with errors.
            </p>
            {state.errors.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">
                  Rows with errors are skipped. Fix them in the file and check
                  again, or import the rest.
                </p>
                <ul className="space-y-1 text-xs text-destructive">
                  {state.errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
                    <li key={`${e.line}-${e.message}`}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                  {state.errors.length > MAX_ERRORS_SHOWN && (
                    <li>…and {state.errors.length - MAX_ERRORS_SHOWN} more.</li>
                  )}
                </ul>
              </>
            )}
          </>
        )}

        {state.status === "done" && (
          <p>
            Imported <strong>{state.inserted}</strong> transaction
            {state.inserted === 1 ? "" : "s"}. Skipped {state.duplicates}{" "}
            duplicate{state.duplicates === 1 ? "" : "s"}
            {state.skipped > 0 ? ` and ${state.skipped} with errors` : ""}.
          </p>
        )}
      </div>
    </form>
  );
}
