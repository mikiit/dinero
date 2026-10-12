// The currencies an account can be opened in. Mirrors the CHECK constraints
// in supabase/migrations/20261013100000_multi_currency.sql - change both
// together. All of them have two minor-unit digits, which is what
// lib/money.ts assumes.
export const CURRENCIES = ["RSD", "EUR", "USD", "AED"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "RSD";

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/** Narrows a stored currency string; anything unexpected reads as the
 * default rather than breaking a page. */
export function toCurrency(value: string | null | undefined): Currency {
  return isCurrency(value) ? value : DEFAULT_CURRENCY;
}

/** Currencies in use, in the fixed CURRENCIES order (so a tab strip never
 * reshuffles), always including at least the default. */
export function currenciesInUse(used: Iterable<string>): Currency[] {
  const set = new Set<string>(used);
  const found = CURRENCIES.filter((c) => set.has(c));
  return found.length > 0 ? found : [DEFAULT_CURRENCY];
}

/** Resolves a `?c=` param against the currencies in use: the requested one
 * if it is in use, else the first in use. */
export function pickCurrency(
  requested: string | null | undefined,
  inUse: readonly Currency[],
): Currency {
  return isCurrency(requested) && inUse.includes(requested) ? requested : inUse[0];
}

/** Sums balances per currency, in CURRENCIES order. Amounts of different
 * currencies are never added together. */
export function sumByCurrency<T>(
  items: readonly T[],
  currencyOf: (item: T) => string,
  amountOf: (item: T) => bigint,
): { currency: Currency; total: bigint }[] {
  const totals = new Map<Currency, bigint>();
  for (const item of items) {
    const c = toCurrency(currencyOf(item));
    totals.set(c, (totals.get(c) ?? 0n) + amountOf(item));
  }
  return CURRENCIES.filter((c) => totals.has(c)).map((c) => ({
    currency: c,
    total: totals.get(c)!,
  }));
}
