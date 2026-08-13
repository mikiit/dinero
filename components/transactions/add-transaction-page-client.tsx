"use client";

import { useState } from "react";
import { AddTransactionSheet } from "@/components/transactions/add-transaction-sheet";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";

export function AddTransactionPageClient({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 underline"
          >
            Dismiss
          </button>
        </div>
      )}
      <AddTransactionSheet
        accounts={accounts}
        categories={categories}
        onBackgroundError={setError}
      />
    </div>
  );
}
