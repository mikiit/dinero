import { listAccounts } from "@/lib/db/accounts";
import { AccountList } from "@/components/accounts/account-list";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { getContext } from "@/lib/context";
import { redirect } from "next/navigation";

export default async function AccountsPage() {
  const ctx = await getContext();

  if (!ctx) redirect("/login");

  const { supabase, scope } = ctx;

  const accounts = await listAccounts(supabase, scope);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 lg:max-w-5xl lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-medium">Accounts</h1>
        {ctx.canWrite && <AccountDialog />}
      </div>
      <AccountList accounts={accounts} readOnly={!ctx.canWrite} />
    </main>
  );
}
