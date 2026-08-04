import { createBrowserClient } from "@supabase/ssr";

// TODO: wire in `Database` from lib/database.types.ts once it's generated
// (`supabase gen types typescript`) against a real project — see
// SPEC.md Phase 0. Untyped until then.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
