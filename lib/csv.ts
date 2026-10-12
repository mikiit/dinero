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
