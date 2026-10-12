import { cache } from "react";
import { getContext } from "@/lib/context";
import { processAutoRules } from "@/lib/db/recurring";
import { todayInAppTimeZone } from "@/lib/recurring";
import { personalScope, type Scope } from "@/lib/scope";

/**
 * Posts whatever auto-post recurring rules have come due, once per request:
 * `cache` dedupes it across the layout and the page that both call it, so
 * rendering order can't matter and a single page load never does it twice.
 *
 * It covers EVERY ledger the user can write to - their personal one and each
 * shared space where they are an owner or editor - not just the one they are
 * looking at: the household's rent is due on the 1st whichever ledger anyone
 * has open. (Viewers can't post, so their spaces are skipped.) When two
 * members open the app at once, the unique index on (recurring_id,
 * occurred_on) still lets exactly one of them post each occurrence.
 *
 * Runs on every page load rather than on a schedule because that is when
 * the user is about to look at their balances. It is idempotent (see
 * lib/db/recurring.ts), so opening the app five times in a row, or from
 * two devices at once, still posts each occurrence exactly once.
 *
 * It must NEVER throw: a failing rule (or a not-yet-migrated database) may
 * not take the whole app down with it.
 */
export const ensureRecurringPosted = cache(async (): Promise<void> => {
  try {
    const ctx = await getContext();
    if (!ctx) return;

    const scopes: Scope[] = [
      personalScope(ctx.user.id),
      ...ctx.spaces
        .filter((s) => s.role !== "viewer")
        .map((s) => ({ userId: ctx.user.id, spaceId: s.id })),
    ];
    const today = todayInAppTimeZone();

    for (const scope of scopes) {
      try {
        await processAutoRules(ctx.supabase, scope, today);
      } catch (err) {
        console.error("recurring: pass failed for one ledger", scope.spaceId, err);
      }
    }
  } catch (err) {
    console.error("recurring: auto-post pass failed", err);
  }
});
