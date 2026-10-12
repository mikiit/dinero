"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { signInWithPassword } from "@/lib/auth/sign-in";
import { upgradeAnonymousAccount } from "@/lib/auth/upgrade-anonymous-account";
import { cn } from "@/lib/utils";

type Mode = "create" | "signin";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Email + password, the counterpart of the Google buttons:
 *  - "Create account" attaches the email to the CURRENT session, so every
 *    account and transaction already here stays (same auth.uid()).
 *  - "Sign in" switches this device to an account that already exists; what
 *    the temporary session held stays behind in it.
 */
export function EmailAuthForm() {
  const [mode, setMode] = useState<Mode>("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setPending(true);
    const supabase = createClient();
    try {
      if (mode === "signin") {
        await signInWithPassword(supabase, email.trim(), password);
        // Full reload, not a soft navigation: nothing from the previous
        // (temporary) session may linger in already-mounted client state.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/";
        return;
      }

      const user = await upgradeAnonymousAccount(supabase, email.trim(), password);
      if (user.is_anonymous === false) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/settings";
        return;
      }
      // Projects that require confirmation keep the account temporary until
      // the emailed link is opened; say so rather than looking like nothing
      // happened.
      setNotice(
        `We sent a confirmation link to ${email.trim()}. Open it to finish creating your account; your data is kept.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-2" role="tablist" aria-label="Email options">
        {(["create", "signin"] as const).map((m) => (
          <Button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            variant={mode === m ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
          >
            {m === "create" ? "Create account" : "Sign in"}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="auth-email">Email</Label>
        <Input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="auth-password">Password</Label>
        <Input
          id="auth-password"
          type="password"
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending
          ? "Please wait…"
          : mode === "create"
            ? "Create account"
            : "Sign in"}
      </Button>

      <p className="text-xs text-muted-foreground">
        {mode === "create"
          ? "Keeps everything already in this session - same accounts, same transactions, attached to a real login."
          : "Switches this device to an account you've already created. What is in the current temporary session stays in it."}
      </p>

      <p
        role={error ? "alert" : "status"}
        className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}
      >
        {error ?? notice}
      </p>
    </form>
  );
}
