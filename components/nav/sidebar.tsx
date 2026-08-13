"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HouseIcon,
  LandmarkIcon,
  ListIcon,
  PieChartIcon,
  PlusIcon,
  SettingsIcon,
  TagsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AddTransactionSheet } from "@/components/transactions/add-transaction-sheet";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: HouseIcon },
  { href: "/transactions", label: "Transactions", icon: ListIcon },
  { href: "/accounts", label: "Accounts", icon: LandmarkIcon },
  { href: "/categories", label: "Categories", icon: TagsIcon },
  { href: "/reports", label: "Reports", icon: PieChartIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

/**
 * The desktop (lg+) counterpart to BottomTabBar - persistent, full-height,
 * left-fixed. Both are always in the DOM and toggle visibility purely via
 * CSS breakpoint (hidden lg:flex here, lg:hidden there), never JS viewport
 * detection - that keeps the server-rendered HTML correct for either size
 * with no hydration flash while a device query resolves client-side.
 */
export function Sidebar({
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
        <div className="fixed bottom-6 left-72 z-40 hidden max-w-sm items-start justify-between gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive shadow-lg lg:flex">
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

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background lg:flex">
        <div className="p-4">
          <span className="font-heading text-lg font-semibold tracking-tight">
            Dinero
          </span>
        </div>

        <div className="px-4 pb-2">
          <AddTransactionSheet
            accounts={accounts}
            categories={categories}
            onBackgroundError={setError}
            trigger={
              <Button className="w-full justify-center gap-1.5">
                <PlusIcon className="size-4" />
                Add transaction
              </Button>
            }
          />
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-0.5 px-3 py-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4.5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
