"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  archiveCategory,
  createCategory,
  moveCategory,
  updateCategory,
  type CategoryKind,
} from "@/lib/db/categories";

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: "error", error: "Not signed in." };
    }

    await createCategory(supabase, user.id, {
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: "error", error: "Not signed in." };
    }

    const categoryId = formData.get("categoryId");
    if (typeof categoryId !== "string" || categoryId === "") {
      throw new Error("Missing category id.");
    }

    await updateCategory(supabase, user.id, categoryId, {
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

export async function archiveCategoryAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const categoryId = formData.get("categoryId");
  if (typeof categoryId !== "string" || categoryId === "") return;

  await archiveCategory(supabase, user.id, categoryId);
  revalidatePath("/categories");
}

export async function moveCategoryAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const categoryId = formData.get("categoryId");
  const direction = formData.get("direction");
  if (typeof categoryId !== "string" || categoryId === "") return;
  if (direction !== "up" && direction !== "down") return;

  await moveCategory(supabase, user.id, categoryId, direction);
  revalidatePath("/categories");
}
