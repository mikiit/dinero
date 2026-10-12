import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { AddTransactionPageClient } from "@/components/transactions/add-transaction-page-client";
import { getContext } from "@/lib/context";
import { redirect } from "next/navigation";

export default async function NewTransactionPage() {
  const ctx = await getContext();

  if (!ctx) redirect("/login");

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
