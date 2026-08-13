"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddTransactionSheet } from "@/components/transactions/add-transaction-sheet";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";

export function FloatingAddButton({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && (
        <div className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-start justify-between gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive shadow-lg">
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
        trigger={
          <Button
            size="icon-lg"
            className="fixed right-6 bottom-6 z-40 rounded-full shadow-lg"
            aria-label="Add transaction"
          >
            <PlusIcon className="size-6" />
          </Button>
        }
      />
    </>
  );
}
