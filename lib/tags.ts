// Tags: free-form labels on a transaction for things that cut across
// categories - a trip, a renovation, a gift. Stored as `transactions.tags
// text[]` (null when there are none). Everything the user types goes through
// parseTags, so what is stored is always normalized and bounded.

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/**
 * Turns what was typed ("Trip, #Summer  trip") into normalized tags
 * (["trip", "summer"]): split on commas and whitespace, drop a leading "#",
 * lowercase, keep only letters/digits/"-"/"_", cut to MAX_TAG_LENGTH, drop
 * empties and duplicates (first occurrence wins), keep at most MAX_TAGS.
 */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[\s,;]+/)) {
    const tag = raw
      .replace(/^#+/, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]/gu, "")
      .slice(0, MAX_TAG_LENGTH);
    if (tag === "") continue;
    seen.add(tag);
    if (seen.size === MAX_TAGS) break;
  }
  return [...seen];
}

/** Tags as shown in an input: "trip, summer". */
export function formatTags(tags: readonly string[]): string {
  return tags.join(", ");
}

export type TagCount = { tag: string; count: number };

/** How many transactions carry each tag, most used first (ties: A-Z). */
export function countTags(rows: readonly (readonly string[] | null)[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const tags of rows) {
    for (const tag of tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export type TagSpend = { tag: string; total: bigint; count: number };

/**
 * Spending per tag, biggest first. A transaction with several tags counts in
 * full under each of them, so the figures are NOT additive - they answer
 * "what did the trip cost", not "how is the month split". Untagged rows are
 * left out.
 */
export function spendByTag(
  rows: readonly { tags: readonly string[] | null; amount: bigint }[],
): TagSpend[] {
  const byTag = new Map<string, TagSpend>();
  for (const row of rows) {
    for (const tag of new Set(row.tags ?? [])) {
      const entry = byTag.get(tag) ?? { tag, total: 0n, count: 0 };
      entry.total += row.amount;
      entry.count += 1;
      byTag.set(tag, entry);
    }
  }
  return [...byTag.values()].sort((a, b) =>
    a.total === b.total ? a.tag.localeCompare(b.tag) : a.total > b.total ? -1 : 1,
  );
}
