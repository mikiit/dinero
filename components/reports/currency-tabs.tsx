import Link from "next/link";
import { monthKey } from "@/lib/reports";
import { cn } from "@/lib/utils";

/** Switches which currency a page shows. Only rendered when the ledger has
 * more than one, since totals of different currencies are never combined.
 * The month and currency live in the URL, so the choice survives reloads. */
export function CurrencyTabs({
  currencies,
  selected,
  monthStartIso,
  basePath,
}: {
  currencies: readonly string[];
  selected: string;
  monthStartIso: string;
  basePath: string;
}) {
  if (currencies.length < 2) return null;

  return (
    <nav aria-label="Currency" className="flex gap-1.5">
      {currencies.map((c) => (
        <Link
          key={c}
          href={`${basePath}?m=${monthKey(monthStartIso)}&c=${c}`}
          aria-current={c === selected ? "page" : undefined}
          className={cn(
            "rounded-md border px-3 py-1 text-sm font-medium",
            c === selected
              ? "border-primary bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {c}
        </Link>
      ))}
    </nav>
  );
}
