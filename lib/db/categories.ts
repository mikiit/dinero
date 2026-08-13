import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { seedDefaultCategories } from "./seed-categories";

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
  userId: string,
): Promise<Category[]> {
  const { count, error: countError } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) throw countError;

  if (count === 0) {
    await seedDefaultCategories(supabase, userId);
  }

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(toCategory);
}

export async function createCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateCategoryInput,
): Promise<void> {
  const { error } = await supabase.from("categories").insert({
    user_id: userId,
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
  userId: string,
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
    .eq("user_id", userId);

  if (error) throw error;
}

export async function archiveCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
): Promise<void> {
  const archivedAt = new Date().toISOString();

  const { error } = await supabase
    .from("categories")
    .update({ archived_at: archivedAt })
    .eq("id", categoryId)
    .eq("user_id", userId);

  if (error) throw error;

  // Archiving a parent takes its children with it. Otherwise an active
  // child of an archived parent would still pass the "not archived" filter
  // in listCategories but have no top-level parent to be nested under, so
  // it would silently stop rendering anywhere despite still being active.
  const { error: childrenError } = await supabase
    .from("categories")
    .update({ archived_at: archivedAt })
    .eq("parent_id", categoryId)
    .eq("user_id", userId)
    .is("archived_at", null);

  if (childrenError) throw childrenError;
}

/**
 * Swaps sort_order with the adjacent sibling (same parent_id, same kind)
 * in the given direction. Siblings are the set a category is reordered
 * within - moving "up"/"down" only makes sense relative to them.
 */
export async function moveCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
  direction: "up" | "down",
): Promise<void> {
  const { data: target, error: targetError } = await supabase
    .from("categories")
    .select("id, kind, parent_id, sort_order")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .single();

  if (targetError) throw targetError;

  let siblingsQuery = supabase
    .from("categories")
    .select("id, sort_order")
    .eq("user_id", userId)
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
      .eq("user_id", userId),
    supabase
      .from("categories")
      .update({ sort_order: current.sort_order })
      .eq("id", swapWith.id)
      .eq("user_id", userId),
  ]);

  if (firstUpdate.error) throw firstUpdate.error;
  if (secondUpdate.error) throw secondUpdate.error;
}
