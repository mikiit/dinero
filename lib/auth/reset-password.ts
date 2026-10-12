import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Asks Supabase to email a password-reset link. Supabase answers success for
 * an address with no account too - deliberately, so the form can't be used to
 * find out who has an account - so the UI must word its confirmation the same
 * way for everyone ("if an account exists...").
 *
 * `redirectTo` is where the emailed link lands; it must be on the project's
 * allow-list of redirect URLs or Supabase silently falls back to the site URL.
 */
export async function requestPasswordReset(
  supabase: SupabaseClient<Database>,
  email: string,
  redirectTo: string,
): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    throw error;
  }
}

/**
 * Sets a new password for the signed-in (recovery) session, then signs every
 * OTHER device out: if the old password was the problem - guessed, leaked -
 * whoever held it must not stay logged in. Ending the other sessions is best
 * effort; a failure there must not undo the password change that succeeded.
 */
export async function setNewPassword(
  supabase: SupabaseClient<Database>,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw error;
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    console.error("password reset: could not end other sessions", signOutError);
  }
}
