import { addMonths, format, parse, startOfMonth } from "date-fns";

// Pure report maths. All money stays bigint minor units; percentages are
// integer basis points (1/100 of a percent) so nothing here touches a float
// until the very last display step.

/** "2026-10" -> first day "2026-10-01"; null if malformed. */
export function parseMonthParam(value: string | undefined): string | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return `${value}-01`;
}

export function monthKey(monthStartIso: string): string {
  return monthStartIso.slice(0, 7);
}

/** Month start (yyyy-MM-dd) shifted by `delta` months. */
export function shiftMonth(monthStartIso: string, delta: number): string {
  const base = parse(monthStartIso, "yyyy-MM-dd", new Date(0));
  return format(startOfMonth(addMonths(base, delta)), "yyyy-MM-dd");
}

export type MonthTotals = { month: string; income: bigint; expense: bigint };

/** Exactly `count` consecutive months ending at `endMonthIso`, oldest
 * first, zero-filling months with no transactions (monthly_summary only
 * has rows for months that have some). */
export function fillMonthSeries(
  rows: { month: string; income: bigint; expense: bigint }[],
  endMonthIso: string,
  count = 12,
): MonthTotals[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(endMonthIso, i - (count - 1));
    const row = byMonth.get(month);
    return { month, income: row?.income ?? 0n, expense: row?.expense ?? 0n };
  });
}

export type ReportCategory = {
  id: string;
  name: string;
  parentId: string | null;
};

export type CategorySpend = {
  /** Top-level category id, or null for expenses with no category. */
  categoryId: string | null;
  name: string;
  total: bigint;
  /** Share of the month's spend, in basis points (2550 = 25.50%). */
  shareBp: number;
};

export type SpendBreakdown = { total: bigint; items: CategorySpend[] };

/**
 * Month's expense rows -> spend per TOP-LEVEL category, children rolled up
 * into their parent, biggest first. A category unknown to the list (e.g.
 * deleted) and a null category both land in "Uncategorized" rather than
 * being dropped, so the items always sum to `total`.
 */
export function spendByCategory(
  rows: { categoryId: string | null; amount: bigint }[],
  categories: ReportCategory[],
): SpendBreakdown {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string | null, bigint>();
  let total = 0n;

  for (const row of rows) {
    let key: string | null = null;
    const cat = row.categoryId ? byId.get(row.categoryId) : undefined;
    if (cat) key = cat.parentId && byId.has(cat.parentId) ? cat.parentId : cat.id;
    totals.set(key, (totals.get(key) ?? 0n) + row.amount);
    total += row.amount;
  }

  const items = [...totals.entries()]
    .map(([categoryId, sum]) => ({
      categoryId,
      name: categoryId ? byId.get(categoryId)!.name : "Uncategorized",
      total: sum,
      shareBp: total > 0n ? Number((sum * 10000n) / total) : 0,
    }))
    .sort((a, b) =>
      a.total === b.total ? a.name.localeCompare(b.name) : a.total > b.total ? -1 : 1,
    );

  return { total, items };
}

/** Basis points -> "25,5%" style label (sr-RS), one decimal at most. */
export function formatShare(bp: number): string {
  return `${new Intl.NumberFormat("sr-RS", {
    maximumFractionDigits: 1,
  }).format(bp / 100)}%`;
}

export type Change =
  /** Spent something this month and nothing last month. */
  | { kind: "new" }
  /** Within half a percent either way: not worth a headline. */
  | { kind: "same" }
  | { kind: "up"; percent: number }
  | { kind: "down"; percent: number };

/**
 * How `current` differs from `previous` as a whole-number percentage, or null
 * when there is nothing to compare (nothing spent in either month). Computed
 * with bigint basis points and rounded once at the end - no float
 * accumulation on the way. "Down 100%" means it went to zero.
 */
export function percentChange(current: bigint, previous: bigint): Change | null {
  if (current === 0n && previous === 0n) return null;
  if (previous === 0n) return { kind: "new" };

  const bp = ((current - previous) * 10000n) / previous; // truncates toward zero
  const percent = Math.round(Number(bp) / 100);
  if (Math.abs(Number(bp)) < 50) return { kind: "same" };
  return percent > 0
    ? { kind: "up", percent }
    : { kind: "down", percent: Math.abs(percent) };
}
