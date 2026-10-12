// Minimal RFC 4180 CSV writer. No dependency: the only thing we need is
// quoting, and the one non-obvious part is spreadsheet formula injection.

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/**
 * Escapes one cell. User-typed text (notes, merchants, names) that starts
 * with `= + - @` would be executed as a formula when the file is opened in
 * Excel/Sheets, so it gets a leading apostrophe. Pass `{ text: false }` for
 * machine-generated cells (numbers, dates) that must stay untouched - a
 * negative amount legitimately starts with "-".
 */
export function csvCell(value: string, opts: { text?: boolean } = {}): string {
  const guarded =
    (opts.text ?? true) && FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

/** Reverses csvCell's formula guard for text cells: a leading apostrophe
 * directly before a trigger character was added by us on export. */
export function unguardCell(value: string): string {
  return value.startsWith("'") && FORMULA_TRIGGERS.test(value.slice(1))
    ? value.slice(1)
    : value;
}

/**
 * RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside
 * quotes, CRLF or LF, optional UTF-8 BOM. Blank lines are skipped. Throws on
 * an unterminated quote rather than guessing where the field ended.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let wasQuoted = false;

  const endField = () => {
    row.push(field);
    field = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "" && !wasQuoted) {
      inQuotes = true;
      wasQuoted = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error("Unterminated quoted field in CSV.");
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string;
  /** false for numeric/date columns; see csvCell. Defaults to true. */
  text?: boolean;
};

/** CRLF line endings and a UTF-8 BOM so Excel opens Serbian characters
 * (š, đ, č, ć, ž) correctly instead of guessing a legacy code page. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => csvCell(c.header, { text: false })).join(","),
    ...rows.map((row) =>
      columns.map((c) => csvCell(c.value(row), { text: c.text })).join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
