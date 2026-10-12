"use server";

import { revalidatePath } from "next/cache";
import {
  archiveCategory,
  restoreCategory,
  createCategory,
  moveCategory,
  updateCategory,
  type CategoryKind,
} from "@/lib/db/categories";
import { requireWriteContext } from "@/lib/context";

export type CategoryFormState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success" };

const CATEGORY_KINDS: readonly CategoryKind[] = ["expense", "income"];

function parseKind(value: FormDataEntryValue | null): CategoryKind {
  if (typeof value === "string" && (CATEGORY_KINDS as string[]).includes(value)) {
    return value as CategoryKind;
  }
  throw new Error(`Invalid category kind: ${String(value)}`);
}

function parseRequiredName(value: FormDataEntryValue | null): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name === "") {
    throw new Error("Name is required.");
  }
  return name;
}

function parseOptionalParentId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value === "" || value === "none") {
    return null;
  }
  return value;
}

function parseOptionalText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim();
}

export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) {
      return { status: "error", error: gate.error };
    }
    const { supabase, scope } = gate.ctx;

    await createCategory(supabase, scope, {
      name: parseRequiredName(formData.get("name")),
      kind: parseKind(formData.get("kind")),
      parentId: parseOptionalParentId(formData.get("parentId")),
      color: parseOptionalText(formData.get("color")),
      icon: parseOptionalText(formData.get("icon")),
    });
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Failed to create category.",
    };
  }

  revalidatePath("/categories");
  return { status: "success" };
}

export async function updateCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) {
      return { status: "error", error: gate.error };
    }
    const { supabase, scope } = gate.ctx;

    const categoryId = formData.get("categoryId");
    if (typeof categoryId !== "string" || categoryId === "") {
      throw new Error("Missing category id.");
    }

    await updateCategory(supabase, scope, categoryId, {
      name: parseRequiredName(formData.get("name")),
      kind: parseKind(formData.get("kind")),
      parentId: parseOptionalParentId(formData.get("parentId")),
      color: parseOptionalText(formData.get("color")),
      icon: parseOptionalText(formData.get("icon")),
    });
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Failed to update category.",
    };
  }

  revalidatePath("/categories");
  return { status: "success" };
}

export type ArchiveCategoryResult = { error?: string; archivedAt?: string };

export async function archiveCategoryAction(
  categoryId: string,
): Promise<ArchiveCategoryResult> {
  const gate = await requireWriteContext();
  if (!gate.ctx) return { error: gate.error };
  const { supabase, scope } = gate.ctx;
  if (!categoryId) return { error: "Missing category." };

  try {
    const archivedAt = await archiveCategory(supabase, scope, categoryId);
    revalidatePath("/", "layout");
    return { archivedAt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not archive." };
  }
}

/** Undo for archiveCategoryAction; `archivedAt` is what it returned. */
export async function restoreCategoryAction(
  categoryId: string,
  archivedAt: string,
): Promise<{ error?: string }> {
  const gate = await requireWriteContext();
  if (!gate.ctx) return { error: gate.error };
  const { supabase, scope } = gate.ctx;
  if (!categoryId || !archivedAt) return { error: "Missing details." };

  try {
    await restoreCategory(supabase, scope, categoryId, archivedAt);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not restore." };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function moveCategoryAction(formData: FormData): Promise<void> {
  const gate = await requireWriteContext();
  if (!gate.ctx) return;
  const { supabase, scope } = gate.ctx;

  const categoryId = formData.get("categoryId");
  const direction = formData.get("direction");
  if (typeof categoryId !== "string" || categoryId === "") return;
  if (direction !== "up" && direction !== "down") return;

  await moveCategory(supabase, scope, categoryId, direction);
  revalidatePath("/categories");
}
