import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { monthKey, shiftMonth } from "@/lib/reports";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Prev/next month links for a page that takes `?m=`. That is the only
 * state, so the selected month survives reloads and can be shared or
 * bookmarked. */
export function MonthNav({
  monthStartIso,
  currentMonthStartIso,
  basePath = "/reports",
  allowFuture = false,
  currency,
}: {
  monthStartIso: string;
  currentMonthStartIso: string;
  basePath?: string;
  /** Budgets can be planned ahead; reports have nothing to show there. */
  allowFuture?: boolean;
  /** Carried through the links so changing month keeps the currency. */
  currency?: string;
}) {
  const suffix = currency ? `&c=${currency}` : "";
  const isCurrent = !allowFuture && monthStartIso >= currentMonthStartIso;
  const iconButton = buttonVariants({ variant: "outline", size: "icon" });

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={`${basePath}?m=${monthKey(shiftMonth(monthStartIso, -1))}${suffix}`}
        aria-label="Previous month"
        className={iconButton}
      >
        <ChevronLeftIcon />
      </Link>
      <h2 className="font-heading text-base font-medium">
        {format(parseISO(monthStartIso), "MMMM yyyy")}
      </h2>
      {isCurrent ? (
        <span
          aria-hidden
          className={cn(iconButton, "pointer-events-none opacity-30")}
        >
          <ChevronRightIcon />
        </span>
      ) : (
        <Link
          href={`${basePath}?m=${monthKey(shiftMonth(monthStartIso, 1))}${suffix}`}
          aria-label="Next month"
          className={iconButton}
        >
          <ChevronRightIcon />
        </Link>
      )}
    </div>
  );
}
