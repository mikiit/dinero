import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DEFAULT_CATEGORIES } from "./default-categories";
import { scopeColumns, scopeFilter, type Scope } from "@/lib/scope";

// A first page load asks for categories from the layout AND the page at the
// same moment. This map only dedupes callers inside ONE process (cheap, saves
// a round trip); across serverless instances the unique index on categories
// (20261013150000_categories_unique_active) is what guarantees one set, and
// insertMissingDefaults tolerates losing that race.
const inFlight = new Map<string, Promise<void>>();

// Postgres unique_violation.
const UNIQUE_VIOLATION = "23505";
const MAX_ATTEMPTS = 3;

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

export async function insertMissingDefaults(
  supabase: SupabaseClient<Database>,
  scope: Scope,
): Promise<void> {
  // A unique violation means another instance inserted some of the same
  // defaults between our read and our insert. The batch is all-or-nothing, so
  // re-read and insert only what is still missing.
  for (let attempt = 1; ; attempt++) {
    const { data: existing, error: fetchError } = await supabase
      .from("categories")
      .select("name, kind")
      .filter(...scopeFilter(scope))
      .is("archived_at", null)
      .is("parent_id", null);

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

    if (!insertError) {
      return;
    }
    if (insertError.code !== UNIQUE_VIOLATION || attempt >= MAX_ATTEMPTS) {
      throw insertError;
    }
  }
}
