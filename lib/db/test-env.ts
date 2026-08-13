import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
