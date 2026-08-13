import Link from "next/link";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="font-heading text-xl font-medium">Settings</h1>

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
        Base currency, theme, and data export/import are coming in a later
        phase.
      </p>
    </main>
  );
}
