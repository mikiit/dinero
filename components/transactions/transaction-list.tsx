"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";
import {
  TransactionTypeIcon,
  transactionAmountTone,
} from "@/components/transactions/transaction-type-icon";
import { toMinor } from "@/lib/money";
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
import { UndoToast } from "@/components/transactions/undo-toast";
import type { TransactionFormState } from "@/components/transactions/transaction-form-fields";

type RowIssue = { message: string; retry: () => void };

const UNDO_WINDOW_MS = 5000;

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

/** Net day total (income - expense). Transfers move money between the
 * user's own accounts and adjustments carry an arbitrary sign, so neither
 * has an unambiguous "expense-like or income-like" contribution to a
 * single day figure - they're excluded from the sum and just rendered
 * individually. */
function dayTotal(transactions: TransactionListItem[]): bigint {
  return transactions.reduce((sum, t) => {
    const amount = BigInt(t.amount);
    if (t.type === "income") return sum + amount;
    if (t.type === "expense") return sum - amount;
    return sum;
  }, 0n);
}

export function TransactionList({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [filters, setFilters] = useState<TransactionFilters>({});

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
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionListItem | null>(null);
  const [sort, setSort] = useState<SortState>({ column: "date", direction: "desc" });
  const [undo, setUndo] = useState<TransactionListItem | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["transactions", filters],
    queryFn: ({ pageParam }: { pageParam: TransactionsCursor }) =>
      listTransactionsAction(filters, pageParam),
    initialPageParam: null as TransactionsCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

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

    deleteTransactionAction(transaction.id)
      .then((result) => {
        if (result.error) {
          setRemovedIds((prev) => {
            const next = new Set(prev);
            next.delete(transaction.id);
            return next;
          });
          setRowIssues((prev) => ({
            ...prev,
            [transaction.id]: {
              message: result.error!,
              retry: () => handleDelete(transaction),
            },
          }));
        }
      })
      .catch(() => {
        setRemovedIds((prev) => {
          const next = new Set(prev);
          next.delete(transaction.id);
          return next;
        });
        setRowIssues((prev) => ({
          ...prev,
          [transaction.id]: {
            message: "Failed to delete transaction.",
            retry: () => handleDelete(transaction),
          },
        }));
      });

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndo(transaction);
    undoTimeoutRef.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  }

  function handleUndo() {
    if (!undo) return;
    const transaction = undo;
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndo(null);

    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(transaction.id);
      return next;
    });
    clearIssue(transaction.id);

    restoreTransactionAction(transaction.id)
      .then((result) => {
        if (result.error) {
          setRowIssues((prev) => ({
            ...prev,
            [transaction.id]: {
              message: `Couldn't undo: ${result.error}`,
              retry: handleUndo,
            },
          }));
        }
      })
      .catch(() => {
        setRowIssues((prev) => ({
          ...prev,
          [transaction.id]: {
            message: "Couldn't undo the delete.",
            retry: handleUndo,
          },
        }));
      });
  }

  function handleSaveEdit(id: string, form: TransactionFormState) {
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        type: form.type,
        accountId: form.accountId,
        categoryId: form.categoryId,
        amount: toMinor(form.amount).toString(),
        occurredOn: form.occurredOn,
        note: form.note.trim() || null,
      },
    }));
    clearIssue(id);

    const retry = () => handleSaveEdit(id, form);
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
          No transactions match these filters.
        </p>
      )}

      <div className="space-y-6 lg:hidden">
        {dayGroups.map((group) => {
          const total = dayTotal(group.transactions);
          return (
          <div key={group.date}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-medium">{dayLabel(group.date)}</h2>
              <Amount
                value={total}
                size="sm"
                tone={total < 0n ? "expense" : "income"}
                showUnit={false}
              />
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
                        disabled={!isExpense && !isIncome}
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
                          <span className="block truncate text-sm">
                            {category?.name ??
                              (t.type === "transfer"
                                ? "Transfer"
                                : t.type === "adjustment"
                                  ? "Balance adjustment"
                                  : "Uncategorized")}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {account?.name ?? "Unknown account"}
                            {t.note ? ` · ${t.note}` : ""}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="flex items-center gap-1.5">
                          <TransactionTypeIcon type={t.type} />
                          <Amount
                            value={signedAmount}
                            size="md"
                            tone={transactionAmountTone(t.type)}
                            showSign={isIncome || t.type === "adjustment"}
                            showUnit={false}
                          />
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(t)}
                        >
                          Delete
                        </Button>
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
                      disabled={!editable}
                      onClick={() => editable && setEditingTransaction(t)}
                      className="flex w-full min-w-0 items-center gap-2 text-left disabled:cursor-default"
                    >
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category?.color ?? "#94a3b8" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {category?.name ??
                            (t.type === "transfer"
                              ? "Transfer"
                              : t.type === "adjustment"
                                ? "Balance adjustment"
                                : "Uncategorized")}
                        </span>
                        {t.note && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {t.note}
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
                    {account?.name ?? "Unknown account"}
                  </td>
                  <td className="py-2.5">
                    <TransactionTypeIcon type={t.type} />
                  </td>
                  <td className="py-2.5 text-right">
                    <Amount
                      value={signedAmount}
                      size="sm"
                      tone={transactionAmountTone(t.type)}
                      showSign={isIncome || t.type === "adjustment"}
                      showUnit={false}
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => handleDelete(t)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedForTable.length === 0 && !query.isPending && (
          <p className="py-4 text-sm text-muted-foreground">
            No transactions match these filters.
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

      {undo && (
        <UndoToast
          message="Transaction deleted."
          onUndo={handleUndo}
          onDismiss={() => {
            if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
            setUndo(null);
          }}
        />
      )}
    </>
  );
}
