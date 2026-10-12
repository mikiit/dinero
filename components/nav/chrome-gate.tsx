"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps the page in the app's navigation (sidebar, ledger bar, tab bar) -
 * except on the account screens under /auth/ (choosing a new password),
 * which are single-purpose pages that should stand alone. The layout is a
 * Server Component and can't see the URL; this can.
 */
export function ChromeGate({
  sidebar,
  ledgerBar,
  bottomBar,
  children,
}: {
  sidebar: React.ReactNode;
  ledgerBar: React.ReactNode;
  bottomBar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname.startsWith("/auth/")) {
    return <div className="flex flex-1 flex-col">{children}</div>;
  }

  return (
    <>
      {sidebar}
      {/* 4rem matches BottomTabBar's own min-h-16, so content clears the
          fixed bar exactly rather than by a guessed margin. lg: swaps that
          for left clearance under the persistent sidebar, which replaces the
          tab bar entirely at that width. */}
      <div className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
        {ledgerBar}
        {children}
      </div>
      {bottomBar}
    </>
  );
}
