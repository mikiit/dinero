import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { formatRSD } from "@/lib/money";
import type { BudgetProgress } from "@/lib/budgets";
import { cn } from "@/lib/utils";

export type BudgetProgressRow = {
  key: string;
  name: string;
  progress: BudgetProgress;
};

const FILL: Record<BudgetProgress["status"], string> = {
  ok: "bg-income",
  warning: "bg-primary",
  over: "bg-expense",
};

/** Status is always spelled out in text beside the bar, so color is never
 * the only signal (colorblind readers, grayscale prints). */
function statusText(p: BudgetProgress): string {
  if (p.status === "over") return `Over by ${formatRSD(-p.remaining)}`;
  const left = `${formatRSD(p.remaining)} left`;
  return p.perDay !== null ? `${left} · ${formatRSD(p.perDay)}/day` : left;
}

function Bar({ progress }: { progress: BudgetProgress }) {
  // Width is capped at 100%: an overspent bar is full, and the text says by
  // how much. A zero budget has no ratio, so it shows full only if spent.
  const bp =
    progress.percentBp ?? (progress.spent > 0n ? 10000 : 0);
  const width = Math.min(bp, 10000) / 100;
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div
        className={cn("h-full rounded-full", FILL[progress.status])}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function Row({ row, emphasis }: { row: BudgetProgressRow; emphasis?: boolean }) {
  const { progress } = row;
  return (
    <li className={cn("space-y-1.5 p-3", emphasis && "bg-muted/40")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("min-w-0 truncate text-sm", emphasis && "font-medium")}>
          {row.name}
        </span>
        <span className="flex shrink-0 items-baseline gap-1 text-xs text-muted-foreground">
          <Amount value={progress.spent} size="sm" tone="neutral" showUnit={false} />
          of
          <Amount value={progress.budget} size="sm" tone="muted" showUnit={false} />
        </span>
      </div>
      <Bar progress={progress} />
      <p
        className={cn(
          "text-xs",
          progress.status === "over" ? "text-expense" : "text-muted-foreground",
        )}
      >
        {statusText(progress)}
      </p>
    </li>
  );
}

export function BudgetProgressList({
  total,
  rows,
  editHref,
}: {
  total: BudgetProgressRow | null;
  rows: BudgetProgressRow[];
  editHref: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No budgets set for this month.{" "}
        <Link href={editHref} className="text-foreground underline underline-offset-4">
          Set budgets
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {total && <Row row={total} emphasis />}
        {rows.map((row) => (
          <Row key={row.key} row={row} />
        ))}
      </ul>
      <Link
        href={editHref}
        className="text-xs text-muted-foreground underline underline-offset-4"
      >
        Edit budgets
      </Link>
    </div>
  );
}
