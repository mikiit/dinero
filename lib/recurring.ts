// Pure recurring-rule maths: schedule stepping, due occurrences, template
// validation. No I/O, so every date edge case is unit-tested (CLAUDE.md
// requires coverage of recurring-rule date math).
//
// Dates are "yyyy-MM-dd" strings throughout and are stepped with UTC
// arithmetic, never local-time Date maths, so a DST change can't shift an
// occurrence by a day.

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export const FREQUENCIES: readonly Frequency[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

export type Schedule = {
  frequency: Frequency;
  interval: number;
  /** Anchor day for monthly/yearly rules. Kept separately from the current
   * date so a rule anchored on the 31st goes Jan 31 -> Feb 28 -> Mar 31,
   * not Jan 31 -> Feb 28 -> Mar 28 (clamping must never stick). */
  dayOfMonth: number | null;
};

/** Upper bound on occurrences handled in one pass: a daily rule left alone
 * for years must not turn one page load into thousands of inserts. Anything
 * beyond the cap simply stays due and is picked up on the next pass. */
export const MAX_OCCURRENCES_PER_PASS = 400;

const APP_TIME_ZONE = "Europe/Belgrade";

/** "Today" for the user, not for the server: Vercel runs in UTC, which is
 * still yesterday in Serbia for the first hour or two of every day. */
export function todayInAppTimeZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function daysInMonth(y: number, month0: number): number {
  return new Date(Date.UTC(y, month0 + 1, 0)).getUTCDate();
}

function toIso(y: number, month0: number, d: number): string {
  return new Date(Date.UTC(y, month0, d)).toISOString().slice(0, 10);
}

/** The occurrence after `from` (itself an occurrence date). */
export function nextOccurrence(from: string, schedule: Schedule): string {
  const { y, m, d } = parts(from);
  const n = schedule.interval;

  switch (schedule.frequency) {
    case "daily":
      return toIso(y, m - 1, d + n);
    case "weekly":
      return toIso(y, m - 1, d + 7 * n);
    case "monthly": {
      const total = y * 12 + (m - 1) + n;
      const ny = Math.floor(total / 12);
      const nm = total % 12;
      return toIso(ny, nm, Math.min(schedule.dayOfMonth ?? d, daysInMonth(ny, nm)));
    }
    case "yearly": {
      const ny = y + n;
      return toIso(ny, m - 1, Math.min(schedule.dayOfMonth ?? d, daysInMonth(ny, m - 1)));
    }
  }
}

/** Day-of-month anchor to store when a rule is created from `startIso`;
 * null for frequencies that don't use one. */
export function anchorDayFor(frequency: Frequency, startIso: string): number | null {
  return frequency === "monthly" || frequency === "yearly" ? parts(startIso).d : null;
}

export type DueResult = {
  /** Occurrence dates that are due, oldest first. */
  dates: string[];
  /** The rule's next_run_on once every date in `dates` has been handled. */
  nextAfter: string;
};

/**
 * Occurrences due as of `todayIso`: from `nextRunOn` forward while the date
 * is not in the future and not past `endOn`. Capped; see
 * MAX_OCCURRENCES_PER_PASS.
 */
export function dueOccurrences(
  nextRunOn: string,
  schedule: Schedule,
  endOn: string | null,
  todayIso: string,
  cap: number = MAX_OCCURRENCES_PER_PASS,
): DueResult {
  const dates: string[] = [];
  let cursor = nextRunOn;
  while (
    cursor <= todayIso &&
    (endOn === null || cursor <= endOn) &&
    dates.length < cap
  ) {
    dates.push(cursor);
    cursor = nextOccurrence(cursor, schedule);
  }
  return { dates, nextAfter: cursor };
}

/** First occurrence on or after `todayIso`, stepping from `from` without
 * posting anything - used when a paused rule is resumed, so the months it
 * sat paused are not back-filled. */
export function firstOccurrenceFrom(
  from: string,
  schedule: Schedule,
  todayIso: string,
): string {
  let cursor = from;
  // Bounded: a rule can't be more than ~100 years behind in any real use,
  // and an unbounded loop in a request handler is not worth the risk.
  for (let i = 0; i < 40000 && cursor < todayIso; i++) {
    cursor = nextOccurrence(cursor, schedule);
  }
  return cursor;
}

export function isEnded(nextRunOn: string, endOn: string | null): boolean {
  return endOn !== null && nextRunOn > endOn;
}

/** Human description, e.g. "Monthly on day 1", "Every 2 weeks". */
export function describeSchedule(schedule: Schedule): string {
  const { frequency, interval, dayOfMonth } = schedule;
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[
    frequency
  ];
  if (interval === 1) {
    if (frequency === "monthly" && dayOfMonth) return `Monthly on day ${dayOfMonth}`;
    return { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[
      frequency
    ];
  }
  const base = `Every ${interval} ${unit}s`;
  return frequency === "monthly" && dayOfMonth ? `${base} on day ${dayOfMonth}` : base;
}

// --- template -------------------------------------------------------------

export type TemplateType = "expense" | "income" | "transfer";

/** The transaction fields a rule clones. Stored as jsonb, so it is
 * validated on the way back out - the column can hold anything. `amount` is
 * a string of minor units because JSON has no bigint. */
export type RuleTemplate = {
  type: TemplateType;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  amount: string;
  note: string | null;
  merchant: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalText(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : undefined;
}

function optionalId(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" && UUID.test(v) ? v : undefined;
}

/** Returns a clean template, or null if the stored JSON is malformed or
 * violates the same rules the transactions table enforces. A rule with a bad
 * template is skipped rather than allowed to post garbage into the ledger. */
export function parseTemplate(raw: unknown): RuleTemplate | null {
  if (typeof raw !== "object" || raw === null) return null;
  const t = raw as Record<string, unknown>;

  if (t.type !== "expense" && t.type !== "income" && t.type !== "transfer") return null;
  if (typeof t.accountId !== "string" || !UUID.test(t.accountId)) return null;
  if (typeof t.amount !== "string" || !/^[1-9]\d*$/.test(t.amount)) return null;

  const toAccountId = optionalId(t.toAccountId);
  const categoryId = optionalId(t.categoryId);
  const note = optionalText(t.note);
  const merchant = optionalText(t.merchant);
  if (
    toAccountId === undefined ||
    categoryId === undefined ||
    note === undefined ||
    merchant === undefined
  ) {
    return null;
  }

  if (t.type === "transfer") {
    if (toAccountId === null || toAccountId === t.accountId) return null;
    if (categoryId !== null) return null;
  } else if (toAccountId !== null) {
    return null;
  }

  return {
    type: t.type,
    accountId: t.accountId,
    toAccountId,
    categoryId,
    amount: t.amount,
    note,
    merchant,
  };
}
