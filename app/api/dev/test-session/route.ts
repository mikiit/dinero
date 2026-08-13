import { createClient } from "@/lib/supabase/server";

// Dev-only tooling for scripts/test-session.mjs: lets a browser tab switch
// its session to a disposable test user for verification, without having
// to hand-craft @supabase/ssr's cookie format. Reuses lib/supabase/server.ts
// so the *same* cookie-writing logic the app already trusts is what runs
// here - not a reimplementation of it.
//
// 404s outside development, and requires TEST_SESSION_SECRET as a header
// even in dev, since `next dev` binds to the LAN address, not just
// localhost - without the secret this would let anyone on the network
// hijack a browser's session to any account they choose.
function checkAuth(request: Request): Response | null {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const expectedSecret = process.env.TEST_SESSION_SECRET;
  if (!expectedSecret) {
    return new Response("Not found", { status: 404 });
  }

  if (request.headers.get("x-test-session-secret") !== expectedSecret) {
    return new Response("Not found", { status: 404 });
  }

  return null;
}

// Reads whatever session is currently in the browser's cookies, so it can
// be captured and restored after swapping in a disposable test session -
// browser automation tooling can't read these cookies directly (they're
// not exposed to page JS), so this is the only way to round-trip them.
export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return Response.json({ session: null });
  }

  return Response.json({
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    },
  });
}

export async function POST(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const { access_token, refresh_token } = body ?? {};
  if (typeof access_token !== "string" || typeof refresh_token !== "string") {
    return Response.json(
      { error: "Missing access_token/refresh_token" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ ok: true });
}
