import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { processAutoRules } from "@/lib/db/recurring";
import { todayInAppTimeZone } from "@/lib/recurring";

/**
 * Posts whatever auto-post recurring rules have come due, once per request:
 * `cache` dedupes it across the layout and the page that both call it, so
 * rendering order can't matter and a single page load never does it twice.
 *
 * Runs on every page load rather than on a schedule because that is when
 * the user is about to look at their balances. It is idempotent (see
 * lib/db/recurring.ts), so opening the app five times in a row, or from
 * two devices at once, still posts each occurrence exactly once.
 *
 * It must NEVER throw: a failing rule (or a not-yet-migrated database) may
 * not take the whole app down with it.
 */
export const ensureRecurringPosted = cache(async (userId: string): Promise<void> => {
  try {
    const supabase = await createClient();
    await processAutoRules(supabase, userId, todayInAppTimeZone());
  } catch (err) {
    console.error("recurring: auto-post pass failed", err);
  }
});
