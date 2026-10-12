import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Converts the current anonymous session into a real account by attaching
 * an email + password (Supabase's "convert an anonymous user" flow). The
 * auth.uid() stays the same, so every existing row the anonymous session
 * owned is already owned by the upgraded account — no data migration
 * needed (SPEC.md Phase 4).
 */
export async function upgradeAnonymousAccount(
  supabase: SupabaseClient<Database>,
  email: string,
  password: string,
  options?: { emailRedirectTo?: string },
) {
  // The confirmation email's link lands on `emailRedirectTo` when given, so
  // the user returns to where they were (e.g. an invite) after confirming.
  const { data, error } = options?.emailRedirectTo
    ? await supabase.auth.updateUser(
        { email, password },
        { emailRedirectTo: options.emailRedirectTo },
      )
    : await supabase.auth.updateUser({ email, password });

  if (error) {
    throw error;
  }

  return data.user;
}
