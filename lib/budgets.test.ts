import { describe, expect, it } from "vitest";
import { budgetProgress } from "./budgets";

const oct = { monthStartIso: "2026-10-01", todayIso: "2026-10-12" };

describe("budgetProgress", () => {
  it("is ok well under budget and gives a per-day allowance incl. today", () => {
    // 31-day month, day 12 -> 20 days left including today.
    const p = budgetProgress(100000n, 20000n, oct);
    expect(p.status).toBe("ok");
    expect(p.remaining).toBe(80000n);
    expect(p.percentBp).toBe(2000);
    expect(p.perDay).toBe(4000n); // 80000 / 20
  });

  it("floors the per-day amount instead of rounding up", () => {
    const p = budgetProgress(100000n, 20001n, oct); // 79999 / 20
    expect(p.perDay).toBe(3999n);
  });

  it("warns from 80% up to and including exactly 100%", () => {
    expect(budgetProgress(1000n, 799n, oct).status).toBe("ok");
    expect(budgetProgress(1000n, 800n, oct).status).toBe("warning");
    const full = budgetProgress(1000n, 1000n, oct);
    expect(full.status).toBe("warning");
    expect(full.remaining).toBe(0n);
    expect(full.perDay).toBeNull();
  });

  it("is over only when spent exceeds the budget; remaining goes negative", () => {
    const p = budgetProgress(1000n, 1001n, oct);
    expect(p.status).toBe("over");
    expect(p.remaining).toBe(-1n);
    expect(p.percentBp).toBe(10010);
    expect(p.perDay).toBeNull();
  });

  it("has no per-day figure for past months", () => {
    const p = budgetProgress(100000n, 20000n, {
      monthStartIso: "2026-09-01",
      todayIso: "2026-10-12",
    });
    expect(p.perDay).toBeNull();
  });

  it("on the last day of the month, today is the only day left", () => {
    const p = budgetProgress(100000n, 20000n, {
      monthStartIso: "2026-10-01",
      todayIso: "2026-10-31",
    });
    expect(p.perDay).toBe(80000n);
  });

  it("handles February in a leap year", () => {
    const p = budgetProgress(29000n, 0n, {
      monthStartIso: "2028-02-01",
      todayIso: "2028-02-01",
    });
    expect(p.perDay).toBe(1000n); // 29 days
  });

  it("treats a zero budget as over as soon as anything is spent", () => {
    expect(budgetProgress(0n, 0n, oct).status).toBe("ok");
    expect(budgetProgress(0n, 0n, oct).percentBp).toBeNull();
    expect(budgetProgress(0n, 1n, oct).status).toBe("over");
  });
});
