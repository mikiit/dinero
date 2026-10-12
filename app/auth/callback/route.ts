import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/next-path";

/** The email-link kinds we accept. Anything else (magic links, invites, email
 * changes) is not something this app sends, so it is refused rather than
 * silently signing someone in through an unexpected door. */
const EMAIL_LINK_TYPES: readonly EmailOtpType[] = ["recovery", "signup", "email"];

function isEmailLinkType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_LINK_TYPES as readonly string[]).includes(value);
}

/**
 * Where Supabase sends the browser back to after a sign-in step:
 *
 *  - `?code=` - the PKCE return from Google (components/auth/*) or from an
 *    email link. Only works in the SAME browser that started the flow (the
 *    code verifier lives in a cookie there).
 *  - `?token_hash=&type=` - an email link built from our own template
 *    (see the password-reset notes). Works in ANY browser, which matters on a
 *    phone where the mail app opens links in a different browser than the one
 *    that asked for the email.
 *
 * `next` is where to go afterwards (an invite, the reset form); only ever a
 * path inside this app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNextPath(searchParams.get("next")) ?? "/";

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && isEmailLinkType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (ok) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // A reset link that failed (expired, already used, wrong browser) deserves
  // its own explanation, not a generic "sign-in didn't go through".
  if (next.startsWith("/auth/reset-password")) {
    return NextResponse.redirect(`${origin}/auth/reset-password?error=expired`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
