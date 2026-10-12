"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  PaperclipIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";
import {
  TransactionTypeIcon,
  transactionAmountTone,
  transferAccountLabel,
  transferReceivedLabel,
} from "@/components/transactions/transaction-type-icon";
import { toDecimalString, toMinor } from "@/lib/money";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import type { TransactionFilters, TransactionsCursor } from "@/lib/db/transactions";
import {
  deleteTransactionAction,
  listTransactionsAction,
  restoreTransactionAction,
  updateTransactionAction,
  type TransactionListItem,
} from "@/app/transactions/actions";
import { TransactionFilterBar } from "@/components/transactions/transaction-filter-bar";
import { EditTransactionSheet } from "@/components/transactions/edit-transaction-sheet";
import { useToast } from "@/components/ui/toaster";
import { useLedger } from "@/components/spaces/ledger-provider";
import type { TransactionFormState } from "@/components/transactions/transaction-form-fields";
import { DEFAULT_CURRENCY, sumByCurrency } from "@/lib/currency";
import { formatTags, parseTags } from "@/lib/tags";

type RowIssue = { message: string; retry: () => void };


// Desktop table sort. Applies to whatever's currently loaded, not a
// server-side global sort - infinite scroll loads more pages under the
// same client-side sort, so the loaded set always stays consistently
// ordered, but "biggest expense ever" isn't guaranteed visible without
// scrolling further first. A real global sort would mean teaching the
// cursor-pagination in lib/db/transactions.ts a second sort key, which is
// a backend change this pass doesn't make.
type SortColumn = "date" | "amount";
type SortDirection = "asc" | "desc";
type SortState = { column: SortColumn; direction: SortDirection };

function sortTransactions(
  transactions: TransactionListItem[],
  sort: SortState,
): TransactionListItem[] {
  const sorted = [...transactions].sort((a, b) => {
    const cmp =
      sort.column === "date"
        ? a.occurredOn.localeCompare(b.occurredOn)
        : compareBigint(BigInt(a.amount), BigInt(b.amount));
    return sort.direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function compareBigint(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function SortableHeader({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (column: SortColumn) => void;
  align?: "left" | "right";
}) {
  const active = sort.column === column;
  const Icon = active
    ? sort.direction === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;

  return (
    <th className={cn("py-2 font-medium", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-40")} />
      </button>
    </th>
  );
}

function dayLabel(occurredOn: string): string {
  return format(parseISO(occurredOn), "EEEE, d MMMM yyyy");
}

function groupByDay(transactions: TransactionListItem[]) {
  const groups: { date: string; transactions: TransactionListItem[] }[] = [];
  for (const t of transactions) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.occurredOn) {
      last.transactions.push(t);
    } else {
      groups.push({ date: t.occurredOn, transactions: [t] });
    }
  }
  return groups;
}

/** Net day total (income - expense), one figure per currency - amounts in
 * different currencies are never added together. Transfers move money
 * between the user's own accounts and adjustments carry an arbitrary sign,
 * so neither has an unambiguous "expense-like or income-like" contribution
 * to a single day figure - they're excluded from the sum and just rendered
 * individually. */
function dayTotals(transactions: TransactionListItem[]) {
  return sumByCurrency(
    transactions.filter((t) => t.type === "income" || t.type === "expense"),
    (t) => t.currency,
    (t) => (t.type === "income" ? BigInt(t.amount) : -BigInt(t.amount)),
  );
}

export function TransactionList({
  accounts,
  categories,
  initialFilters = {},
}: {
  accounts: Account[];
  categories: Category[];
  /** Pre-applied filters, e.g. from a Reports drill-down link. */
  initialFilters?: TransactionFilters;
}) {
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters);

  return (
    <div className="space-y-4">
      <TransactionFilterBar
        accounts={accounts}
        categories={categories}
        filters={filters}
        onChange={setFilters}
      />
      {/* Keyed by filters: none of the previous filtered view's client-side
          optimistic state (removed rows, overrides, in-flight issues)
          applies once the filters change, so a full remount resets it -
          simpler and safer than an effect trying to sync it back to empty. */}
      <TransactionListResults
        key={JSON.stringify(filters)}
        accounts={accounts}
        categories={categories}
        filters={filters}
      />
    </div>
  );
}

function TransactionListResults({
  accounts,
  categories,
  filters,
}: {
  accounts: Account[];
  categories: Category[];
  filters: TransactionFilters;
}) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<
    Record<string, Partial<TransactionListItem>>
  >({});
  const [rowIssues, setRowIssues] = useState<Record<string, RowIssue>>({});
  const { canWrite } = useLedger();
  const canWriteHere = canWrite;
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionListItem | null>(null);
  const [sort, setSort] = useState<SortState>({ column: "date", direction: "desc" });
  const { show } = useToast();
  const hasFilters = Object.values(filters).some(Boolean);
  const emptyMessage = hasFilters
    ? "No transactions match these filters."
    : canWriteHere
      ? "No transactions yet. Tap the + button to add your first one."
      : "No transactions yet.";

  const query = useInfiniteQuery({
    queryKey: ["transactions", filters],
    queryFn: ({ pageParam }: { pageParam: TransactionsCursor }) =>
      listTransactionsAction(filters, pageParam),
    initialPageParam: null as TransactionsCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const visible = useMemo(() => {
    const raw = query.data?.pages.flatMap((p) => p.transactions) ?? [];
    return raw
      .filter((t) => !removedIds.has(t.id) || rowIssues[t.id])
      .map((t) => ({ ...t, ...overrides[t.id] }));
  }, [query.data, removedIds, overrides, rowIssues]);

  const dayGroups = useMemo(() => groupByDay(visible), [visible]);
  const sortedForTable = useMemo(
    () => sortTransactions(visible, sort),
    [visible, sort],
  );

  function toggleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "desc" },
    );
  }

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          query.hasNextPage &&
          !query.isFetchingNextPage
        ) {
          query.fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, query]);

  function clearIssue(id: string) {
    setRowIssues((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleDelete(transaction: TransactionListItem) {
    setRemovedIds((prev) => new Set(prev).add(transaction.id));
    clearIssue(transaction.id);

    const failed = (message: string) => {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(transaction.id);
        return next;
      });
      setRowIssues((prev) => ({
        ...prev,
        [transaction.id]: { message, retry: () => handleDelete(transaction) },
      }));
    };

    deleteTransactionAction(transaction.id)
      .then((result) => {
        if (result.error) failed(result.error);
      })
      .catch(() => failed("Failed to delete transaction."));

    show({
      message: "Transaction deleted.",
      undo: () => restoreDeleted(transaction),
    });
  }

  /** Undo for handleDelete: show the row again at once, then tell the server;
   * if that fails the toast reports it and the row carries a retry. */
  async function restoreDeleted(
    transaction: TransactionListItem,
  ): Promise<{ error?: string }> {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(transaction.id);
      return next;
    });
    clearIssue(transaction.id);

    try {
      const result = await restoreTransactionAction(transaction.id);
      if (result.error) {
        setRowIssues((prev) => ({
          ...prev,
          [transaction.id]: {
            message: `Couldn't undo: ${result.error}`,
            retry: () => void restoreDeleted(transaction),
          },
        }));
      }
      return result;
    } catch {
      setRowIssues((prev) => ({
        ...prev,
        [transaction.id]: {
          message: "Couldn't undo the delete.",
          retry: () => void restoreDeleted(transaction),
        },
      }));
      return { error: "Network problem." };
    }
  }

  function handleSaveEdit(
    id: string,
    form: TransactionFormState,
    isUndo = false,
  ) {
    // What the row looks like right now, so "Undo" can put it back.
    const before = visible.find((t) => t.id === id);

    setOverrides((prev) => ({
      ...prev,
      [id]: {
        type: form.type,
        accountId: form.accountId,
        categoryId: form.categoryId,
        amount: toMinor(form.amount).toString(),
        occurredOn: form.occurredOn,
        note: form.note.trim() || null,
        tags: parseTags(form.tags ?? ""),
      },
    }));
    clearIssue(id);

    if (!isUndo && before) {
      const previous: TransactionFormState = {
        type: before.type as TransactionFormState["type"],
        accountId: before.accountId,
        toAccountId: before.toAccountId ?? "",
        categoryId: before.categoryId ?? "",
        amount: toDecimalString(BigInt(before.amount)),
        occurredOn: before.occurredOn,
        note: before.note ?? "",
        tags: formatTags(before.tags),
      };
      show({
        message: "Changes saved.",
        undo: () => handleSaveEdit(id, previous, true),
      });
    }

    const retry = () => handleSaveEdit(id, form, isUndo);
    updateTransactionAction({ id, ...form })
      .then((result) => {
        if (result.error) {
          setRowIssues((prev) => ({
            ...prev,
            [id]: { message: result.error!, retry },
          }));
        }
      })
      .catch(() => {
        setRowIssues((prev) => ({
          ...prev,
          [id]: { message: "Failed to save changes.", retry },
        }));
      });
  }

  return (
    <>
      {query.isPending && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {query.isError && (
        <p className="text-sm text-destructive">
          Failed to load transactions.
        </p>
      )}

      {!query.isPending && dayGroups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      )}

      <div className="space-y-6 lg:hidden">
        {dayGroups.map((group) => {
          const totals = dayTotals(group.transactions);
          return (
          <div key={group.date}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-medium">{dayLabel(group.date)}</h2>
              <span className="flex items-baseline gap-3">
                {totals.map(({ currency, total }) => (
                  <Amount
                    key={currency}
                    value={total}
                    currency={currency}
                    size="sm"
                    tone={total < 0n ? "expense" : "income"}
                    showUnit={currency !== DEFAULT_CURRENCY || totals.length > 1}
                  />
                ))}
              </span>
            </div>
            <ul className="divide-y rounded-lg border">
              {group.transactions.map((t) => {
                const category = t.categoryId
                  ? categoryById.get(t.categoryId)
                  : undefined;
                const account = accountById.get(t.accountId);
                const issue = rowIssues[t.id];
                const isExpense = t.type === "expense";
                const isIncome = t.type === "income";
                const signedAmount = isExpense
                  ? -BigInt(t.amount)
                  : BigInt(t.amount);

                return (
                  <li key={t.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                        disabled={(!isExpense && !isIncome) || !canWrite}
                        onClick={() => {
                          if (isExpense || isIncome) setEditingTransaction(t);
                        }}
                      >
                        <span
                          className="inline-block size-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: category?.color ?? "#94a3b8",
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm">
                            <span className="truncate">
                              {category?.name ??
                                (t.type === "transfer"
                                  ? "Transfer"
                                  : t.type === "adjustment"
                                    ? "Balance adjustment"
                                    : "Uncategorized")}
                            </span>
                            {t.receiptPath && (
                              <PaperclipIcon
                                className="size-3.5 shrink-0 text-muted-foreground"
                                aria-label="Has a receipt photo"
                              />
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {transferAccountLabel(account?.name, t.type, t.toAccountId, accountById)}
                            {transferReceivedLabel(t.type, t.toAmount, t.toAccountId, accountById)}
                            {t.note ? ` · ${t.note}` : ""}
                            {t.tags.length > 0 ? ` · ${t.tags.map((x) => `#${x}`).join(" ")}` : ""}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="flex items-center gap-1.5">
                          <TransactionTypeIcon type={t.type} />
                          <Amount
                            value={signedAmount}
                            currency={t.currency}
                            size="md"
                            tone={transactionAmountTone(t.type)}
                            showSign={isIncome || t.type === "adjustment"}
                            showUnit={t.currency !== DEFAULT_CURRENCY}
                          />
                        </span>
                        {canWrite && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(t)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                    {issue && (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                        <span>{issue.message}</span>
                        <button
                          type="button"
                          onClick={issue.retry}
                          className="shrink-0 font-medium underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <SortableHeader label="Date" column="date" sort={sort} onSort={toggleSort} />
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 font-medium">Account</th>
              <th className="py-2 font-medium">Type</th>
              <SortableHeader
                label="Amount"
                column="amount"
                sort={sort}
                onSort={toggleSort}
                align="right"
              />
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {sortedForTable.map((t) => {
              const category = t.categoryId
                ? categoryById.get(t.categoryId)
                : undefined;
              const account = accountById.get(t.accountId);
              const issue = rowIssues[t.id];
              const isExpense = t.type === "expense";
              const isIncome = t.type === "income";
              const signedAmount = isExpense
                ? -BigInt(t.amount)
                : BigInt(t.amount);
              const editable = isExpense || isIncome;

              return (
                <tr key={t.id} className="group border-b last:border-0 hover:bg-muted/40">
                  <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                    {format(parseISO(t.occurredOn), "d MMM yyyy")}
                  </td>
                  <td className="max-w-0 py-2.5">
                    <button
                      type="button"
                      disabled={!editable || !canWrite}
                      onClick={() => editable && canWrite && setEditingTransaction(t)}
                      className="flex w-full min-w-0 items-center gap-2 text-left disabled:cursor-default"
                    >
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category?.color ?? "#94a3b8" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">
                            {category?.name ??
                              (t.type === "transfer"
                                ? "Transfer"
                                : t.type === "adjustment"
                                  ? "Balance adjustment"
                                  : "Uncategorized")}
                          </span>
                          {t.receiptPath && (
                            <PaperclipIcon
                              className="size-3.5 shrink-0 text-muted-foreground"
                              aria-label="Has a receipt photo"
                            />
                          )}
                        </span>
                        {(t.note || t.tags.length > 0) && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {[t.note, t.tags.map((x) => `#${x}`).join(" ")]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                    </button>
                    {issue && (
                      <div className="mt-1.5 flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        <span className="min-w-0 flex-1 truncate">{issue.message}</span>
                        <button
                          type="button"
                          onClick={issue.retry}
                          className="shrink-0 font-medium underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                    {transferAccountLabel(account?.name, t.type, t.toAccountId, accountById)}
                    {transferReceivedLabel(t.type, t.toAmount, t.toAccountId, accountById)}
                  </td>
                  <td className="py-2.5">
                    <TransactionTypeIcon type={t.type} />
                  </td>
                  <td className="py-2.5 text-right">
                    <Amount
                      value={signedAmount}
                            currency={t.currency}
                      size="sm"
                      tone={transactionAmountTone(t.type)}
                      showSign={isIncome || t.type === "adjustment"}
                      showUnit={t.currency !== DEFAULT_CURRENCY}
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    {canWrite && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => handleDelete(t)}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedForTable.length === 0 && !query.isPending && (
          <p className="py-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </div>

      <div ref={sentinelRef} />

      {query.isFetchingNextPage && (
        <p className="text-center text-sm text-muted-foreground">
          Loading more…
        </p>
      )}

      <EditTransactionSheet
        open={editingTransaction !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(null);
        }}
        transaction={editingTransaction}
        accounts={accounts}
        categories={categories}
        onSave={handleSaveEdit}
      />

    </>
  );
}
