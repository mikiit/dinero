import { describe, expect, it } from "vitest";
import {
  anchorDayFor,
  describeSchedule,
  dueOccurrences,
  firstOccurrenceFrom,
  isEnded,
  nextOccurrence,
  parseTemplate,
  todayInAppTimeZone,
  type Schedule,
} from "./recurring";

const monthly = (dayOfMonth: number | null, interval = 1): Schedule => ({
  frequency: "monthly",
  interval,
  dayOfMonth,
});

describe("nextOccurrence", () => {
  it("steps daily and weekly across month and year ends", () => {
    expect(nextOccurrence("2026-12-31", { frequency: "daily", interval: 1, dayOfMonth: null })).toBe("2027-01-01");
    expect(nextOccurrence("2026-01-29", { frequency: "daily", interval: 3, dayOfMonth: null })).toBe("2026-02-01");
    expect(nextOccurrence("2026-10-12", { frequency: "weekly", interval: 1, dayOfMonth: null })).toBe("2026-10-19");
    expect(nextOccurrence("2026-12-28", { frequency: "weekly", interval: 2, dayOfMonth: null })).toBe("2027-01-11");
  });

  it("steps monthly on a fixed day, across year end and by interval", () => {
    expect(nextOccurrence("2026-12-01", monthly(1))).toBe("2027-01-01");
    expect(nextOccurrence("2026-01-15", monthly(15, 3))).toBe("2026-04-15");
    expect(nextOccurrence("2026-11-10", monthly(10, 14))).toBe("2028-01-10");
  });

  it("clamps the 29th/30th/31st to short months WITHOUT drifting", () => {
    // Anchored on the 31st: the clamp in February must not stick.
    let d = "2026-01-31";
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      d = nextOccurrence(d, monthly(31));
      seen.push(d);
    }
    expect(seen).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });

  it("handles February in leap and non-leap years", () => {
    expect(nextOccurrence("2028-01-30", monthly(30))).toBe("2028-02-29");
    expect(nextOccurrence("2027-01-30", monthly(30))).toBe("2027-02-28");
  });

  it("yearly Feb 29 falls back to Feb 28 and returns to Feb 29", () => {
    const yearly: Schedule = { frequency: "yearly", interval: 1, dayOfMonth: 29 };
    expect(nextOccurrence("2028-02-29", yearly)).toBe("2029-02-28");
    expect(nextOccurrence("2029-02-28", yearly)).toBe("2030-02-28");
    expect(nextOccurrence("2031-02-28", yearly)).toBe("2032-02-29");
  });

  it("without an anchor, monthly follows the current day", () => {
    expect(nextOccurrence("2026-03-10", monthly(null))).toBe("2026-04-10");
  });
});

describe("anchorDayFor", () => {
  it("anchors only monthly and yearly", () => {
    expect(anchorDayFor("monthly", "2026-01-31")).toBe(31);
    expect(anchorDayFor("yearly", "2026-02-14")).toBe(14);
    expect(anchorDayFor("weekly", "2026-02-14")).toBeNull();
    expect(anchorDayFor("daily", "2026-02-14")).toBeNull();
  });
});

describe("dueOccurrences", () => {
  it("is empty when the next run is in the future", () => {
    const r = dueOccurrences("2026-11-01", monthly(1), null, "2026-10-12");
    expect(r.dates).toEqual([]);
    expect(r.nextAfter).toBe("2026-11-01");
  });

  it("fires on the day itself, once, and advances", () => {
    const r = dueOccurrences("2026-10-01", monthly(1), null, "2026-10-01");
    expect(r.dates).toEqual(["2026-10-01"]);
    expect(r.nextAfter).toBe("2026-11-01");
  });

  it("catches up every missed occurrence, with its original date", () => {
    const r = dueOccurrences("2026-07-01", monthly(1), null, "2026-10-12");
    expect(r.dates).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(r.nextAfter).toBe("2026-11-01");
  });

  it("stops at end_on (inclusive) and leaves nextAfter past it", () => {
    const r = dueOccurrences("2026-07-01", monthly(1), "2026-09-01", "2026-12-31");
    expect(r.dates).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(isEnded(r.nextAfter, "2026-09-01")).toBe(true);
  });

  it("is capped, and the remainder stays due for the next pass", () => {
    const daily: Schedule = { frequency: "daily", interval: 1, dayOfMonth: null };
    const r = dueOccurrences("2026-01-01", daily, null, "2026-10-12", 5);
    expect(r.dates).toHaveLength(5);
    expect(r.nextAfter).toBe("2026-01-06");
  });
});

describe("firstOccurrenceFrom (resume after pause)", () => {
  it("skips the paused period without producing occurrences", () => {
    expect(firstOccurrenceFrom("2026-03-01", monthly(1), "2026-10-12")).toBe("2026-11-01");
  });

  it("returns today when today is an occurrence", () => {
    expect(firstOccurrenceFrom("2026-03-01", monthly(1), "2026-10-01")).toBe("2026-10-01");
  });

  it("leaves a future next_run_on alone", () => {
    expect(firstOccurrenceFrom("2026-12-01", monthly(1), "2026-10-12")).toBe("2026-12-01");
  });
});

describe("describeSchedule", () => {
  it("reads naturally", () => {
    expect(describeSchedule(monthly(1))).toBe("Monthly on day 1");
    expect(describeSchedule(monthly(15, 3))).toBe("Every 3 months on day 15");
    expect(describeSchedule({ frequency: "weekly", interval: 1, dayOfMonth: null })).toBe("Weekly");
    expect(describeSchedule({ frequency: "daily", interval: 2, dayOfMonth: null })).toBe("Every 2 days");
  });
});

describe("todayInAppTimeZone", () => {
  it("uses Belgrade's calendar day, not UTC's", () => {
    // 23:30 UTC on Oct 11 is already 01:30 on Oct 12 in Belgrade (CEST).
    expect(todayInAppTimeZone(new Date("2026-10-11T23:30:00Z"))).toBe("2026-10-12");
    // Winter (CET, UTC+1): 23:30 UTC Jan 10 -> 00:30 Jan 11.
    expect(todayInAppTimeZone(new Date("2027-01-10T23:30:00Z"))).toBe("2027-01-11");
    expect(todayInAppTimeZone(new Date("2026-10-12T10:00:00Z"))).toBe("2026-10-12");
  });
});

describe("parseTemplate", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const C = "33333333-3333-4333-8333-333333333333";

  it("accepts valid expense, income and transfer templates", () => {
    expect(
      parseTemplate({ type: "expense", accountId: A, categoryId: C, amount: "7000000", note: "Rent" }),
    ).toEqual({
      type: "expense",
      accountId: A,
      toAccountId: null,
      categoryId: C,
      amount: "7000000",
      note: "Rent",
      merchant: null,
    });
    expect(parseTemplate({ type: "transfer", accountId: A, toAccountId: B, amount: "100" })).not.toBeNull();
    expect(parseTemplate({ type: "income", accountId: A, amount: "5" })).not.toBeNull();
  });

  it("rejects what the transactions table would reject", () => {
    expect(parseTemplate({ type: "transfer", accountId: A, amount: "100" })).toBeNull(); // no destination
    expect(parseTemplate({ type: "transfer", accountId: A, toAccountId: A, amount: "100" })).toBeNull();
    expect(parseTemplate({ type: "transfer", accountId: A, toAccountId: B, categoryId: C, amount: "100" })).toBeNull();
    expect(parseTemplate({ type: "expense", accountId: A, toAccountId: B, amount: "100" })).toBeNull();
    expect(parseTemplate({ type: "adjustment", accountId: A, amount: "100" })).toBeNull();
  });

  it("rejects bad amounts and malformed input", () => {
    for (const amount of ["0", "-5", "12.5", "", "abc", 100, null]) {
      expect(parseTemplate({ type: "expense", accountId: A, amount })).toBeNull();
    }
    expect(parseTemplate({ type: "expense", accountId: "not-a-uuid", amount: "100" })).toBeNull();
    expect(parseTemplate(null)).toBeNull();
    expect(parseTemplate("x")).toBeNull();
  });
});
