// A "scope" is which ledger a request works in: the user's personal one or
// one of the shared spaces they belong to (see the shared_spaces migration).
// Every data helper takes a Scope instead of a bare user id, so it is
// impossible to read or write without having said which ledger is meant.

export type SpaceRole = "owner" | "editor" | "viewer";

export type Scope = {
  /** Who is acting. For a space row this is recorded as its creator. */
  userId: string;
  /** The shared space, or null for the user's personal ledger. */
  spaceId: string | null;
};

export function personalScope(userId: string): Scope {
  return { userId, spaceId: null };
}

/**
 * Arguments for `query.filter(...)` restricting rows to one ledger:
 * personal -> `space_id IS NULL`, space -> `space_id = <id>`.
 *
 * Personal needs no extra user_id condition: row-level security already
 * limits `space_id IS NULL` rows to the caller's own. The space case needs
 * none either - RLS only shows a space's rows to its members.
 */
export function scopeFilter(scope: Scope): readonly [string, "eq" | "is", string | null] {
  return scope.spaceId
    ? (["space_id", "eq", scope.spaceId] as const)
    : (["space_id", "is", null] as const);
}

/** The ownership columns to write on every INSERT in this scope. */
export function scopeColumns(scope: Scope): { user_id: string; space_id: string | null } {
  return { user_id: scope.userId, space_id: scope.spaceId };
}

/** The folder a ledger's receipt photos live in: a space's own id (so every
 * member can reach them), or the user's id for personal ones. */
export function receiptOwnerKey(scope: Scope): string {
  return scope.spaceId ?? scope.userId;
}

/** Owners and editors may write; viewers may only read. Personal ledgers
 * have no role and are always writable by their owner. */
export function canWrite(role: SpaceRole | null): boolean {
  return role !== "viewer";
}

export const SPACE_COOKIE = "dinero-space";
