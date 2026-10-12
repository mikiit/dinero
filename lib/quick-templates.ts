// Quick-add suggestions derived from what the person already enters: no
// templates to define or maintain, they simply appear once something repeats.
// (SPEC.md §6: "Coffee 250 RSD, Eating out, Wallet" as a one-tap button, and
// "repeat last transaction".)

export type TemplateRow = {
  type: "expense" | "income";
  accountId: string;
  categoryId: string | null;
  amount: bigint;
  note: string | null;
  occurredOn: string;
};

export type QuickTemplate = {
  type: "expense" | "income";
  accountId: string;
  categoryId: string | null;
  /** Minor units as a string (no bigint across the server/client boundary). */
  amount: string;
  note: string | null;
  /** How many times this exact entry appears in the window. */
  count: number;
  /** "last" is the most recent entry whatever its count; the rest repeat. */
  kind: "last" | "frequent";
};

const norm = (note: string | null) => (note ?? "").trim().toLowerCase();

const keyOf = (r: TemplateRow) =>
  [r.type, r.accountId, r.categoryId ?? "", r.amount.toString(), norm(r.note)].join("|");

/**
 * The most recent entry first (for "repeat last"), then entries that occur at
 * least `minCount` times, most frequent first (ties: most recent first).
 * "The same entry" means same type, account, category, amount and note - an
 * amount that varies (groceries) is not a template; a fixed one (coffee, a
 * subscription) is.
 */
export function buildQuickTemplates(
  rows: TemplateRow[],
  options: { limit?: number; minCount?: number } = {},
): QuickTemplate[] {
  const { limit = 5, minCount = 2 } = options;
  if (rows.length === 0) return [];

  type Group = { sample: TemplateRow; count: number; lastOn: string };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = keyOf(row);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { sample: row, count: 1, lastOn: row.occurredOn });
    } else {
      g.count++;
      // Keep the wording (capitalisation) of the most recent occurrence.
      if (row.occurredOn > g.lastOn) {
        g.lastOn = row.occurredOn;
        g.sample = row;
      }
    }
  }

  // Most recent row overall; the first one wins a same-day tie, which is the
  // order the caller supplied (newest first).
  const latest = rows.reduce((best, r) => (r.occurredOn > best.occurredOn ? r : best), rows[0]);
  const latestKey = keyOf(latest);

  const toTemplate = (g: Group, kind: QuickTemplate["kind"]): QuickTemplate => ({
    type: g.sample.type,
    accountId: g.sample.accountId,
    categoryId: g.sample.categoryId,
    amount: g.sample.amount.toString(),
    note: g.sample.note,
    count: g.count,
    kind,
  });

  const last = toTemplate(groups.get(latestKey)!, "last");
  const frequent = [...groups.entries()]
    .filter(([key, g]) => key !== latestKey && g.count >= minCount)
    .sort(([, a], [, b]) =>
      b.count !== a.count ? b.count - a.count : b.lastOn.localeCompare(a.lastOn),
    )
    .map(([, g]) => toTemplate(g, "frequent"));

  return [last, ...frequent].slice(0, limit);
}
