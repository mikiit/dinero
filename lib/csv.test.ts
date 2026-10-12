import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

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
