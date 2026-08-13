import { formatRSDParts } from "@/lib/money";
import { cn } from "@/lib/utils";

type AmountSize = "hero" | "lg" | "md" | "sm";
type AmountTone = "neutral" | "expense" | "income" | "transfer" | "muted";

// The type scale for money, applied everywhere through this component so
// it can't drift screen-to-screen. See app/globals.css's DESIGN TOKENS
// comment for the full role -> scale mapping this implements. font-mono
// (JetBrains Mono) gives every amount genuinely tabular figures - not
// just the tabular-nums feature, actual fixed-width digits - and reads
// as a deliberate "this is the number that matters" signal against the
// Space Grotesk used everywhere else.
const NUMBER_SIZE: Record<AmountSize, string> = {
  hero: "font-mono text-3xl font-bold tracking-tight",
  lg: "font-mono text-lg font-semibold",
  md: "font-mono text-base font-semibold",
  sm: "font-mono text-sm font-semibold",
};

const UNIT_SIZE: Record<AmountSize, string> = {
  hero: "text-base font-medium",
  lg: "text-xs font-medium",
  md: "text-xs font-medium",
  sm: "text-[0.7rem] font-medium",
};

const TONE: Record<AmountTone, string> = {
  neutral: "text-foreground",
  expense: "text-expense",
  income: "text-income",
  transfer: "text-transfer",
  muted: "text-muted-foreground",
};

/**
 * The single place every money value in the app renders through. Splits
 * the number from the "RSD" unit (via formatRSDParts) so the unit can stay
 * small and de-emphasized instead of inheriting the number's size - that
 * alone is what keeps a 200.000+ RSD balance from overflowing a narrow
 * card, without ever truncating a figure.
 */
export function Amount({
  value,
  size = "md",
  tone = "neutral",
  showSign = false,
  showUnit = true,
  className,
}: {
  value: bigint;
  size?: AmountSize;
  tone?: AmountTone;
  /** Prefix a "+" for positive values. The locale formatter already
   * prefixes negative values with "-", so this only ever adds, never
   * suppresses, a sign. */
  showSign?: boolean;
  /** Set false in dense multi-amount rows (e.g. a 3-up income/expense/net
   * summary) where the currency is stated once for the whole screen
   * instead of repeated per value. */
  showUnit?: boolean;
  className?: string;
}) {
  const { number, unit } = formatRSDParts(value);
  const sign = showSign && value > 0n ? "+" : "";

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 tabular-nums",
        TONE[tone],
        className,
      )}
    >
      <span className={NUMBER_SIZE[size]}>
        {sign}
        {number}
      </span>
      {showUnit && (
        <span className={cn(UNIT_SIZE[size], "text-muted-foreground")}>
          {unit}
        </span>
      )}
    </span>
  );
}
