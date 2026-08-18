"use server";

import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/sign-out";

export type SignOutActionResult = { error?: string };

/**
 * No server-side redirect - the client does a hard `window.location`
 * navigation on success (see components/settings/account-section.tsx),
 * so the fresh anonymous session proxy.ts creates on the next request
 * renders cleanly instead of risking a stale render of the old account's
 * data still sitting in React Query's cache.
 */
export async function signOutAction(): Promise<SignOutActionResult> {
  const supabase = await createClient();

  try {
    await signOut(supabase);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to sign out.",
    };
  }

  return {};
}
