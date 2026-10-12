"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon } from "lucide-react";
import { switchSpaceAction } from "@/app/spaces/actions";
import { announceLedgerChange, useLedger } from "@/components/spaces/ledger-provider";

const PERSONAL = "__personal";
const MANAGE = "__manage";

/**
 * Which ledger you are looking at - always visible, because every number and
 * every new entry on screen belongs to it. Hidden until the user belongs to
 * at least one space, so the app looks exactly as before for everyone else.
 */
export function LedgerBar() {
  const { activeSpaceId, role, spaces } = useLedger();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (spaces.length === 0) return null;

  function change(value: string) {
    setError(null);
    if (value === MANAGE) {
      router.push("/spaces");
      return;
    }
    startTransition(async () => {
      const result = await switchSpaceAction(value === PERSONAL ? null : value);
      if (result.error) {
        setError(result.error);
        return;
      }
      announceLedgerChange();
      // A full reload, not router.refresh(): client-side caches (React Query)
      // hold the previous ledger's data and must not survive the switch.
      window.location.reload();
    });
  }

  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
      <label htmlFor="ledger-select" className="text-xs text-muted-foreground">
        Ledger
      </label>
      <select
        id="ledger-select"
        value={activeSpaceId ?? PERSONAL}
        disabled={isPending}
        onChange={(e) => change(e.target.value)}
        className="h-8 min-w-0 max-w-[14rem] flex-1 truncate rounded-md border bg-background px-2 text-sm font-medium"
      >
        <option value={PERSONAL}>Personal</option>
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={MANAGE}>Manage spaces…</option>
      </select>
      {role === "viewer" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          <EyeIcon className="size-3" /> View only
        </span>
      )}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
