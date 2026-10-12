import { describe, expect, it } from "vitest";
import { csvCell, parseCsv, toCsv, unguardCell } from "./csv";

describe("parseCsv", () => {
  it("parses plain rows, CRLF and LF, and skips blank lines", () => {
    expect(parseCsv("a,b\r\n1,2\n\n3,4\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("strips a BOM", () => {
    expect(parseCsv("﻿a,b\r\n")).toEqual([["a", "b"]]);
  });

  it("handles quotes, doubled quotes, commas and newlines in fields", () => {
    expect(parseCsv('"a,b","say ""hi""","l1\nl2"\r\n')).toEqual([
      ["a,b", 'say "hi"', "l1\nl2"],
    ]);
  });

  it("keeps empty fields, including a trailing one", () => {
    expect(parseCsv("a,,c,\r\n")).toEqual([["a", "", "c", ""]]);
  });

  it("throws on an unterminated quote", () => {
    expect(() => parseCsv('a,"oops\r\n')).toThrow();
  });

  it("round-trips toCsv output including guarded formulas", () => {
    const rows = [{ t: "=1+1", u: 'x,"y"\nz', n: "-5.00" }];
    const csv = toCsv(rows, [
      { header: "t", value: (r) => r.t },
      { header: "u", value: (r) => r.u },
      { header: "n", value: (r) => r.n, text: false },
    ]);
    const [, row] = parseCsv(csv);
    expect([unguardCell(row[0]), unguardCell(row[1]), row[2]]).toEqual([
      "=1+1",
      'x,"y"\nz',
      "-5.00",
    ]);
  });
});

describe("unguardCell", () => {
  it("only strips the apostrophe we added", () => {
    expect(unguardCell("'=SUM(1)")).toBe("=SUM(1)");
    expect(unguardCell("'hello")).toBe("'hello");
    expect(unguardCell("plain")).toBe("plain");
  });
});

describe("csvCell", () => {
  it("leaves plain text alone", () => {
    expect(csvCell("Groceries")).toBe("Groceries");
  });

  it("quotes commas, quotes and newlines, doubling inner quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes spreadsheet formulas in text cells", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("@x")).toBe("'@x");
  });

  it("does not touch machine cells such as negative amounts", () => {
    expect(csvCell("-75.00", { text: false })).toBe("-75.00");
  });

  it("keeps Serbian letters intact", () => {
    expect(csvCell("Ćevapi šećer")).toBe("Ćevapi šećer");
  });
});

describe("toCsv", () => {
  it("writes BOM, header, CRLF rows and a trailing newline", () => {
    const csv = toCsv(
      [{ n: "Kafa, veliki", a: "-250.00" }],
      [
        { header: "note", value: (r) => r.n },
        { header: "amount", value: (r) => r.a, text: false },
      ],
    );
    expect(csv).toBe('﻿note,amount\r\n"Kafa, veliki",-250.00\r\n');
  });

  it("writes only the header for no rows", () => {
    const csv = toCsv([], [{ header: "x", value: () => "" }]);
    expect(csv).toBe("﻿x\r\n");
  });
});
