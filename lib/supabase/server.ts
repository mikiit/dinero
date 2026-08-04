import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// TODO: wire in `Database` from lib/database.types.ts once it's generated
// (`supabase gen types typescript`) against a real project — see
// SPEC.md Phase 0. Untyped until then.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — session refresh
            // happens in Proxy instead (see SPEC.md Phase 4). Safe to ignore.
          }
        },
      },
    },
  );
}
