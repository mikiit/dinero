import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { monthKey, shiftMonth } from "@/lib/reports";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Prev/next month links for /reports. `?m=` is the only state, so the
 * selected month survives reloads and can be shared or bookmarked. */
export function MonthNav({
  monthStartIso,
  currentMonthStartIso,
}: {
  monthStartIso: string;
  currentMonthStartIso: string;
}) {
  const isCurrent = monthStartIso >= currentMonthStartIso;
  const iconButton = buttonVariants({ variant: "outline", size: "icon" });

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={`/reports?m=${monthKey(shiftMonth(monthStartIso, -1))}`}
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
          href={`/reports?m=${monthKey(shiftMonth(monthStartIso, 1))}`}
          aria-label="Next month"
          className={iconButton}
        >
          <ChevronRightIcon />
        </Link>
      )}
    </div>
  );
}
