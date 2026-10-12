import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { safeNextPath } from "@/lib/auth/next-path";
import { decideAccess } from "@/lib/supabase/access";

// Runs on every request via proxy.ts. Refreshes the session and enforces the
// one access rule: only signed-in people use the app. A visitor without a
// real login is sent to /login (pages) or told 401 (data endpoints) and then
// returned to where they were headed.
//
// It used to create an anonymous Supabase session for every first visit, so
// the app worked with no login at all. That is gone: anonymous sessions are
// no longer created here, and an old one still sitting in a browser is not
// accepted as a login (see decideAccess).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const decision = decideAccess(
    pathname,
    user,
    process.env.NODE_ENV === "production",
  );

  if (decision === "allow") return response;

  if (decision === "unauthorized") {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // A page. Remember where the visitor was going (an invite link, say) so
  // signing in lands them there - but only for in-app paths, never a URL.
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  const next = pathname === "/" ? null : safeNextPath(`${pathname}${search}`);
  if (next) login.searchParams.set("next", next);

  const redirect = NextResponse.redirect(login);
  // Keep any session-cookie refresh that happened above.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
