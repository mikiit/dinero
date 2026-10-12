import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_ROWS,
  TRANSACTION_CSV_HEADERS,
  planTransactionsImport,
  transactionKey,
  type ImportAccount,
  type ImportCategory,
} from "./import-transactions";

const HEADER = TRANSACTION_CSV_HEADERS.join(",");

const accounts: ImportAccount[] = [
  { id: "a-wallet", name: "Wallet", currency: "RSD" },
  { id: "a-card", name: "Card", currency: "RSD" },
  { id: "a-eur", name: "Euro", currency: "EUR" },
];

const categories: ImportCategory[] = [
  { id: "c-food", name: "Food", kind: "expense", parentId: null },
  { id: "c-groc", name: "Groceries", kind: "expense", parentId: "c-food" },
  { id: "c-oth-e", name: "Other", kind: "expense", parentId: null },
  { id: "c-oth-i", name: "Other", kind: "income", parentId: null },
];

function plan(lines: string[], existing = new Map<string, number>()) {
  return planTransactionsImport(
    [HEADER, ...lines].join("\r\n"),
    accounts,
    categories,
    existing,
  );
}

describe("planTransactionsImport", () => {
  it("plans a valid expense with a nested category", () => {
    const p = plan([
      "2026-01-15,expense,Wallet,,Food > Groceries,123.45,RSD,Maxi,milk",
    ]);
    expect(p.errors).toEqual([]);
    expect(p.toInsert).toEqual([
      {
        type: "expense",
        accountId: "a-wallet",
        toAccountId: null,
        categoryId: "c-groc",
        amount: 12345n,
        currency: "RSD",
        occurredOn: "2026-01-15",
        merchant: "Maxi",
        note: "milk",
      },
    ]);
  });

  it("resolves same-named categories by kind", () => {
    const p = plan([
      "2026-01-15,expense,Wallet,,Other,1.00,RSD,,",
      "2026-01-15,income,Wallet,,Other,1.00,RSD,,",
    ]);
    expect(p.toInsert.map((t) => t.categoryId)).toEqual(["c-oth-e", "c-oth-i"]);
  });

  it("accepts transfers, signed adjustments and uncategorized rows", () => {
    const p = plan([
      "2026-01-15,transfer,Wallet,Card,,50.00,RSD,,",
      "2026-01-15,adjustment,Wallet,,,-7.50,RSD,,",
      "2026-01-15,expense,Wallet,,,5.00,RSD,,",
    ]);
    expect(p.errors).toEqual([]);
    expect(p.toInsert[0].toAccountId).toBe("a-card");
    expect(p.toInsert[1].amount).toBe(-750n);
    expect(p.toInsert[2].categoryId).toBeNull();
  });

  it("rejects, with line numbers, instead of creating anything", () => {
    const p = plan([
      "2026-01-15,expense,Nope,,,5.00,RSD,,",
      "2026-01-15,expense,Wallet,,Missing,5.00,RSD,,",
      "2026-02-30,expense,Wallet,,,5.00,RSD,,",
      "2026-01-15,refund,Wallet,,,5.00,RSD,,",
      "2026-01-15,expense,Wallet,,,0.00,RSD,,",
      "2026-01-15,expense,Wallet,,,-5.00,RSD,,",
      "2026-01-15,expense,Wallet,,,5,00,RSD,,",
      "2026-01-15,expense,Wallet,,,5.00,EUR,,",
      "2026-01-15,transfer,Wallet,,,5.00,RSD,,",
      "2026-01-15,transfer,Wallet,Wallet,,5.00,RSD,,",
      "2026-01-15,adjustment,Wallet,,,0.00,RSD,,",
      "2026-01-15,transfer,Wallet,Card,Food,5.00,RSD,,",
      "2026-01-15,expense,Wallet,Card,,5.00,RSD,,",
    ]);
    expect(p.toInsert).toEqual([]);
    expect(p.errors.map((e) => e.line)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it("rejects a category of the wrong kind for the type", () => {
    const p = plan(["2026-01-15,income,Wallet,,Food,5.00,RSD,,"]);
    expect(p.errors[0].message).toMatch(/does not exist/);
  });

  it("rejects ambiguous account or category names", () => {
    const dupAccounts = [...accounts, { id: "a-w2", name: "Wallet", currency: "RSD" }];
    const p = planTransactionsImport(
      `${HEADER}\r\n2026-01-15,expense,Wallet,,,5.00,RSD,,`,
      dupAccounts,
      categories,
      new Map(),
    );
    expect(p.errors[0].message).toMatch(/ambiguous/);
  });

  it("rejects the whole file on a wrong header, empty file or row cap", () => {
    expect(
      planTransactionsImport("a,b\r\n1,2", accounts, categories, new Map()).errors[0].message,
    ).toMatch(/Unexpected columns/);
    expect(
      planTransactionsImport("", accounts, categories, new Map()).errors[0].message,
    ).toMatch(/empty/);
    const many = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      () => "2026-01-15,expense,Wallet,,,1.00,RSD,,",
    );
    expect(plan(many).errors[0].message).toMatch(/Too many rows/);
  });

  it("restores formula-guarded names and notes from our own export", () => {
    const guardedAccounts = [{ id: "a-x", name: "=Cash", currency: "RSD" }];
    const p = planTransactionsImport(
      `${HEADER}\r\n2026-01-15,expense,'=Cash,,,1.00,RSD,,'=note`,
      guardedAccounts,
      categories,
      new Map(),
    );
    expect(p.errors).toEqual([]);
    expect(p.toInsert[0].note).toBe("=note");
  });

  it("skips rows already in the ledger, once per existing occurrence", () => {
    const row = "2026-01-15,expense,Wallet,,,5.00,RSD,Maxi,milk";
    const key = transactionKey({
      type: "expense",
      accountId: "a-wallet",
      toAccountId: null,
      categoryId: null,
      amount: 500n,
      occurredOn: "2026-01-15",
      merchant: "Maxi",
      note: "milk",
    });
    // Ledger has it once; the file has it three times -> two are genuinely new.
    const p = plan([row, row, row], new Map([[key, 1]]));
    expect(p.duplicates).toBe(1);
    expect(p.toInsert).toHaveLength(2);
  });

  it("handles quoted fields with commas and newlines", () => {
    const p = plan(['2026-01-15,expense,Wallet,,,5.00,RSD,"Maxi, Beograd","a\nb"']);
    expect(p.errors).toEqual([]);
    expect(p.toInsert[0].merchant).toBe("Maxi, Beograd");
    expect(p.toInsert[0].note).toBe("a\nb");
  });
});
