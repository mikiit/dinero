"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/auth/password";
import { setNewPassword } from "@/lib/auth/reset-password";

function friendly(message: string): string {
  if (/different from the old|same as the old|should be different/i.test(message)) {
    return "Choose a password you haven't used for this account before.";
  }
  if (/weak|easy to guess|pwned|compromised/i.test(message)) {
    return "That password is too easy to guess. Try a longer or less common one.";
  }
  return message;
}

/** The form behind a reset link: the person arrives here already holding a
 * recovery session, so it only has to choose the new password. */
export function NewPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const problem = validateNewPassword(password, confirmation);
    if (problem) {
      setError(problem);
      return;
    }

    setPending(true);
    try {
      await setNewPassword(createClient(), password);
      // Full load: start the app fresh as this (now signed-in) user.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : "Something went wrong."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <div className="relative">
          <Input
            id="new-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground"
          >
            {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Repeat it</Label>
        <Input
          id="confirm-password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className="h-11"
        />
      </div>

      <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>

      <p role="alert" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
