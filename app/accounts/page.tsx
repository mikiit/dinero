import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/db/accounts";
import { AccountList } from "@/components/accounts/account-list";
import { AccountDialog } from "@/components/accounts/account-dialog";

export default async function AccountsPage() {
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

  const accounts = await listAccounts(supabase, user.id);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-medium">Accounts</h1>
        <AccountDialog />
      </div>
      <AccountList accounts={accounts} />
    </main>
  );
}
