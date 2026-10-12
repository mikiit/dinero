"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { resolveDueAction } from "@/app/recurring/actions";

export type DueRow = {
  ruleId: string;
  /** The occurrence date (yyyy-MM-dd) this row acts on. */
  date: string;
  title: string;
  type: "expense" | "income" | "transfer";
  /** Minor units as a string (no bigint across the RSC boundary). */
  amount: string;
  accountName: string;
  /** Further occurrences waiting behind this one. */
  more: number;
};

function Row({ row }: { row: DueRow }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function decide(decision: "post" | "skip") {
    setError(null);
    startTransition(async () => {
      const result = await resolveDueAction(row.ruleId, row.date, decision);
      if (result.error) {
        setError(result.error);
        // Most likely handled elsewhere already: show the truth.
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground">
            {format(parseISO(row.date), "d MMM yyyy")} · {row.accountName}
            {row.more > 0 ? ` · +${row.more} more after this` : ""}
          </p>
        </div>
        <Amount
          value={BigInt(row.amount)}
          size="sm"
          tone={row.type === "income" ? "income" : row.type === "expense" ? "expense" : "transfer"}
          showUnit={false}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => decide("post")}>
          Post
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => decide("skip")}
        >
          Skip
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

/** Home's "due today" prompt for recurring rules that ask first. Renders
 * nothing when nothing is due. */
export function DueRecurring({ rows }: { rows: DueRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="Recurring entries due">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Due</h2>
        <Link
          href="/recurring"
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          Manage
        </Link>
      </div>
      <ul className="divide-y rounded-lg border">
        {rows.map((row) => (
          <Row key={`${row.ruleId}-${row.date}`} row={row} />
        ))}
      </ul>
    </section>
  );
}
