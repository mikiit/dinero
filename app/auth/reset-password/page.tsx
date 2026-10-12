import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { buttonVariants } from "@/components/ui/button";

// Public to the access gate (it lives under /auth/), but it only does
// anything for someone who arrived through a valid reset link: that link
// signs them in with a short-lived recovery session, which is what proves
// they own the email address.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canReset = Boolean(user) && !user?.is_anonymous && !error;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <header className="space-y-1 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {canReset ? "Choose a new password" : "This link doesn't work"}
        </h1>
        {canReset && user?.email && (
          <p className="text-sm text-muted-foreground">for {user.email}</p>
        )}
      </header>

      {canReset ? (
        <NewPasswordForm />
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Reset links work once and expire after a short time. If you asked
            for it on another device or browser, open the link where you asked,
            or request a new one.
          </p>
          <Link href="/login" className={buttonVariants({ className: "h-11 w-full text-base" })}>
            Back to sign in
          </Link>
        </div>
      )}
    </main>
  );
}
