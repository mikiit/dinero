import Link from "next/link";
import { getContext } from "@/lib/context";
import {
  SpacesManager,
  type InviteItem,
  type MemberItem,
  type SpaceDetail,
} from "@/components/spaces/spaces-manager";
import { buttonVariants } from "@/components/ui/button";
import type { SpaceRole } from "@/lib/scope";

export default async function SpacesPage() {
  const ctx = await getContext();

  if (!ctx) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted-foreground">
          Setting up your session — refresh in a moment.
        </p>
      </main>
    );
  }

  // A shared ledger tied to a throwaway browser session would be lost with
  // it; the database requires a real account, so say so up front.
  if (ctx.user.is_anonymous) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-4 lg:max-w-xl lg:p-8">
        <h1 className="font-heading text-xl font-medium">Shared spaces</h1>
        <p className="text-sm text-muted-foreground">
          Shared spaces need a real account, so they aren&apos;t lost with this
          browser and the people you share with can rely on them.
        </p>
        <Link href="/login?next=/spaces" className={buttonVariants({ size: "sm" })}>
          Create account or sign in
        </Link>
      </main>
    );
  }

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
