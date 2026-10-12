import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DEFAULT_CATEGORIES } from "./default-categories";
import { scopeColumns, scopeFilter, type Scope } from "@/lib/scope";

// A first page load asks for categories from the layout AND the page at the
// same moment. Both see "none yet" and, without this, both insert the full
// default set - a new account ended up with every category twice. Sharing
// the in-flight promise makes the second caller wait for the first.
const inFlight = new Map<string, Promise<void>>();

/**
 * Inserts the default category set (SPEC.md Phase 0) for a ledger, skipping
 * any name+kind pair that already exists — safe to call more than once
 * (first-run bootstrap, re-seeding a wiped dev database, etc.), and safe to
 * call concurrently for the same ledger.
 */
export function seedDefaultCategories(
  supabase: SupabaseClient<Database>,
  scope: Scope,
): Promise<void> {
  const key = `${scope.userId}:${scope.spaceId ?? "personal"}`;
  const running = inFlight.get(key);
  if (running) return running;

  const job = insertMissingDefaults(supabase, scope).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, job);
  return job;
}

async function insertMissingDefaults(
  supabase: SupabaseClient<Database>,
  scope: Scope,
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("categories")
    .select("name, kind")
    .filter(...scopeFilter(scope))
    .is("archived_at", null);

  if (fetchError) {
    throw fetchError;
  }

  const existingKeys = new Set(
    (existing ?? []).map((c) => `${c.kind}:${c.name}`),
  );

  const toInsert = DEFAULT_CATEGORIES.filter(
    (c) => !existingKeys.has(`${c.kind}:${c.name}`),
  ).map((c) => ({
    ...scopeColumns(scope),
    name: c.name,
    kind: c.kind,
    sort_order: c.sortOrder,
  }));

  if (toInsert.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("categories")
    .insert(toInsert);

  if (insertError) {
    throw insertError;
  }
}
