import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DEFAULT_CATEGORIES } from "./default-categories";
import { scopeColumns, scopeFilter, type Scope } from "@/lib/scope";

/**
 * Inserts the default category set (SPEC.md Phase 0) for a user, skipping
 * any name+kind pair that already exists — safe to call more than once
 * (first-run bootstrap, re-seeding a wiped dev database, etc.).
 */
export async function seedDefaultCategories(
  supabase: SupabaseClient<Database>,
  scope: Scope,
) {
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
