import { getContext } from "@/lib/context";
import {
  SpacesManager,
  type InviteItem,
  type MemberItem,
  type SpaceDetail,
} from "@/components/spaces/spaces-manager";
import type { SpaceRole } from "@/lib/scope";
import { redirect } from "next/navigation";

export default async function SpacesPage() {
  const ctx = await getContext();

  if (!ctx) redirect("/login");

  const now = new Date().toISOString();
  const spaces: SpaceDetail[] = await Promise.all(
    ctx.spaces.map(async (space) => {
      const { data: members } = await ctx.supabase.rpc("list_space_members", {
        sid: space.id,
      });

      let invites: InviteItem[] = [];
      if (space.role === "owner") {
        const { data } = await ctx.supabase
          .from("space_invites")
          .select("id, role, expires_at, max_uses, used_count")
          .eq("space_id", space.id)
          .is("revoked_at", null)
          .gt("expires_at", now)
          .order("created_at", { ascending: false });
        invites = (data ?? []).filter((i) => i.used_count < i.max_uses);
      }

      return {
        id: space.id,
        name: space.name,
        role: space.role,
        members: (members ?? []).map(
          (m): MemberItem => ({
            user_id: m.user_id,
            role: m.role as SpaceRole,
            email: m.email,
            is_you: m.is_you,
          }),
        ),
        invites,
      };
    }),
  );

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 lg:max-w-xl lg:p-8">
      <h1 className="font-heading text-xl font-medium">Shared spaces</h1>
      <SpacesManager spaces={spaces} activeSpaceId={ctx.scope.spaceId} />
    </main>
  );
}
