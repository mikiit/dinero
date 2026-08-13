// The only place money is allowed near a float. Everywhere else, amounts are
// `bigint` minor units (para) straight through to Postgres — see CLAUDE.md
// rule 1. Every conversion in or out of that representation goes through
// this file.

const MINOR_UNITS_PER_MAJOR = 100n;

/**
 * Parses a plain decimal amount into bigint minor units. Accepts "." or ","
 * as the decimal separator (numpad input and sr-RS input both land here).
 * Does not accept thousands grouping ("1.234,56") — that's a display-only
 * concern handled by `formatRSD`, not a storage input. Throws rather than
 * guessing on anything else.
 */
export function toMinor(input: string): bigint {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("toMinor: empty amount");
  }

  const normalized = trimmed.replace(",", ".");
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    throw new Error(`toMinor: invalid amount "${input}"`);
  }

  const [, sign, whole, fraction = ""] = match;
  const paddedFraction = fraction.padEnd(2, "0");
  const magnitude =
    BigInt(whole) * MINOR_UNITS_PER_MAJOR + BigInt(paddedFraction || "0");

  return sign ? -magnitude : magnitude;
}

/**
 * Converts bigint minor units to a JS `number` of major units. For contexts
 * that need a plain number (chart libraries) — never write the result back
 * to the database or use it to accumulate balances.
 */
export function fromMinor(minor: bigint): number {
  const whole = minor / MINOR_UNITS_PER_MAJOR;
  const fraction = minor % MINOR_UNITS_PER_MAJOR;
  return Number(whole) + Number(fraction) / Number(MINOR_UNITS_PER_MAJOR);
}

/**
 * Converts bigint minor units to a plain decimal string ("1234.56" /
 * "-75.00"), suitable for pre-filling an editable text input that will
 * itself be parsed back through `toMinor` - unlike `formatRSD`, no
 * thousands separators or currency symbol. Takes the sign off before
 * dividing: bigint division truncates toward zero, so e.g. -75n / 100n is
 * 0n, which would otherwise silently drop the minus sign for any
 * magnitude under 1.00.
 */
export function toDecimalString(minor: bigint): string {
  const sign = minor < 0n ? "-" : "";
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / MINOR_UNITS_PER_MAJOR;
  const fraction = abs % MINOR_UNITS_PER_MAJOR;
  return `${sign}${whole}.${fraction.toString().padStart(2, "0")}`;
}

const RSD_FORMATTER = new Intl.NumberFormat("sr-RS", {
  style: "currency",
  currency: "RSD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats bigint minor units as an sr-RS RSD string, e.g. "1.234,56 RSD". */
export function formatRSD(minor: bigint): string {
  return RSD_FORMATTER.format(fromMinor(minor));
}

/**
 * Splits a formatted RSD amount into its number and currency-unit parts
 * (e.g. "1.234,56" and "RSD"), for display contexts where the number needs
 * to be the dominant visual element and the unit should read smaller and
 * de-emphasized rather than inheriting the number's size - see
 * components/ui/amount.tsx. Uses Intl's own part boundaries rather than
 * string-splitting formatRSD's output, so it stays correct if this ever
 * formats a currency other than RSD.
 */
export function formatRSDParts(minor: bigint): { number: string; unit: string } {
  const parts = RSD_FORMATTER.formatToParts(fromMinor(minor));
  let number = "";
  let unit = "RSD";
  for (const part of parts) {
    if (part.type === "currency") {
      unit = part.value;
    } else if (part.type !== "literal") {
      number += part.value;
    }
  }
  return { number, unit };
}

// --- DB boundary -----------------------------------------------------------
// Postgres `bigint` columns (opening_balance, credit_limit, amount, and the
// account_balances.balance view) have no JSON representation, so
// PostgREST/supabase-js hand them to the app as JS `number`, and expect
// `number` back on insert/update — see lib/database.types.ts. That's still
// an integer, not a float, so it doesn't violate rule 1's intent as long as
// nothing does arithmetic on the `number` form — these two functions are the
// only place that boundary is crossed. They throw outside
// Number.MAX_SAFE_INTEGER (~90 trillion RSD in minor units) rather than
// silently losing precision; a personal expense tracker should never
// legitimately hit that, so tripping it means something upstream is wrong.

const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

/** Converts app-internal bigint minor units to the `number` the DB layer expects. */
export function toDbAmount(minor: bigint): number {
  if (minor > MAX_SAFE_MINOR || minor < -MAX_SAFE_MINOR) {
    throw new Error(`toDbAmount: ${minor} exceeds the safe integer range`);
  }
  return Number(minor);
}

/** Converts a `number` read back from the DB layer to app-internal bigint minor units. */
export function fromDbAmount(value: number): bigint {
  if (!Number.isInteger(value)) {
    throw new Error(`fromDbAmount: ${value} is not an integer minor-unit amount`);
  }
  return BigInt(value);
}
