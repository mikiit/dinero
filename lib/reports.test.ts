import { describe, expect, it } from "vitest";
import {
  fillMonthSeries,
  formatShare,
  parseMonthParam,
  percentChange,
  shiftMonth,
  spendByCategory,
} from "./reports";

const cats = [
  { id: "food", name: "Food", parentId: null },
  { id: "groc", name: "Groceries", parentId: "food" },
  { id: "rent", name: "Rent", parentId: null },
];

describe("month helpers", () => {
  it("parses only valid yyyy-MM", () => {
    expect(parseMonthParam("2026-10")).toBe("2026-10-01");
    expect(parseMonthParam("2026-13")).toBeNull();
    expect(parseMonthParam("2026-1")).toBeNull();
    expect(parseMonthParam(undefined)).toBeNull();
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-03-01", -11)).toBe("2025-04-01");
  });
});

describe("fillMonthSeries", () => {
  it("returns 12 consecutive months, zero-filling gaps, oldest first", () => {
    const s = fillMonthSeries(
      [{ month: "2026-08-01", income: 500n, expense: 200n }],
      "2026-10-01",
    );
    expect(s).toHaveLength(12);
    expect(s[0].month).toBe("2025-11-01");
    expect(s[11].month).toBe("2026-10-01");
    expect(s.find((m) => m.month === "2026-08-01")).toEqual({
      month: "2026-08-01",
      income: 500n,
      expense: 200n,
    });
    expect(s.find((m) => m.month === "2026-09-01")).toEqual({
      month: "2026-09-01",
      income: 0n,
      expense: 0n,
    });
  });
});

describe("spendByCategory", () => {
  it("rolls children into parents, sorts biggest first, sums to total", () => {
    const r = spendByCategory(
      [
        { categoryId: "groc", amount: 3000n },
        { categoryId: "food", amount: 1000n },
        { categoryId: "rent", amount: 5000n },
        { categoryId: null, amount: 1000n },
      ],
      cats,
    );
    expect(r.total).toBe(10000n);
    expect(r.items.map((i) => [i.name, i.total])).toEqual([
      ["Rent", 5000n],
      ["Food", 4000n],
      ["Uncategorized", 1000n],
    ]);
    expect(r.items.reduce((s, i) => s + i.total, 0n)).toBe(r.total);
    expect(r.items.map((i) => i.shareBp)).toEqual([5000, 4000, 1000]);
  });

  it("puts unknown category ids into Uncategorized, never drops them", () => {
    const r = spendByCategory([{ categoryId: "ghost", amount: 700n }], cats);
    expect(r.items).toEqual([
      { categoryId: null, name: "Uncategorized", total: 700n, shareBp: 10000 },
    ]);
  });

  it("handles an empty month", () => {
    expect(spendByCategory([], cats)).toEqual({ total: 0n, items: [] });
  });

  it("computes shares without floats drifting past 100%", () => {
    const r = spendByCategory(
      [
        { categoryId: "rent", amount: 1n },
        { categoryId: "food", amount: 1n },
        { categoryId: null, amount: 1n },
      ],
      cats,
    );
    expect(r.items.map((i) => i.shareBp)).toEqual([3333, 3333, 3333]);
  });
});

describe("formatShare", () => {
  it("formats basis points as sr-RS percent", () => {
    expect(formatShare(2550)).toBe("25,5%");
    expect(formatShare(10000)).toBe("100%");
  });
});

describe("percentChange", () => {
  it("is null when nothing was spent in either month", () => {
    expect(percentChange(0n, 0n)).toBeNull();
  });

  it("calls spending with no history 'new'", () => {
    expect(percentChange(5000n, 0n)).toEqual({ kind: "new" });
  });

  it("reports whole-number rises and falls", () => {
    expect(percentChange(11800n, 10000n)).toEqual({ kind: "up", percent: 18 });
    expect(percentChange(8800n, 10000n)).toEqual({ kind: "down", percent: 12 });
    expect(percentChange(20000n, 10000n)).toEqual({ kind: "up", percent: 100 });
  });

  it("shows a category that fell to zero as down 100%", () => {
    expect(percentChange(0n, 7000n)).toEqual({ kind: "down", percent: 100 });
  });

  it("ignores changes under half a percent", () => {
    expect(percentChange(10040n, 10000n)).toEqual({ kind: "same" });
    expect(percentChange(9960n, 10000n)).toEqual({ kind: "same" });
    expect(percentChange(10000n, 10000n)).toEqual({ kind: "same" });
  });

  it("rounds to the nearest percent and never reports 0%", () => {
    expect(percentChange(10149n, 10000n)).toEqual({ kind: "up", percent: 1 });
    expect(percentChange(10151n, 10000n)).toEqual({ kind: "up", percent: 2 });
    expect(percentChange(10060n, 10000n)).toEqual({ kind: "up", percent: 1 });
  });
});
