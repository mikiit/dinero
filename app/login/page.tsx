import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoogleAuthButtons } from "@/components/auth/google-auth-buttons";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
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

  // Already a real account - nothing to link or sign into from here.
  if (user && !user.is_anonymous) {
    redirect(next ?? "/settings");
  }

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:max-w-lg lg:p-8">
      <h1 className="font-heading text-xl font-medium">Account</h1>
      {error && (
        <p className="text-sm text-destructive">
          Sign-in didn&apos;t go through. Please try again.
        </p>
      )}
      <GoogleAuthButtons next={next} />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or use email
        <span className="h-px flex-1 bg-border" />
      </div>

      <EmailAuthForm next={next} />
    </main>
  );
}
