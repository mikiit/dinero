import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoogleAuthButtons } from "@/components/auth/google-auth-buttons";
import { EmailAuthForm } from "@/components/auth/email-auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already a real account - nothing to link or sign into from here.
  if (user && !user.is_anonymous) {
    redirect("/settings");
  }

  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:max-w-lg lg:p-8">
      <h1 className="font-heading text-xl font-medium">Account</h1>
      {error && (
        <p className="text-sm text-destructive">
          Sign-in didn&apos;t go through. Please try again.
        </p>
      )}
      <GoogleAuthButtons />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or use email
        <span className="h-px flex-1 bg-border" />
      </div>

      <EmailAuthForm />
    </main>
  );
}
