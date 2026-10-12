"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getContext } from "@/lib/context";
import { seedDefaultCategories } from "@/lib/db/seed-categories";
import { SPACE_COOKIE } from "@/lib/scope";

export type SpaceActionResult = { error?: string };

const COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function setActiveSpace(spaceId: string | null) {
  const store = await cookies();
  if (spaceId) store.set(SPACE_COOKIE, spaceId, COOKIE_OPTIONS);
  else store.delete(SPACE_COOKIE);
}

/** A friendly message for the database's own refusals. */
function friendly(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : (err as { message?: string })?.message;
  if (!message) return fallback;
  if (/row-level security|permission denied/i.test(message)) {
    return "You don't have permission to do that in this space.";
  }
  if (/at least one owner/i.test(message)) {
    return "A space needs at least one owner. Make someone else an owner first.";
  }
  return message;
}

/** Switches the ledger every page and action works in. null = personal. */
export async function switchSpaceAction(
  spaceId: string | null,
): Promise<SpaceActionResult> {
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };

  // Only a space the user really belongs to can become active.
  if (spaceId !== null && !ctx.spaces.some((s) => s.id === spaceId)) {
    return { error: "You are not a member of that space." };
  }
  await setActiveSpace(spaceId);
  revalidatePath("/", "layout");
  return {};
}

export async function createSpaceAction(
  name: string,
): Promise<SpaceActionResult & { spaceId?: string }> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return { error: "Give the space a name (up to 80 characters)." };
  }
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };

  const { data, error } = await ctx.supabase.rpc("create_space", { space_name: trimmed });
  if (error || !data) return { error: friendly(error, "Could not create the space.") };

  // A new ledger starts with the same default categories everyone gets.
  try {
    await seedDefaultCategories(ctx.supabase, { userId: ctx.user.id, spaceId: data });
  } catch (err) {
    console.error("spaces: could not seed default categories", err);
  }

  await setActiveSpace(data);
  revalidatePath("/", "layout");
  return { spaceId: data };
}

export async function createInviteAction(
  spaceId: string,
  role: "editor" | "viewer",
  validHours: number,
  uses: number,
): Promise<SpaceActionResult & { token?: string }> {
  if (!UUID.test(spaceId)) return { error: "Invalid space." };
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };

  const { data, error } = await ctx.supabase.rpc("create_space_invite", {
    sid: spaceId,
    invite_role: role,
    valid_hours: validHours,
    uses,
  });
  if (error || !data) return { error: friendly(error, "Could not create the invite.") };
  revalidatePath("/spaces");
  return { token: data };
}

export async function revokeInviteAction(inviteId: string): Promise<SpaceActionResult> {
  if (!UUID.test(inviteId)) return { error: "Invalid invite." };
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };

  const { error } = await ctx.supabase
    .from("space_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId);
  if (error) return { error: friendly(error, "Could not revoke the invite.") };
  revalidatePath("/spaces");
  return {};
}

export async function acceptInviteAction(
  token: string,
): Promise<SpaceActionResult & { spaceId?: string }> {
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };

  const { data, error } = await ctx.supabase.rpc("accept_space_invite", {
    invite_token: token.trim(),
  });
  if (error || !data) return { error: friendly(error, "This invite is not valid.") };

  await setActiveSpace(data);
  revalidatePath("/", "layout");
  return { spaceId: data };
}

export async function setMemberRoleAction(
  spaceId: string,
  userId: string,
  role: "owner" | "editor" | "viewer",
): Promise<SpaceActionResult> {
  if (!UUID.test(spaceId) || !UUID.test(userId)) return { error: "Invalid request." };
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };

  const { data, error } = await ctx.supabase
    .from("space_members")
    .update({ role })
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: friendly(error, "Could not change the role.") };
  // A blocked UPDATE is not an error to the database, just zero rows.
  if (!data || data.length === 0) {
    return { error: "You don't have permission to change roles in this space." };
  }
  revalidatePath("/", "layout");
  return {};
}

/** Remove someone from a space (owners), or leave it yourself. */
export async function removeMemberAction(
  spaceId: string,
  userId: string,
): Promise<SpaceActionResult> {
  if (!UUID.test(spaceId) || !UUID.test(userId)) return { error: "Invalid request." };
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };

  const { data, error } = await ctx.supabase
    .from("space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: friendly(error, "Could not remove the member.") };
  if (!data || data.length === 0) {
    return { error: "You don't have permission to remove that member." };
  }

  // Leaving the space you're looking at: fall back to the personal ledger.
  if (userId === ctx.user.id && ctx.scope.spaceId === spaceId) {
    await setActiveSpace(null);
  }
  revalidatePath("/", "layout");
  return {};
}

export async function renameSpaceAction(
  spaceId: string,
  name: string,
): Promise<SpaceActionResult> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return { error: "Give the space a name (up to 80 characters)." };
  }
  if (!UUID.test(spaceId)) return { error: "Invalid space." };
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };

  const { data, error } = await ctx.supabase
    .from("spaces")
    .update({ name: trimmed })
    .eq("id", spaceId)
    .select("id");
  if (error) return { error: friendly(error, "Could not rename the space.") };
  if (!data || data.length === 0) return { error: "Only an owner can rename a space." };
  revalidatePath("/", "layout");
  return {};
}

/** Soft delete: the space and everything in it disappear for all members. */
export async function deleteSpaceAction(spaceId: string): Promise<SpaceActionResult> {
  if (!UUID.test(spaceId)) return { error: "Invalid space." };
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };

  const { data, error } = await ctx.supabase
    .from("spaces")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", spaceId)
    .select("id");
  if (error) return { error: friendly(error, "Could not delete the space.") };
  if (!data || data.length === 0) return { error: "Only an owner can delete a space." };

  if (ctx.scope.spaceId === spaceId) await setActiveSpace(null);
  revalidatePath("/", "layout");
  return {};
}
