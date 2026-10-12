import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { AddTransactionPageClient } from "@/components/transactions/add-transaction-page-client";
import { getContext } from "@/lib/context";

export default async function NewTransactionPage() {
  const ctx = await getContext();

  if (!ctx) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted-foreground">
          Setting up your session — refresh in a moment.
        </p>
      </main>
    );
  }

  const { supabase, scope } = ctx;

  const [accounts, categories] = await Promise.all([
    listAccounts(supabase, scope),
    listCategories(supabase, scope),
  ]);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="font-heading text-xl font-medium">Add Transaction</h1>
      <AddTransactionPageClient accounts={accounts} categories={categories} />
    </main>
  );
}
