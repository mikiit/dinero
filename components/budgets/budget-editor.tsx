"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/ui/amount";
import { toDecimalString } from "@/lib/money";
import {
  copyBudgetsAction,
  setBudgetAction,
} from "@/app/budgets/actions";

export type BudgetRowData = {
  categoryId: string;
  name: string;
  /** Current budget in minor units, or null when none is set. */
  budget: bigint | null;
  /** Spent so far this month in this category (incl. sub-categories). */
  spent: bigint;
};

function BudgetRow({
  row,
  monthStartIso,
  currency,
  readOnly,
}: {
  row: BudgetRowData;
  monthStartIso: string;
  currency: string;
  readOnly: boolean;
}) {
  const saved = row.budget === null ? "" : toDecimalString(row.budget);
  const [value, setValue] = useState(saved);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = value.trim() !== saved;

  // Controlled input + a manual action call, not a <form action>: React 19
  // resets a form after its action finishes, which would snap the field back
  // to the OLD value before the refreshed props arrive.
  function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await setBudgetAction(row.categoryId, monthStartIso, currency, value);
      if (result.error) {
        setMessage({ text: result.error, isError: true });
        return;
      }
      setMessage({ text: value.trim() === "" ? "Cleared" : "Saved", isError: false });
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">{row.name}</span>
        <span className="flex shrink-0 items-baseline gap-1.5 text-xs text-muted-foreground">
          spent
          <Amount value={row.spent} currency={currency} size="sm" tone="muted" showUnit={false} />
        </span>
      </div>
      <form onSubmit={save} className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          placeholder="No budget"
          aria-label={`Budget for ${row.name}`}
          value={value}
          disabled={readOnly}
          onChange={(e) => {
            setValue(e.target.value);
            setMessage(null);
          }}
          className="font-mono"
        />
        <Button type="submit" size="sm" disabled={readOnly || !dirty || isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </form>
      {message && (
        <p
          role={message.isError ? "alert" : "status"}
          className={
            message.isError
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

export function BudgetEditor({
  rows,
  monthStartIso,
  currency,
  readOnly = false,
}: {
  rows: BudgetRowData[];
  monthStartIso: string;
  currency: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  function copyPrevious() {
    setCopyMessage(null);
    startTransition(async () => {
      const result = await copyBudgetsAction(monthStartIso, currency);
      if (result.error) {
        setCopyMessage(result.error);
        return;
      }
      setCopyMessage(
        result.added
          ? `Copied ${result.added} budget${result.added === 1 ? "" : "s"} from last month.`
          : "Nothing to copy: last month has no budgets that are missing here.",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={copyPrevious}
          disabled={isPending || readOnly}
        >
          {isPending ? "Copying…" : "Copy last month's budgets"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Only fills categories that have no budget yet; it never overwrites
          one you set.
        </p>
        {copyMessage && (
          <p role="status" className="text-xs">
            {copyMessage}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No expense categories yet. Add one under Categories first.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            // Keyed by month and saved value: moving month or a refresh after
            // save remounts the row so the input always reflects the DB.
            <BudgetRow
              key={`${monthStartIso}-${currency}-${row.categoryId}-${String(row.budget)}`}
              row={row}
              monthStartIso={monthStartIso}
              currency={currency}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
