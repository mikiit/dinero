"use client";

import { useEffect, useState } from "react";
import { ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import type { AnyTransactionType, TransactionFilters } from "@/lib/db/transactions";
import { buildCategoryOptions } from "@/components/transactions/transaction-form-fields";

const TYPE_OPTIONS: { value: AnyTransactionType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "adjustment", label: "Adjustment" },
];

export function TransactionFilterBar({
  accounts,
  categories,
  filters,
  onChange,
}: {
  accounts: Account[];
  categories: Category[];
  filters: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
}) {
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  // On a phone the five filter controls would push the list a full screen
  // down, so they sit behind a button. Already-applied filters (e.g. from a
  // Reports drill-down) start open, so they are never hidden from view.
  const activeCount = [
    filters.accountId,
    filters.categoryId ?? (filters.uncategorized ? "none" : undefined),
    filters.type,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;
  const [open, setOpen] = useState(activeCount > 0);

  // Debounced so typing doesn't fire a fetch per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== (filters.search ?? "")) {
        onChange({ ...filters, search: searchInput || undefined });
      }
    }, 300);
    return () => clearTimeout(handle);
    // Only re-run when searchInput changes - re-running on `filters`/`onChange`
    // would refire the debounce timer on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const categoryOptionsExpense = buildCategoryOptions(categories, "expense");
  const categoryOptionsIncome = buildCategoryOptions(categories, "income");
  const allCategoryOptions = [
    ...categoryOptionsExpense,
    ...categoryOptionsIncome,
  ];

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
      <Input
        placeholder="Search notes and merchants"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="lg:w-56"
      />

      <button
        type="button"
        aria-expanded={open}
        aria-controls="transaction-filters"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center justify-between rounded-lg border px-3 text-sm lg:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontalIcon className="size-4" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      <div
        id="transaction-filters"
        className={cn("flex-col gap-2", open ? "flex" : "hidden", "lg:contents")}
      >
      <div className="grid grid-cols-2 gap-2 lg:contents">
        <Select
          value={filters.accountId ?? "all"}
          onValueChange={(value) =>
            onChange({
              ...filters,
              accountId: value === "all" ? undefined : (value as string),
            })
          }
        >
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue>
              {(value: string) =>
                value === "all"
                  ? "All accounts"
                  : (accounts.find((a) => a.id === value)?.name ??
                    "All accounts")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={
            filters.uncategorized ? "uncategorized" : (filters.categoryId ?? "all")
          }
          onValueChange={(value) =>
            onChange({
              ...filters,
              categoryId:
                value === "all" || value === "uncategorized"
                  ? undefined
                  : (value as string),
              uncategorized: value === "uncategorized" ? true : undefined,
            })
          }
        >
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue>
              {(value: string) =>
                value === "all"
                  ? "All categories"
                  : value === "uncategorized"
                    ? "Uncategorized"
                    : (allCategoryOptions.find((c) => c.id === value)?.label ??
                    "All categories")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="uncategorized">Uncategorized</SelectItem>
            {allCategoryOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.type ?? "all"}
          onValueChange={(value) =>
            onChange({
              ...filters,
              type:
                value === "all" ? undefined : (value as AnyTransactionType),
            })
          }
        >
          <SelectTrigger className="w-full lg:w-36">
            <SelectValue>
              {(value: string) =>
                TYPE_OPTIONS.find((o) => o.value === value)?.label ??
                "All types"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="lg:hidden" />
      </div>

      {/* minmax(0, 1fr) + min-w-0: a native date input has a minimum width
          of its own on iOS and would otherwise push the row off the screen.
          The visible labels matter there too - an empty date field on iOS is
          just a blank box. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 lg:contents">
        <label className="min-w-0 space-y-1 lg:space-y-0">
          <span className="text-xs text-muted-foreground lg:sr-only">From</span>
          <Input
            type="date"
            aria-label="From date"
            value={filters.dateFrom ?? ""}
            onChange={(e) =>
              onChange({ ...filters, dateFrom: e.target.value || undefined })
            }
            className="w-full min-w-0 max-w-full appearance-none lg:w-40"
          />
        </label>
        <label className="min-w-0 space-y-1 lg:space-y-0">
          <span className="text-xs text-muted-foreground lg:sr-only">To</span>
          <Input
            type="date"
            aria-label="To date"
            value={filters.dateTo ?? ""}
            onChange={(e) =>
              onChange({ ...filters, dateTo: e.target.value || undefined })
            }
            className="w-full min-w-0 max-w-full appearance-none lg:w-40"
          />
        </label>
      </div>
      </div>
    </div>
  );
}
