// The starter category set from SPEC.md Phase 0. Top-level only — parent_id
// is null for all of these; sub-categories are a user action, not a seed.

export type DefaultCategory = {
  name: string;
  kind: "expense" | "income";
  sortOrder: number;
};

const EXPENSE_CATEGORY_NAMES = [
  "Groceries",
  "Rent",
  "Utilities",
  "Transport",
  "Eating out",
  "Health",
  "Fun",
  "Clothes",
  "Subscriptions",
  "Other",
] as const;

const INCOME_CATEGORY_NAMES = [
  "Salary",
  "Freelance",
  "Gift",
  "Refund",
  "Other",
] as const;

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  ...EXPENSE_CATEGORY_NAMES.map((name, i) => ({
    name,
    kind: "expense" as const,
    sortOrder: i,
  })),
  ...INCOME_CATEGORY_NAMES.map((name, i) => ({
    name,
    kind: "income" as const,
    sortOrder: i,
  })),
];
