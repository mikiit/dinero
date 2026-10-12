"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Amount } from "@/components/ui/amount";
import { formatMoney, fromMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  formatShare,
  percentChange,
  type CategorySpend,
  type Change,
  type SpendBreakdown,
} from "@/lib/reports";

// Seven fixed-order categorical slots (see --series-N in globals.css); the
// tail folds into one neutral "Everything else" rather than inventing hues
// that colorblind readers couldn't tell apart.
const MAX_SLICES = 7;

type Row = CategorySpend & { color: string; href: string | null; change: Change | null };

function toRows(
  items: CategorySpend[],
  hrefs: string[],
  previous: SpendBreakdown | null,
): Row[] {
  const before = new Map(
    (previous?.items ?? []).map((p) => [p.categoryId, p.total] as const),
  );
  const head = items.slice(0, MAX_SLICES).map((item, i) => ({
    ...item,
    color: `var(--series-${i + 1})`,
    href: hrefs[i],
    change: previous ? percentChange(item.total, before.get(item.categoryId) ?? 0n) : null,
  }));
  const tail = items.slice(MAX_SLICES);
  if (tail.length === 0) return head;

  return [
    ...head,
    {
      categoryId: null,
      name: `Everything else (${tail.length})`,
      total: tail.reduce((sum, t) => sum + t.total, 0n),
      shareBp: tail.reduce((sum, t) => sum + t.shareBp, 0),
      color: "var(--series-rest)",
      href: null,
      change: null, // a mix of categories has no single before to compare
    },
  ];
}

/** "▲ 18%" - the arrow and the word carry the meaning, the colour only
 * reinforces it (so it survives colour blindness and grey-scale). */
function ChangeBadge({ change, versus }: { change: Change | null; versus: string }) {
  if (!change) return null;
  if (change.kind === "new") {
    return (
      <span className="text-xs text-muted-foreground" title={`Nothing in ${versus}`}>
        new
      </span>
    );
  }
  if (change.kind === "same") {
    return (
      <span className="text-xs text-muted-foreground" title={`About the same as ${versus}`}>
        ≈
      </span>
    );
  }
  const up = change.kind === "up";
  return (
    <span
      className={cn("text-xs", up ? "text-expense" : "text-income")}
      aria-label={`${up ? "Up" : "Down"} ${change.percent} percent vs ${versus}`}
    >
      {up ? "▲" : "▼"} {change.percent}%
    </span>
  );
}

export function CategorySpendChart({
  total,
  items,
  hrefs,
  previous = null,
  previousLabel = "last month",
  currency = "RSD",
}: {
  total: bigint;
  currency?: string;
  items: CategorySpend[];
  /** Pre-built drill-down links, aligned with `items` by index. */
  hrefs: string[];
  /** The month before, for the "vs last month" change. */
  previous?: SpendBreakdown | null;
  previousLabel?: string;
}) {
  if (total === 0n) {
    return (
      <p className="text-sm text-muted-foreground">
        No expenses recorded this month.
      </p>
    );
  }

  const rows = toRows(items, hrefs, previous);
  const totalChange = previous ? percentChange(total, previous.total) : null;
  const data = rows.map((r) => ({
    name: r.name,
    value: fromMinor(r.total), // chart geometry only; never written back
    row: r,
  }));

  return (
    <div className="space-y-4">
      <div className="relative mx-auto h-56 w-full max-w-xs">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.row.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const row = active
                  ? (payload?.[0]?.payload as { row: Row } | undefined)?.row
                  : undefined;
                if (!row) return null;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                    <p className="font-medium">{row.name}</p>
                    <p className="font-mono text-xs">
                      {formatMoney(row.total, currency)} · {formatShare(row.shareBp)}
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Spent</span>
          <Amount value={total} currency={currency} size="md" tone="neutral" showUnit={false} />
          <ChangeBadge change={totalChange} versus={previousLabel} />
        </div>
      </div>

      {previous && (
        <p className="text-center text-xs text-muted-foreground">
          Change is versus {previousLabel}.
        </p>
      )}

      <ul className="divide-y rounded-lg border">
        {rows.map((r) => {
          const body = (
            <>
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: r.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatShare(r.shareBp)}
              </span>
              <ChangeBadge change={r.change} versus={previousLabel} />
              <Amount value={r.total} currency={currency} size="sm" tone="neutral" showUnit={false} />
            </>
          );
          return (
            <li key={r.name}>
              {r.href ? (
                <Link
                  href={r.href}
                  className="flex items-center gap-3 p-3 hover:bg-muted/50"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 p-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
