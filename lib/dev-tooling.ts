import { timingSafeEqual } from "node:crypto";

// Guard for the dev-only test-login route (app/api/dev/test-session), which
// can switch a browser tab to ANY account it holds tokens for. It must never
// be reachable on a deployed site, so it has to be off by default in several
// independent ways rather than hinging on one setting.

type Env = Record<string, string | undefined>;

/**
 * True only on a developer's own machine: not a production build, not
 * running on Vercel (preview deployments are production builds too, but the
 * VERCEL check keeps this closed even if NODE_ENV were ever wrong), and a
 * TEST_SESSION_SECRET has been set.
 */
export function devToolingEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL) return false;
  return Boolean(env.TEST_SESSION_SECRET);
}

/** Constant-time comparison, so the secret can't be probed byte by byte. */
export function secretMatches(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
