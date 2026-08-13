"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HouseIcon,
  ListIcon,
  PieChartIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddTransactionSheet } from "@/components/transactions/add-transaction-sheet";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof HouseIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

export function BottomTabBar({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-start justify-between gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive shadow-lg">
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

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <NavLink href="/" label="Home" icon={HouseIcon} active={pathname === "/"} />
        <NavLink
          href="/transactions"
          label="Transactions"
          icon={ListIcon}
          active={pathname.startsWith("/transactions")}
        />

        <div className="flex flex-1 items-center justify-center">
          <AddTransactionSheet
            accounts={accounts}
            categories={categories}
            onBackgroundError={setError}
            trigger={
              <button
                type="button"
                aria-label="Add transaction"
                className="-mt-6 flex size-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg"
              >
                <PlusIcon className="size-6" />
              </button>
            }
          />
        </div>

        <NavLink
          href="/reports"
          label="Reports"
          icon={PieChartIcon}
          active={pathname.startsWith("/reports")}
        />
        <NavLink
          href="/settings"
          label="Settings"
          icon={SettingsIcon}
          active={
            pathname.startsWith("/settings") ||
            pathname.startsWith("/accounts") ||
            pathname.startsWith("/categories")
          }
        />
      </nav>
    </>
  );
}
