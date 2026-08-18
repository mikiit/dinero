import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuthResponse, SupabaseClient } from "@supabase/supabase-js";

/**
 * Loads .env.local for live-database integration tests, which need real
 * project credentials that Vitest doesn't pull in on its own. Used only by
 * *.test.ts files that hit the live Supabase project - see
 * lib/db/ownership-triggers.test.ts for why those exist.
 */
export function loadTestEnv(): {
  url: string | undefined;
  anonKey: string | undefined;
  secretKey: string | undefined;
  hasCredentials: boolean;
} {
  let fileEnv: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const parsed: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) {
        parsed[match[1]] = match[2];
      }
    }
    fileEnv = parsed;
  } catch {
    // No .env.local - fall through to process.env only.
  }

  const env = { ...fileEnv, ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = env.SUPABASE_SECRET_KEY;

  return { url, anonKey, secretKey, hasCredentials: Boolean(url && anonKey && secretKey) };
}

/**
 * Anonymous sign-in against the live Supabase auth server occasionally
 * fails transiently ("JWT issued at future") even when the machine's own
 * clock is fine - observed as a one-off, not reproducible on demand, so
 * it's a timing race on Supabase's side rather than a local clock-skew
 * problem to fix here. A short retry clears it without masking a real
 * auth config issue, which would fail on every attempt, not just the
 * first.
 *
 * That failure surfaces as a thrown/rejected error, not a resolved
 * `{error}` - supabase-js doesn't catch it into the normal AuthError
 * shape - so this has to retry around a try/catch, not just check
 * `result.error`, or the first attempt's throw skips retry entirely.
 */
export async function signInAnonymouslyWithRetry(
  client: SupabaseClient,
  attempts = 3,
): Promise<AuthResponse> {
  let lastResult: AuthResponse | undefined;
  let lastThrown: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      lastResult = await client.auth.signInAnonymously();
      if (!lastResult.error) return lastResult;
    } catch (err) {
      lastThrown = err;
    }
    if (attempt < attempts) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  if (lastResult) return lastResult;
  throw lastThrown;
}
