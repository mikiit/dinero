import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import type { TagSpend } from "@/lib/tags";

/** Expense per tag for the month, each linking to the matching transactions.
 * A transaction with two tags is counted under both, so the rows do not add
 * up to the month's total - the note says so. */
export function TagSpendList({
  items,
  currency,
  hrefs,
}: {
  items: TagSpend[];
  currency: string;
  /** Drill-down links aligned with `items` by index. */
  hrefs: string[];
}) {
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {items.map((item, i) => (
          <li key={item.tag}>
            <Link
              href={hrefs[i]}
              className="flex items-baseline justify-between gap-3 p-3 hover:bg-muted/40"
            >
              <span className="min-w-0 truncate text-sm">
                #{item.tag}
                <span className="ml-2 text-xs text-muted-foreground">
                  {item.count} {item.count === 1 ? "expense" : "expenses"}
                </span>
              </span>
              <Amount
                value={item.total}
                currency={currency}
                size="sm"
                tone="neutral"
                showUnit={false}
              />
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        An expense with several tags counts under each, so these do not add up
        to the month&apos;s total.
      </p>
    </div>
  );
}
