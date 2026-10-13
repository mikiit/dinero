import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoogleAuthButtons } from "@/components/auth/google-auth-buttons";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { safeNextPath } from "@/lib/auth/next-path";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error, next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);

  // Already signed in: nothing to do here.
  if (user && !user.is_anonymous) {
    redirect(next ?? "/");
  }

  // A browser that still holds one of the old temporary sessions (the app
  // used to hand every visitor one). It is not a login any more, but it may
  // hold data, so offer the way to keep it: attach a real login to it.
  const hasOldTemporarySession = Boolean(user?.is_anonymous);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <header className="space-y-3 text-center">
        {/* A static icon from /public, not worth next/image's machinery. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={64}
          height={64}
          className="mx-auto size-16 rounded-2xl"
        />
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Dinero</h1>
          <p className="text-sm text-muted-foreground">
            {hasOldTemporarySession
              ? "This browser has an old temporary session."
              : "Sign in to see your money."}
          </p>
        </div>
      </header>

      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          Sign-in didn&apos;t go through. Please try again.
        </p>
      )}

      {hasOldTemporarySession ? (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Create an account to keep what is in it, or sign in to an account you
            already have. Dinero needs a login now.
          </p>
          <GoogleAuthButtons next={next} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use email
            <span className="h-px flex-1 bg-border" />
          </div>
          <EmailAuthForm next={next} />
        </div>
      ) : (
        <SignInPanel next={next} />
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
      </p>
    </main>
  );
}
