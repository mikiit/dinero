import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { AddTransactionPageClient } from "@/components/transactions/add-transaction-page-client";

export default async function NewTransactionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted-foreground">
          Setting up your session — refresh in a moment.
        </p>
      </main>
    );
  }

  const [accounts, categories] = await Promise.all([
    listAccounts(supabase, user.id),
    listCategories(supabase, user.id),
  ]);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="font-heading text-xl font-medium">Add Transaction</h1>
      <AddTransactionPageClient accounts={accounts} categories={categories} />
    </main>
  );
}
