"use client";

import { createContext, useContext, useEffect } from "react";
import type { SpaceRole } from "@/lib/scope";

export type LedgerSpace = { id: string; name: string; role: SpaceRole };

export type LedgerState = {
  /** The active space, or null for the personal ledger. */
  activeSpaceId: string | null;
  role: SpaceRole | null;
  /** False for a viewer: write controls are hidden (the database enforces it). */
  canWrite: boolean;
  spaces: LedgerSpace[];
};

const LedgerContext = createContext<LedgerState>({
  activeSpaceId: null,
  role: null,
  canWrite: true,
  spaces: [],
});

/** localStorage key used to tell OTHER tabs that the ledger changed. */
export const LEDGER_CHANGED_KEY = "dinero-ledger-changed";

export function announceLedgerChange() {
  try {
    localStorage.setItem(LEDGER_CHANGED_KEY, String(Date.now()));
  } catch {
    // Private mode etc.: other tabs just won't be told.
  }
}

/**
 * Provides the active ledger to client components, and keeps every open tab
 * on the SAME ledger. The ledger lives in one cookie shared by all tabs, so
 * without this a tab left showing "Household" would, after a switch to
 * "Personal" in another tab, quietly save the next expense into Personal.
 * The `storage` event only fires in the OTHER tabs, which then reload.
 */
export function LedgerProvider({
  value,
  children,
}: {
  value: LedgerState;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LEDGER_CHANGED_KEY) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerState {
  return useContext(LedgerContext);
}
