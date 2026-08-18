"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { signOutAction } from "@/app/settings/actions";

export function AccountSection({
  email,
  isAnonymous,
}: {
  email: string | null;
  isAnonymous: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (isAnonymous) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm">You&apos;re using a temporary account.</p>
        <p className="text-xs text-muted-foreground">
          Create an account to keep this data and reach it from another device.
        </p>
        <Link href="/login" className={buttonVariants({ size: "sm" })}>
          Create account or sign in
        </Link>
      </div>
    );
  }

  function handleSignOut() {
    setError(null);
    startTransition(async () => {
      const result = await signOutAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      // Full reload - see app/settings/actions.ts for why.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="truncate text-sm font-medium">{email}</p>
      <Button variant="outline" size="sm" onClick={handleSignOut} disabled={isPending}>
        {isPending ? "Signing out…" : "Sign out"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
