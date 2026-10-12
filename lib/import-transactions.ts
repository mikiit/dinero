import { parseCsv, unguardCell } from "@/lib/csv";
import { toMinor } from "@/lib/money";
import { parseTags } from "@/lib/tags";

// Pure planning step for CSV import: no I/O, so every rule is unit-testable.
// Reads exactly the format lib/db/export.ts writes. Nothing is created
// implicitly - an account or category name that doesn't resolve to exactly
// one existing row rejects that row.

/** Must match the header lib/db/export.ts writes (asserted in export.test.ts). */
export const TRANSACTION_CSV_HEADERS = [
  "date",
  "type",
  "account",
  "to_account",
  "category",
  "amount",
  "currency",
  "to_amount",
  "merchant",
  "note",
  "tags",
] as const;

/** Columns added after the first export format. Older files without them
 * are still accepted: no to_amount means every row is single-currency, no
 * tags means no tags. */
const OPTIONAL_COLUMNS: readonly string[] = ["to_amount", "tags"];

function acceptedHeaders(): string[] {
  const out: string[] = [];
  for (const withToAmount of [true, false]) {
    for (const withTags of [true, false]) {
      out.push(
        TRANSACTION_CSV_HEADERS.filter(
          (h) =>
            !OPTIONAL_COLUMNS.includes(h) ||
            (h === "to_amount" ? withToAmount : withTags),
        ).join(","),
      );
    }
  }
  return out;
}

export const MAX_IMPORT_ROWS = 5000;

export type ImportAccount = { id: string; name: string; currency: string };
export type ImportCategory = {
  id: string;
  name: string;
  kind: "expense" | "income";
  parentId: string | null;
};

export type ImportType = "expense" | "income" | "transfer" | "adjustment";

export type PlannedTransaction = {
  type: ImportType;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  amount: bigint;
  currency: string;
  /** Received amount of a transfer between currencies; else null. */
  toAmount: bigint | null;
  occurredOn: string;
  merchant: string | null;
  note: string | null;
  /** Normalized (parseTags); empty when none. */
  tags: string[];
};

export type ImportRowError = { line: number; message: string };

export type ImportPlan = {
  /** Data rows in the file (excluding the header). */
  total: number;
  toInsert: PlannedTransaction[];
  /** Rows already present in the ledger (see transactionKey), skipped. */
  duplicates: number;
  errors: ImportRowError[];
};

/** Identity of a transaction for duplicate detection. Two rows with the
 * same key are "the same entry" - re-importing a file you exported must be
 * a no-op, not a doubling of every balance. */
export function transactionKey(t: {
  type: string;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  amount: bigint;
  toAmount?: bigint | null;
  occurredOn: string;
  merchant: string | null;
  note: string | null;
}): string {
  return JSON.stringify([
    t.occurredOn,
    t.type,
    t.accountId,
    t.toAccountId ?? "",
    t.categoryId ?? "",
    t.amount.toString(),
    t.toAmount?.toString() ?? "",
    t.merchant ?? "",
    t.note ?? "",
  ]);
}

const TYPES: readonly string[] = ["expense", "income", "transfer", "adjustment"];

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function planTransactionsImport(
  csvText: string,
  accounts: ImportAccount[],
  categories: ImportCategory[],
  /** Multiset of existing non-deleted transactions: key -> occurrences. */
  existing: Map<string, number>,
): ImportPlan {
  const fail = (message: string): ImportPlan => ({
    total: 0,
    toInsert: [],
    duplicates: 0,
    errors: [{ line: 1, message }],
  });

  let rows: string[][];
  try {
    rows = parseCsv(csvText);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not read the file.");
  }

  if (rows.length === 0) return fail("The file is empty.");
  const header = rows[0].map((h) => h.trim());
  if (!acceptedHeaders().includes(header.join(","))) {
    return fail(
      `Unexpected columns. Expected: ${TRANSACTION_CSV_HEADERS.join(", ")}.`,
    );
  }
  const columnCount = header.length;
  const cell = (cells: string[], name: string) => {
    const i = header.indexOf(name);
    return i === -1 ? "" : cells[i];
  };

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return fail(
      `Too many rows (${dataRows.length}). The limit is ${MAX_IMPORT_ROWS} per import.`,
    );
  }

  const accountsByName = new Map<string, ImportAccount[]>();
  for (const a of accounts) {
    accountsByName.set(a.name, [...(accountsByName.get(a.name) ?? []), a]);
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const categoriesByPath = new Map<string, ImportCategory[]>();
  for (const c of categories) {
    const parent = c.parentId ? categoryById.get(c.parentId) : undefined;
    const path = parent ? `${parent.name} > ${c.name}` : c.name;
    const key = `${c.kind}|${path}`;
    categoriesByPath.set(key, [...(categoriesByPath.get(key) ?? []), c]);
  }

  const remaining = new Map(existing);
  const plan: ImportPlan = {
    total: dataRows.length,
    toInsert: [],
    duplicates: 0,
    errors: [],
  };

  dataRows.forEach((cells, index) => {
    // +2: one for the header, one because lines are 1-based.
    const line = index + 2;
    const error = (message: string) => plan.errors.push({ line, message });

    if (cells.length !== columnCount) {
      return error(`Expected ${columnCount} columns, found ${cells.length}.`);
    }
    const date = cell(cells, "date");
    const type = cell(cells, "type");
    const accountRaw = cell(cells, "account");
    const toAccountRaw = cell(cells, "to_account");
    const categoryRaw = cell(cells, "category");
    const amountRaw = cell(cells, "amount");
    const currency = cell(cells, "currency");
    const toAmountRaw = cell(cells, "to_amount");
    const merchantRaw = cell(cells, "merchant");
    const noteRaw = cell(cells, "note");
    const tagsRaw = cell(cells, "tags");
    // Text cells went through csvCell's formula guard on export.
    const accountName = unguardCell(accountRaw);
    const toAccountName = unguardCell(toAccountRaw);
    const categoryName = unguardCell(categoryRaw);

    const occurredOn = date.trim();
    if (!isRealDate(occurredOn)) {
      return error(`Invalid date "${date}" (expected YYYY-MM-DD).`);
    }

    const txType = type.trim();
    if (!TYPES.includes(txType)) {
      return error(`Unknown type "${type}".`);
    }

    const accountMatches = accountsByName.get(accountName) ?? [];
    if (accountMatches.length === 0) {
      return error(`Account "${accountName}" does not exist.`);
    }
    if (accountMatches.length > 1) {
      return error(`Account name "${accountName}" is ambiguous.`);
    }
    const account = accountMatches[0];

    let toAccount: ImportAccount | null = null;
    if (txType === "transfer") {
      const matches = accountsByName.get(toAccountName) ?? [];
      if (toAccountName === "") return error("Transfer is missing to_account.");
      if (matches.length === 0) {
        return error(`Account "${toAccountName}" does not exist.`);
      }
      if (matches.length > 1) {
        return error(`Account name "${toAccountName}" is ambiguous.`);
      }
      toAccount = matches[0];
      if (toAccount.id === account.id) {
        return error("Transfer to the same account.");
      }
    } else if (toAccountName !== "") {
      return error(`to_account is only allowed on transfers.`);
    }

    let categoryId: string | null = null;
    if (categoryName !== "") {
      if (txType !== "expense" && txType !== "income") {
        return error(`A ${txType} cannot have a category.`);
      }
      const matches = categoriesByPath.get(`${txType}|${categoryName}`) ?? [];
      if (matches.length === 0) {
        return error(`${txType} category "${categoryName}" does not exist.`);
      }
      if (matches.length > 1) {
        return error(`Category "${categoryName}" is ambiguous.`);
      }
      categoryId = matches[0].id;
    }

    const amountText = amountRaw.trim();
    if (!/^-?\d+(\.\d{1,2})?$/.test(amountText)) {
      return error(`Invalid amount "${amountRaw}".`);
    }
    const amount = toMinor(amountText);
    if (txType === "adjustment" ? amount === 0n : amount <= 0n) {
      return error(
        txType === "adjustment"
          ? "Adjustment amount cannot be zero."
          : `Amount must be positive for ${txType}.`,
      );
    }

    if (currency.trim() !== account.currency) {
      return error(
        `Currency "${currency}" does not match account "${account.name}" (${account.currency}).`,
      );
    }

    // A transfer between currencies carries what arrived; nothing else may.
    let toAmount: bigint | null = null;
    const crossCurrency =
      txType === "transfer" && toAccount !== null && toAccount.currency !== account.currency;
    const toAmountText = toAmountRaw.trim();
    if (crossCurrency) {
      if (!/^\d+(\.\d{1,2})?$/.test(toAmountText) || toMinor(toAmountText) <= 0n) {
        return error(
          `Transfer from ${account.currency} to ${toAccount!.currency} needs a positive to_amount (the amount received).`,
        );
      }
      toAmount = toMinor(toAmountText);
    } else if (toAmountText !== "") {
      return error("to_amount is only allowed on transfers between different currencies.");
    }

    const planned: PlannedTransaction = {
      type: txType as ImportType,
      accountId: account.id,
      toAccountId: toAccount?.id ?? null,
      categoryId,
      amount,
      currency: account.currency,
      toAmount,
      occurredOn,
      merchant: merchantRaw === "" ? null : unguardCell(merchantRaw),
      note: noteRaw === "" ? null : unguardCell(noteRaw),
      tags: parseTags(unguardCell(tagsRaw)),
    };

    const key = transactionKey(planned);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      plan.duplicates++;
      return;
    }
    plan.toInsert.push(planned);
  });

  return plan;
}
