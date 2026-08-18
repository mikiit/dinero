import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Signs in to an existing account, replacing whatever session is currently
 * active. Unlike upgradeAnonymousAccount, this does not preserve the
 * current session's uid or its data - it switches to the uid tied to the
 * given email. Any anonymous session it replaces is simply abandoned
 * (still a row in auth.users, just never signed back into); proxy.ts's
 * updateSession creates a fresh one on the next unauthenticated request.
 */
export async function signInWithPassword(
  supabase: SupabaseClient<Database>,
  email: string,
  password: string,
) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data.user;
}
