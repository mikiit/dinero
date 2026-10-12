import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  SPACE_COOKIE,
  canWrite,
  type Scope,
  type SpaceRole,
} from "@/lib/scope";

export type SpaceSummary = { id: string; name: string; role: SpaceRole };

export type AppContext = {
  supabase: SupabaseClient<Database>;
  user: User;
  /** The ledger this request works in. */
  scope: Scope;
  /** Role in the active space; null in the personal ledger. */
  role: SpaceRole | null;
  /** Every space the user belongs to (soft-deleted ones excluded). */
  spaces: SpaceSummary[];
  activeSpace: SpaceSummary | null;
  /** False for a viewer: the UI hides write controls; the database enforces it. */
  canWrite: boolean;
};

async function loadSpaces(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SpaceSummary[]> {
  // RLS already hides memberships of deleted spaces (space_role() is null).
  const { data: members, error } = await supabase
    .from("space_members")
    .select("space_id, role")
    .eq("user_id", userId);
  if (error) throw error;
  if (!members || members.length === 0) return [];

  const { data: spaces, error: spacesError } = await supabase
    .from("spaces")
    .select("id, name")
    .in(
      "id",
      members.map((m) => m.space_id),
    )
    .is("deleted_at", null);
  if (spacesError) throw spacesError;

  const roleById = new Map(members.map((m) => [m.space_id, m.role as SpaceRole]));
  return (spaces ?? [])
    .map((s) => ({ id: s.id, name: s.name, role: roleById.get(s.id)! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Who is acting and in which ledger, once per request (`cache`). The active
 * space comes from a cookie, but is only honoured while the user is still a
 * member - a stale or forged cookie falls back to the personal ledger
 * rather than ever naming a space the user can't see.
 *
 * Returns null when there is no session yet (proxy.ts creates one on the
 * next request).
 */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let spaces: SpaceSummary[] = [];
  try {
    spaces = await loadSpaces(supabase, user.id);
  } catch (err) {
    // Spaces are an add-on; failing to list them must not lock someone out
    // of their own personal ledger.
    console.error("spaces: could not load memberships", err);
  }

  const wanted = (await cookies()).get(SPACE_COOKIE)?.value;
  const activeSpace = spaces.find((s) => s.id === wanted) ?? null;
  const role = activeSpace?.role ?? null;

  return {
    supabase,
    user,
    scope: { userId: user.id, spaceId: activeSpace?.id ?? null },
    role,
    spaces,
    activeSpace,
    canWrite: canWrite(role),
  };
});

export const VIEW_ONLY_MESSAGE = "You have view-only access to this space.";

/**
 * For Server Actions that change data: the context, or a user-facing error.
 * Refusing a viewer here gives a clear message; the row-level security
 * policies are what actually stop them if this were ever bypassed.
 */
export async function requireWriteContext(): Promise<
  { ctx: AppContext; error?: undefined } | { ctx?: undefined; error: string }
> {
  const ctx = await getContext();
  if (!ctx) return { error: "Not signed in." };
  if (!ctx.canWrite) return { error: VIEW_ONLY_MESSAGE };
  return { ctx };
}
