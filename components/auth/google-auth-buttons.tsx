"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Pending = "link" | "signin" | null;

export function GoogleAuthButtons() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  async function continueWithGoogle() {
    setError(null);
    setPending("link");
    const supabase = createClient();
    // Requires "Enable Manual Linking" in the Supabase project's Auth
    // settings, or this fails outright. Runs client-side on purpose - the
    // SDK auto-redirects the browser to Google when called this way,
    // rather than handing back a URL to redirect manually.
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setPending(null);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setPending("signin");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Button
          className="w-full"
          onClick={continueWithGoogle}
          disabled={pending !== null}
        >
          {pending === "link" ? "Redirecting…" : "Continue with Google"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Keeps everything already in this session - same accounts, same
          transactions, just attached to a real login instead of a
          temporary one.
        </p>
      </div>

      <div className="space-y-1.5">
        <Button
          variant="outline"
          className="w-full"
          onClick={signInWithGoogle}
          disabled={pending !== null}
        >
          {pending === "signin" ? "Redirecting…" : "Sign in with Google"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Switches this device to an account you&apos;ve already created.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
