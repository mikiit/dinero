import { describe, expect, it } from "vitest";
import {
  currenciesInUse,
  isCurrency,
  pickCurrency,
  sumByCurrency,
  toCurrency,
} from "./currency";
import { formatMoney, formatMoneyParts } from "./money";

describe("currency helpers", () => {
  it("knows the supported currencies", () => {
    for (const c of ["RSD", "EUR", "USD", "AED"]) expect(isCurrency(c)).toBe(true);
    for (const c of ["GBP", "rsd", "", null, undefined, 5]) expect(isCurrency(c)).toBe(false);
  });

  it("falls back to RSD for anything unexpected", () => {
    expect(toCurrency("EUR")).toBe("EUR");
    expect(toCurrency("XXX")).toBe("RSD");
    expect(toCurrency(null)).toBe("RSD");
  });

  it("lists currencies in use in a fixed order, never empty", () => {
    expect(currenciesInUse(["AED", "EUR", "EUR"])).toEqual(["EUR", "AED"]);
    expect(currenciesInUse(["USD", "RSD"])).toEqual(["RSD", "USD"]);
    expect(currenciesInUse([])).toEqual(["RSD"]);
    expect(currenciesInUse(["XXX"])).toEqual(["RSD"]);
  });

  it("picks the requested currency only when it is in use", () => {
    expect(pickCurrency("EUR", ["RSD", "EUR"])).toBe("EUR");
    expect(pickCurrency("USD", ["RSD", "EUR"])).toBe("RSD");
    expect(pickCurrency(undefined, ["EUR"])).toBe("EUR");
  });

  it("sums per currency without ever mixing them", () => {
    const rows = [
      { c: "EUR", n: 100n },
      { c: "RSD", n: 5000n },
      { c: "EUR", n: -30n },
      { c: "AED", n: 7n },
    ];
    expect(sumByCurrency(rows, (r) => r.c, (r) => r.n)).toEqual([
      { currency: "RSD", total: 5000n },
      { currency: "EUR", total: 70n },
      { currency: "AED", total: 7n },
    ]);
    expect(sumByCurrency([], (r: { c: string }) => r.c, () => 0n)).toEqual([]);
  });
});

describe("currency-aware formatting", () => {
  it("formats the same minor units in each currency", () => {
    expect(formatMoney(123456n, "RSD")).toContain("1.234,56");
    expect(formatMoney(123456n, "RSD")).toContain("RSD");
    expect(formatMoney(123456n, "EUR")).toMatch(/1\.234,56\s*(EUR|€)/);
    expect(formatMoney(-5n, "USD")).toContain("0,05");
  });

  it("splits number and unit", () => {
    const { number, unit } = formatMoneyParts(123456n, "AED");
    expect(number).toBe("1.234,56");
    expect(unit).toMatch(/AED/);
    expect(formatMoneyParts(100n).unit).toBe("RSD");
  });
});
