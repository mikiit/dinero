import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Ends the current session. Doesn't delete the account being signed out
 * of - just the local session for it. proxy.ts's updateSession creates a
 * fresh anonymous session on the very next unauthenticated request
 * (anonymous is always the default state here, never a logged-out
 * screen), so callers should force a full reload afterward rather than a
 * soft client navigation - otherwise already-mounted data (React Query
 * cache, etc.) from the signed-out account can keep showing until
 * something happens to trigger a refetch.
 */
export async function signOut(supabase: SupabaseClient<Database>): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
