import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/next-path";

/**
 * Where Supabase redirects back to after a Google OAuth round-trip -
 * shared by both flows in components/auth/google-auth-buttons.tsx
 * (supabase.auth.linkIdentity for attaching Google to the current
 * anonymous session, supabase.auth.signInWithOAuth for signing into an
 * existing one). Both land here with the same `?code=...` query param;
 * exchangeCodeForSession applies whichever one was actually in flight.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where to go after signing in (e.g. back to an invite link); only ever a
  // path inside this app.
  const next = safeNextPath(searchParams.get("next")) ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
