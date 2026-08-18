import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { AccountSection } from "@/components/settings/account-section";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:max-w-xl lg:p-8">
      <h1 className="font-heading text-xl font-medium">Settings</h1>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Account</h2>
        <AccountSection
          email={user?.email ?? null}
          isAnonymous={user?.is_anonymous ?? true}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Theme</h2>
        <ThemeToggle />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Manage</h2>
        <ul className="divide-y rounded-lg border">
          <li>
            <Link href="/accounts" className="block p-3 text-sm">
              Accounts
            </Link>
          </li>
          <li>
            <Link href="/categories" className="block p-3 text-sm">
              Categories
            </Link>
          </li>
        </ul>
      </div>

      <p className="text-sm text-muted-foreground">
        Base currency and data export/import are coming in a later phase.
      </p>
    </main>
  );
}
