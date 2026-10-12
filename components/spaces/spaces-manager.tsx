"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createInviteAction,
  createSpaceAction,
  deleteSpaceAction,
  removeMemberAction,
  renameSpaceAction,
  revokeInviteAction,
  setMemberRoleAction,
  switchSpaceAction,
  type SpaceActionResult,
} from "@/app/spaces/actions";
import { announceLedgerChange } from "@/components/spaces/ledger-provider";
import type { SpaceRole } from "@/lib/scope";

export type MemberItem = {
  user_id: string;
  role: SpaceRole;
  email: string;
  is_you: boolean;
};

export type InviteItem = {
  id: string;
  role: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
};

export type SpaceDetail = {
  id: string;
  name: string;
  role: SpaceRole;
  members: MemberItem[];
  invites: InviteItem[];
};

const ROLE_LABEL: Record<SpaceRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_HELP: Record<SpaceRole, string> = {
  owner: "Manages members and can delete the space",
  editor: "Adds and edits accounts, transactions, budgets",
  viewer: "Can only look",
};

/** Runs an action, shows its error, refreshes on success. */
function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<SpaceActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }
  return { run, error, isPending, setError };
}

function CreateSpace() {
  const [name, setName] = useState("");
  const { run, error, isPending } = useRun();

  return (
    <form
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          async () => {
            const result = await createSpaceAction(name);
            if (!result.error) {
              announceLedgerChange();
              // Full load on purpose: nothing from the previous ledger may survive in client state.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/";
            }
            return result;
          },
          () => setName(""),
        );
      }}
    >
      <Label htmlFor="new-space">New shared space</Label>
      <p className="text-xs text-muted-foreground">
        A separate ledger you share with other people: its own accounts,
        categories, budgets and transactions. Your personal data is not part
        of it.
      </p>
      <div className="flex gap-2">
        <Input
          id="new-space"
          placeholder="e.g. Household"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={isPending || name.trim() === ""}>
          Create
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

function InviteSection({ space }: { space: SpaceDetail }) {
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [days, setDays] = useState(7);
  const [uses, setUses] = useState(1);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { run, error, isPending } = useRun();

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is selectable in the box below.
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Invite someone</h4>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
            className="block h-8 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Valid for
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="block h-8 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          People
          <select
            value={uses}
            onChange={(e) => setUses(Number(e.target.value))}
            className="block h-8 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            <option value={1}>1 person</option>
            <option value={5}>Up to 5</option>
          </select>
        </label>
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await createInviteAction(space.id, role, days * 24, uses);
              if (result.token) {
                setLink(`${window.location.origin}/join/${result.token}`);
              }
              return result;
            })
          }
        >
          Create link
        </Button>
      </div>

      {link && (
        <div className="space-y-1.5 rounded-md bg-muted p-2">
          <p className="text-xs text-muted-foreground">
            Send this link. It is shown only now; whoever opens it needs a
            real account to join as {role === "editor" ? "an editor" : "a viewer"}.
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
              aria-label="Invite link"
            />
            <Button variant="outline" size="sm" onClick={() => copy(link)}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      {space.invites.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Open invites</p>
          <ul className="divide-y rounded-md border text-sm">
            {space.invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-2 p-2">
                <span className="min-w-0 text-xs">
                  {ROLE_LABEL[invite.role as SpaceRole]} · used {invite.used_count}/
                  {invite.max_uses} · until{" "}
                  {format(parseISO(invite.expires_at), "d MMM yyyy")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => run(() => revokeInviteAction(invite.id))}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function MemberRow({
  space,
  member,
  isOwner,
  run,
  busy,
}: {
  space: SpaceDetail;
  member: MemberItem;
  isOwner: boolean;
  run: ReturnType<typeof useRun>["run"];
  busy: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-2">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {member.email}
          {member.is_you && <span className="text-muted-foreground"> (you)</span>}
        </p>
        {!isOwner && (
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[member.role]}</p>
        )}
      </div>
      {isOwner && (
        <div className="flex items-center gap-2">
          <select
            aria-label={`Role of ${member.email}`}
            value={member.role}
            disabled={busy}
            onChange={(e) =>
              run(() => setMemberRoleAction(space.id, member.user_id, e.target.value as SpaceRole))
            }
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {(["owner", "editor", "viewer"] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {!member.is_you && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => run(() => removeMemberAction(space.id, member.user_id))}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function SpaceCard({ space, active }: { space: SpaceDetail; active: boolean }) {
  const { run, error, isPending } = useRun();
  const [name, setName] = useState(space.name);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  const isOwner = space.role === "owner";
  const me = space.members.find((m) => m.is_you);

  return (
    <section className="space-y-4 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-medium">{space.name}</h3>
          <p className="text-xs text-muted-foreground">
            You are {space.role === "editor" ? "an" : "a"} {ROLE_LABEL[space.role].toLowerCase()} ·{" "}
            {ROLE_HELP[space.role]}
          </p>
        </div>
        {active ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs">Open now</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await switchSpaceAction(space.id);
                if (!result.error) {
                  announceLedgerChange();
                  // Full load on purpose: nothing from the previous ledger may survive in client state.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = "/";
                }
                return result;
              })
            }
          >
            Open
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <h4 className="text-sm font-medium">Members</h4>
        <ul className="divide-y rounded-md border">
          {space.members.map((m) => (
            <MemberRow
              key={m.user_id}
              space={space}
              member={m}
              isOwner={isOwner}
              run={run}
              busy={isPending}
            />
          ))}
        </ul>
      </div>

      {isOwner && <InviteSection space={space} />}

      {isOwner && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => renameSpaceAction(space.id, name));
          }}
        >
          <Input
            aria-label="Space name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={isPending || name.trim() === "" || name.trim() === space.name}
          >
            Rename
          </Button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {confirm === "leave" ? (
          <>
            <span className="text-xs text-muted-foreground">
              You will lose access to everything in this space.
            </span>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending || !me}
              onClick={() =>
                run(
                  async () => {
                    const result = await removeMemberAction(space.id, me!.user_id);
                    if (!result.error) announceLedgerChange();
                    return result;
                  },
                  () => window.location.reload(),
                )
              }
            >
              Leave space
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
              Stay
            </Button>
          </>
        ) : confirm === "delete" ? (
          <>
            <span className="text-xs text-muted-foreground">
              This removes the space and ALL its data for every member.
            </span>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() =>
                run(
                  async () => {
                    const result = await deleteSpaceAction(space.id);
                    if (!result.error) announceLedgerChange();
                    return result;
                  },
                  () => window.location.reload(),
                )
              }
            >
              Delete space
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirm("leave")}>
              Leave
            </Button>
            {isOwner && (
              <Button variant="ghost" size="sm" onClick={() => setConfirm("delete")}>
                Delete space
              </Button>
            )}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

export function SpacesManager({
  spaces,
  activeSpaceId,
}: {
  spaces: SpaceDetail[];
  activeSpaceId: string | null;
}) {
  return (
    <div className="space-y-4">
      <CreateSpace />
      {spaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You are not in any shared space yet. Create one above, or open an
          invite link someone sent you.
        </p>
      ) : (
        spaces.map((space) => (
          <SpaceCard key={space.id} space={space} active={space.id === activeSpaceId} />
        ))
      )}
    </div>
  );
}
