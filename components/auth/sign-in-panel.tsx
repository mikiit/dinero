"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { signInWithPassword } from "@/lib/auth/sign-in";
import { signUpWithPassword } from "@/lib/auth/sign-up";
import { cn } from "@/lib/utils";

type Mode = "signin" | "create";

const MIN_PASSWORD_LENGTH = 8;

/** Supabase's wording is for developers; say what the person should do. */
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "Wrong email or password.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Confirm your email first: open the link we sent you.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  return message;
}

/**
 * The login screen's form for someone who is not signed in: Google, or an
 * email and password (sign in to an existing account, or create one).
 * `next` is where to land afterwards (an invite link, say); it has already
 * been validated as an in-app path by the server.
 */
export function SignInPanel({ next }: { next?: string | null }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<"form" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const callback = () =>
    `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  function done() {
    // Full load, not a soft navigation: the app must start fresh as this user.
    window.location.href = next ?? "/";
  }

  async function google() {
    setError(null);
    setNotice(null);
    setPending("google");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    });
    // On success the browser is already on its way to Google.
    if (error) {
      setError(friendly(error.message));
      setPending(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "create" && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setPending("form");
    const supabase = createClient();
    try {
      if (mode === "signin") {
        await signInWithPassword(supabase, email.trim(), password);
        done();
        return;
      }

      const { signedIn } = await signUpWithPassword(supabase, email.trim(), password, {
        emailRedirectTo: callback(),
      });
      if (signedIn) {
        done();
        return;
      }
      // Never claim the address is new: for one that is already registered
      // Supabase answers exactly the same way, on purpose.
      setNotice(
        `We sent a link to ${email.trim()}. Open it to finish. If you already have an account with this address, just sign in instead.`,
      );
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : "Something went wrong."));
    } finally {
      setPending((p) => (p === "form" ? null : p));
    }
  }

  const busy = pending !== null;

  return (
    <div className="space-y-5">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full text-base"
        onClick={google}
        disabled={busy}
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9Z" />
        </svg>
        {pending === "google" ? "Redirecting…" : "Continue with Google"}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2" role="tablist" aria-label="Sign in or create an account">
          {(["signin", "create"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              variant={mode === m ? "default" : "outline"}
              className="h-10 flex-1"
              onClick={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </Button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auth-email">Email</Label>
          <Input
            id="auth-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auth-password">Password</Label>
          <div className="relative">
            <Input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              required
              minLength={mode === "create" ? MIN_PASSWORD_LENGTH : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground"
            >
              {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
          {mode === "create" && (
            <p className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
        </div>

        <Button type="submit" className="h-11 w-full text-base" disabled={busy}>
          {pending === "form"
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </Button>

        <p
          role={error ? "alert" : "status"}
          className={cn(
            "min-h-5 text-sm",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error ?? notice}
        </p>
      </form>
    </div>
  );
}
