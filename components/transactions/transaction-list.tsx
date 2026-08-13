"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
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
    <div className="space-y-4 pb-20">
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

      <div className="space-y-6">
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
