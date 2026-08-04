import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Converts the current anonymous session into a real account by attaching
 * an email + password (Supabase's "convert an anonymous user" flow). The
 * auth.uid() stays the same, so every existing row the anonymous session
 * owned is already owned by the upgraded account — no data migration
 * needed (SPEC.md Phase 4).
 */
export async function upgradeAnonymousAccount(
  supabase: SupabaseClient,
  email: string,
  password: string,
) {
  const { data, error } = await supabase.auth.updateUser({ email, password });

  if (error) {
    throw error;
  }

  return data.user;
}
