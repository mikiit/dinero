import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { seedDefaultCategories } from "./seed-categories";
import { scopeColumns, scopeFilter, type Scope } from "@/lib/scope";

export type CategoryKind = "expense" | "income";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
};

export type CreateCategoryInput = {
  name: string;
  kind: CategoryKind;
  parentId?: string | null;
  color?: string | null;
  icon?: string | null;
};

export type UpdateCategoryInput = {
  name?: string;
  kind?: CategoryKind;
  parentId?: string | null;
  color?: string | null;
  icon?: string | null;
};

function toCategory(
  row: Database["public"]["Tables"]["categories"]["Row"],
): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CategoryKind,
    parentId: row.parent_id,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
  };
}

/**
 * Lists a user's non-archived categories. Seeds the default category set
 * (SPEC.md Phase 0) the first time this user has ever had zero category
 * rows - not just zero *active* ones, so archiving everything doesn't
 * silently bring the defaults back.
 */
export async function listCategories(
  supabase: SupabaseClient<Database>,
  scope: Scope,
): Promise<Category[]> {
  const { count, error: countError } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .filter(...scopeFilter(scope));

  if (countError) throw countError;

  if (count === 0) {
    await seedDefaultCategories(supabase, scope);
  }

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .filter(...scopeFilter(scope))
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(toCategory);
}

export async function createCategory(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  input: CreateCategoryInput,
): Promise<void> {
  const { error } = await supabase.from("categories").insert({
    ...scopeColumns(scope),
    name: input.name,
    kind: input.kind,
    parent_id: input.parentId ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
  });

  if (error) throw error;
}

export async function updateCategory(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<void> {
  const patch: Database["public"]["Tables"]["categories"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.parentId !== undefined) patch.parent_id = input.parentId;
  if (input.color !== undefined) patch.color = input.color;
  if (input.icon !== undefined) patch.icon = input.icon;

  const { error } = await supabase
    .from("categories")
    .update(patch)
    .eq("id", categoryId)
    .filter(...scopeFilter(scope));

  if (error) throw error;
}

/**
 * Archives a category (and, for a parent, its children). Returns the exact
 * timestamp used: restoreCategory needs it to bring back only the children
 * archived by THIS action, not ones the user had archived earlier.
 */
export async function archiveCategory(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  categoryId: string,
): Promise<string> {
  const archivedAt = new Date().toISOString();

  const { error } = await supabase
    .from("categories")
    .update({ archived_at: archivedAt })
    .eq("id", categoryId)
    .filter(...scopeFilter(scope));

  if (error) throw error;

  // Archiving a parent takes its children with it. Otherwise an active
  // child of an archived parent would still pass the "not archived" filter
  // in listCategories but have no top-level parent to be nested under, so
  // it would silently stop rendering anywhere despite still being active.
  const { error: childrenError } = await supabase
    .from("categories")
    .update({ archived_at: archivedAt })
    .eq("parent_id", categoryId)
    .filter(...scopeFilter(scope))
    .is("archived_at", null);

  if (childrenError) throw childrenError;
  return archivedAt;
}

/**
 * Undoes archiveCategory: the category itself, plus only the children that
 * the same archive action took with it (matched by `archivedAt`) - children
 * the user had archived on their own earlier stay archived.
 */
export async function restoreCategory(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  categoryId: string,
  archivedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ archived_at: null })
    .eq("id", categoryId)
    .filter(...scopeFilter(scope));
  if (error) throw error;

  const { error: childrenError } = await supabase
    .from("categories")
    .update({ archived_at: null })
    .eq("parent_id", categoryId)
    .eq("archived_at", archivedAt)
    .filter(...scopeFilter(scope));
  if (childrenError) throw childrenError;
}

/**
 * Swaps sort_order with the adjacent sibling (same parent_id, same kind)
 * in the given direction. Siblings are the set a category is reordered
 * within - moving "up"/"down" only makes sense relative to them.
 */
export async function moveCategory(
  supabase: SupabaseClient<Database>,
  scope: Scope,
  categoryId: string,
  direction: "up" | "down",
): Promise<void> {
  const { data: target, error: targetError } = await supabase
    .from("categories")
    .select("id, kind, parent_id, sort_order")
    .eq("id", categoryId)
    .filter(...scopeFilter(scope))
    .single();

  if (targetError) throw targetError;

  let siblingsQuery = supabase
    .from("categories")
    .select("id, sort_order")
    .filter(...scopeFilter(scope))
    .eq("kind", target.kind)
    .is("archived_at", null);

  siblingsQuery =
    target.parent_id === null
      ? siblingsQuery.is("parent_id", null)
      : siblingsQuery.eq("parent_id", target.parent_id);

  const { data: siblings, error: siblingsError } = await siblingsQuery.order(
    "sort_order",
    { ascending: true },
  );

  if (siblingsError) throw siblingsError;
  if (!siblings) return;

  const index = siblings.findIndex((s) => s.id === categoryId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= siblings.length) {
    return;
  }

  const current = siblings[index];
  const swapWith = siblings[swapIndex];

  const [firstUpdate, secondUpdate] = await Promise.all([
    supabase
      .from("categories")
      .update({ sort_order: swapWith.sort_order })
      .eq("id", current.id)
      .filter(...scopeFilter(scope)),
    supabase
      .from("categories")
      .update({ sort_order: current.sort_order })
      .eq("id", swapWith.id)
      .filter(...scopeFilter(scope)),
  ]);

  if (firstUpdate.error) throw firstUpdate.error;
  if (secondUpdate.error) throw secondUpdate.error;
}
