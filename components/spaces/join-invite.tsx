"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "@/app/spaces/actions";
import { announceLedgerChange } from "@/components/spaces/ledger-provider";

/** Joining is a button, never a side effect of loading the page: link
 * previews and prefetchers open URLs, and must not be able to use up (or
 * accept) an invite. */
export function JoinInvite({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function join() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInviteAction(token);
      if (result.error) {
        setError(result.error);
        return;
      }
      announceLedgerChange();
      // Full load: the app must start fresh in the space just joined.
      // Full load on purpose: nothing from the previous ledger may survive in client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    });
  }

  return (
    <div className="space-y-3">
      <Button onClick={join} disabled={isPending}>
        {isPending ? "Joining…" : "Join this space"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
