import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type SignUpResult = {
  /** True when the account is usable right away. False means Supabase wants
   * the email confirmed first, so there is no session yet. */
  signedIn: boolean;
};

/**
 * Creates a brand-new account from an email and password (a visitor with no
 * session at all - the only kind of visitor there is now that the app no
 * longer hands out temporary accounts).
 *
 * When the project requires email confirmation, `signUp` succeeds but returns
 * no session; the caller must tell the person to check their inbox. For an
 * address that is already registered Supabase deliberately answers the same
 * way (it won't reveal which emails have accounts), so the message the UI
 * shows must not claim the address is new.
 */
export async function signUpWithPassword(
  supabase: SupabaseClient<Database>,
  email: string,
  password: string,
  options?: { emailRedirectTo?: string },
): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    ...(options?.emailRedirectTo
      ? { options: { emailRedirectTo: options.emailRedirectTo } }
      : {}),
  });

  if (error) {
    throw error;
  }

  return { signedIn: data.session !== null };
}
