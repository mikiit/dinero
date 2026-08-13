import { describe, expect, it } from "vitest";
import { formatRSD, fromDbAmount, fromMinor, toDbAmount, toDecimalString, toMinor } from "./money";

describe("toMinor", () => {
  it("parses a plain integer as whole units", () => {
    expect(toMinor("1234")).toBe(123400n);
  });

  it("parses a period decimal separator", () => {
    expect(toMinor("1234.56")).toBe(123456n);
  });

  it("parses a comma decimal separator (sr-RS)", () => {
    expect(toMinor("1234,56")).toBe(123456n);
  });

  it("pads a single fraction digit", () => {
    expect(toMinor("12.5")).toBe(1250n);
  });

  it("handles negative amounts", () => {
    expect(toMinor("-12.50")).toBe(-1250n);
  });

  it("handles a small negative fraction correctly", () => {
    expect(toMinor("-0.50")).toBe(-50n);
  });

  it("rejects thousands grouping", () => {
    expect(() => toMinor("1.234,56")).toThrow();
  });

  it("rejects empty input", () => {
    expect(() => toMinor("")).toThrow();
  });

  it("rejects more than 2 fraction digits", () => {
    expect(() => toMinor("12.345")).toThrow();
  });

  it("rejects garbage input", () => {
    expect(() => toMinor("12abc")).toThrow();
  });
});

describe("fromMinor", () => {
  it("converts positive minor units to major units", () => {
    expect(fromMinor(123456n)).toBeCloseTo(1234.56, 2);
  });

  it("converts negative minor units to major units", () => {
    expect(fromMinor(-150n)).toBeCloseTo(-1.5, 2);
  });

  it("round-trips through toMinor", () => {
    expect(fromMinor(toMinor("42.07"))).toBeCloseTo(42.07, 2);
  });

  it("handles zero", () => {
    expect(fromMinor(0n)).toBe(0);
  });
});

describe("formatRSD", () => {
  it("formats whole RSD amounts", () => {
    expect(formatRSD(2450000n)).toBe("24.500,00 RSD");
  });

  it("formats fractional RSD amounts", () => {
    expect(formatRSD(123456n)).toBe("1.234,56 RSD");
  });

  it("formats zero", () => {
    expect(formatRSD(0n)).toBe("0,00 RSD");
  });

  it("formats negative amounts (credit card owed)", () => {
    expect(formatRSD(-2450000n)).toBe("-24.500,00 RSD");
  });
});

describe("toDbAmount", () => {
  it("converts bigint minor units to number", () => {
    expect(toDbAmount(123456n)).toBe(123456);
  });

  it("preserves sign", () => {
    expect(toDbAmount(-2450000n)).toBe(-2450000);
  });

  it("handles zero", () => {
    expect(toDbAmount(0n)).toBe(0);
  });

  it("accepts the boundary of the safe integer range", () => {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    expect(toDbAmount(max)).toBe(Number.MAX_SAFE_INTEGER);
    expect(toDbAmount(-max)).toBe(-Number.MAX_SAFE_INTEGER);
  });

  it("throws beyond the safe integer range", () => {
    const tooBig = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => toDbAmount(tooBig)).toThrow();
    expect(() => toDbAmount(-tooBig)).toThrow();
  });
});

describe("fromDbAmount", () => {
  it("converts a number read from the DB to bigint", () => {
    expect(fromDbAmount(123456)).toBe(123456n);
  });

  it("preserves sign", () => {
    expect(fromDbAmount(-2450000)).toBe(-2450000n);
  });

  it("handles zero", () => {
    expect(fromDbAmount(0)).toBe(0n);
  });

  it("throws on a non-integer value", () => {
    expect(() => fromDbAmount(12.5)).toThrow();
  });

  it("round-trips through toDbAmount", () => {
    expect(fromDbAmount(toDbAmount(987654321n))).toBe(987654321n);
  });
});

describe("toDecimalString", () => {
  it("converts positive minor units to a decimal string", () => {
    expect(toDecimalString(123456n)).toBe("1234.56");
  });

  it("converts negative minor units, preserving the sign", () => {
    expect(toDecimalString(-123456n)).toBe("-1234.56");
  });

  it("preserves the sign for a magnitude under 1.00", () => {
    expect(toDecimalString(-75n)).toBe("-0.75");
  });

  it("handles zero", () => {
    expect(toDecimalString(0n)).toBe("0.00");
  });

  it("pads a single-digit fraction", () => {
    expect(toDecimalString(105n)).toBe("1.05");
  });

  it("round-trips through toMinor", () => {
    expect(toMinor(toDecimalString(987654n))).toBe(987654n);
    expect(toMinor(toDecimalString(-987654n))).toBe(-987654n);
  });
});
