import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { signInWithPassword } from "@/lib/auth/sign-in";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";

// Live test of shared spaces (SPEC.md Phase 4): roles, ledger scope, invites.
// Needs migration 20261012190000_shared_spaces.sql applied to the live
// project. Four real (email) users:
//   owner O, editor E, viewer V - members of one space; outsider X - not.
// The question for every case is the same: who can see it, who can change
// it - and each "cannot" is proven by reading the database back as admin,
// because a blocked UPDATE/DELETE returns no error, just zero rows.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

type Db = SupabaseClient<Database>;

describe.skipIf(!hasCredentials)("shared spaces (live, SPEC.md P4)", () => {
  let admin: Db;
  let O: Db, E: Db, V: Db, X: Db;
  let uO: string, uE: string, uV: string, uX: string;
  let space: string;
  let spaceAccount: string, spaceCategory: string, spaceTx: string, spaceBudget: string, spaceRule: string;
  let personalAccountO: string, personalCategoryE: string, personalAccountE: string;
  const userIds: string[] = [];
  const stamp = Date.now();
  const PW = "spaces-test-pw-1";
  const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

  async function user(tag: string): Promise<{ client: Db; id: string }> {
    const email = `sp-${tag}-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PW,
      email_confirm: true,
    });
    if (error || !data.user) throw error;
    userIds.push(data.user.id);
    const client = createClient<Database>(url!, anonKey!);
    await signInWithPassword(client, email, PW);
    return { client, id: data.user.id };
  }

  async function inviteAndJoin(inviter: Db, joiner: Db, role: "editor" | "viewer") {
    const token = await inviter.rpc("create_space_invite", { sid: space, invite_role: role });
    if (token.error) throw token.error;
    const joined = await joiner.rpc("accept_space_invite", { invite_token: token.data! });
    if (joined.error) throw joined.error;
  }

  const count = async (client: Db, table: "accounts" | "categories" | "transactions" | "budgets" | "recurring_rules", id: string) => {
    const { data, error } = await client.from(table).select("id").eq("id", id);
    if (error) throw error;
    return data.length;
  };

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    ({ client: O, id: uO } = await user("owner"));
    ({ client: E, id: uE } = await user("editor"));
    ({ client: V, id: uV } = await user("viewer"));
    ({ client: X, id: uX } = await user("outsider"));

    const created = await O.rpc("create_space", { space_name: "Household" });
    if (created.error) throw created.error;
    space = created.data!;
    await inviteAndJoin(O, E, "editor");
    await inviteAndJoin(O, V, "viewer");

    const mk = async <T,>(
      p: PromiseLike<{ data: T; error: unknown }>,
    ): Promise<NonNullable<T>> => {
      const { data, error } = await p;
      if (error || !data) throw error ?? new Error("seed insert returned no row");
      return data as NonNullable<T>;
    };

    spaceAccount = (await mk(O.from("accounts").insert({ user_id: uO, space_id: space, name: "Joint", type: "debit", opening_balance: 100000 }).select("id").single())).id;
    spaceCategory = (await mk(O.from("categories").insert({ user_id: uO, space_id: space, name: "Groceries", kind: "expense" }).select("id").single())).id;
    spaceTx = (await mk(O.from("transactions").insert({ user_id: uO, space_id: space, type: "expense", account_id: spaceAccount, category_id: spaceCategory, amount: 1500, currency: "RSD", occurred_on: "2026-10-12", note: "by owner" }).select("id").single())).id;
    spaceBudget = (await mk(O.from("budgets").insert({ user_id: uO, space_id: space, category_id: spaceCategory, period_month: "2026-10-01", amount: 50000 }).select("id").single())).id;
    spaceRule = (await mk(O.from("recurring_rules").insert({ user_id: uO, space_id: space, template: { type: "expense", accountId: spaceAccount, amount: "100" }, frequency: "monthly", next_run_on: "2026-11-01" }).select("id").single())).id;

    personalAccountO = (await mk(O.from("accounts").insert({ user_id: uO, name: "O personal", type: "cash" }).select("id").single())).id;
    personalAccountE = (await mk(E.from("accounts").insert({ user_id: uE, name: "E personal", type: "cash" }).select("id").single())).id;
    personalCategoryE = (await mk(E.from("categories").insert({ user_id: uE, name: "E personal cat", kind: "expense" }).select("id").single())).id;
  }, 120000);

  afterAll(async () => {
    // Data first (it references the space), then the space (cascades members
    // and invites), then the users.
    for (const t of ["transactions", "budgets", "recurring_rules", "categories", "accounts"] as const) {
      await admin.from(t).delete().eq("space_id", space ?? "00000000-0000-0000-0000-000000000000");
      for (const id of userIds) await admin.from(t).delete().eq("user_id", id);
    }
    if (space) {
      const objs = await admin.storage.from("receipts").list(space);
      if (objs.data?.length) await admin.storage.from("receipts").remove(objs.data.map((o) => `${space}/${o.name}`));
      await admin.from("spaces").delete().eq("id", space);
    }
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 90000);

  // ------------------------------------------------------------------ visibility
  it("every member sees the space's rows in every table; an outsider sees none", async () => {
    const rows = { accounts: spaceAccount, categories: spaceCategory, transactions: spaceTx, budgets: spaceBudget, recurring_rules: spaceRule } as const;
    for (const [table, id] of Object.entries(rows)) {
      for (const [who, c] of [["owner", O], ["editor", E], ["viewer", V]] as const) {
        expect(await count(c, table as keyof typeof rows, id), `${who} sees ${table}`).toBe(1);
      }
      expect(await count(X, table as keyof typeof rows, id), `outsider sees ${table}`).toBe(0);
    }
  }, 60000);

  it("personal data stays private even from fellow space members", async () => {
    expect(await count(E, "accounts", personalAccountO)).toBe(0);
    expect(await count(O, "accounts", personalAccountE)).toBe(0);
    expect(await count(V, "accounts", personalAccountE)).toBe(0);
    expect(await count(O, "categories", personalCategoryE)).toBe(0);
  }, 60000);

  // ----------------------------------------------------------------- write rules
  it("an editor can add and fix space data, including a partner's rows", async () => {
    const add = await E.from("transactions").insert({ user_id: uE, space_id: space, type: "expense", account_id: spaceAccount, category_id: spaceCategory, amount: 700, currency: "RSD", occurred_on: "2026-10-12", note: "by editor" }).select("id").single();
    expect(add.error).toBeNull();

    const fix = await E.from("transactions").update({ note: "fixed by editor" }).eq("id", spaceTx).select("id");
    expect(fix.data).toHaveLength(1);
    expect((await admin.from("transactions").select("note").eq("id", spaceTx).single()).data?.note).toBe("fixed by editor");

    const acc = await E.from("accounts").insert({ user_id: uE, space_id: space, name: "Editor-made", type: "cash" });
    expect(acc.error).toBeNull();
  }, 60000);

  it("a viewer can read but cannot create, change or delete anything", async () => {
    const ins = await V.from("transactions").insert({ user_id: uV, space_id: space, type: "expense", account_id: spaceAccount, amount: 1, currency: "RSD", occurred_on: "2026-10-12" });
    expect(ins.error).not.toBeNull();
    const insAcc = await V.from("accounts").insert({ user_id: uV, space_id: space, name: "nope", type: "cash" });
    expect(insAcc.error).not.toBeNull();

    const upd = await V.from("transactions").update({ amount: 1, note: "viewer was here" }).eq("id", spaceTx).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const del = await V.from("transactions").delete().eq("id", spaceTx).select("id");
    expect(del.data ?? []).toHaveLength(0);
    await V.from("budgets").update({ amount: 1 }).eq("id", spaceBudget);
    await V.from("recurring_rules").update({ auto_post: true }).eq("id", spaceRule);
    await V.from("categories").delete().eq("id", spaceCategory);

    // Read back as admin: nothing moved.
    const tx = await admin.from("transactions").select("amount, note").eq("id", spaceTx).single();
    expect(tx.data?.amount).toBe(1500);
    expect(tx.data?.note).not.toBe("viewer was here");
    expect((await admin.from("budgets").select("amount").eq("id", spaceBudget).single()).data?.amount).toBe(50000);
    expect((await admin.from("recurring_rules").select("auto_post").eq("id", spaceRule).single()).data?.auto_post).toBe(false);
    expect((await admin.from("categories").select("id").eq("id", spaceCategory)).data).toHaveLength(1);
  }, 60000);

  it("an outsider can neither write into nor change a space", async () => {
    const ins = await X.from("transactions").insert({ user_id: uX, space_id: space, type: "expense", account_id: spaceAccount, amount: 1, currency: "RSD", occurred_on: "2026-10-12" });
    expect(ins.error).not.toBeNull();
    const upd = await X.from("transactions").update({ amount: 1 }).eq("id", spaceTx).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    expect((await admin.from("transactions").select("amount").eq("id", spaceTx).single()).data?.amount).toBe(1500);
  }, 60000);

  it("nobody can write as someone else, even an owner", async () => {
    const forged = await O.from("transactions").insert({ user_id: uE, space_id: space, type: "expense", account_id: spaceAccount, amount: 1, currency: "RSD", occurred_on: "2026-10-12" });
    expect(forged.error).not.toBeNull();
  }, 60000);

  // ------------------------------------------------------------- ledger scoping
  it("a row can only reference rows from its own ledger", async () => {
    // space transaction -> personal account
    const a = await E.from("transactions").insert({ user_id: uE, space_id: space, type: "expense", account_id: personalAccountE, amount: 1, currency: "RSD", occurred_on: "2026-10-12" });
    expect(a.error).not.toBeNull();
    // space transaction -> personal category
    const b = await E.from("transactions").insert({ user_id: uE, space_id: space, type: "expense", account_id: spaceAccount, category_id: personalCategoryE, amount: 1, currency: "RSD", occurred_on: "2026-10-12" });
    expect(b.error).not.toBeNull();
    // personal transaction -> space account
    const c = await E.from("transactions").insert({ user_id: uE, type: "expense", account_id: spaceAccount, amount: 1, currency: "RSD", occurred_on: "2026-10-12" });
    expect(c.error).not.toBeNull();
    // personal transaction -> space category
    const d = await E.from("transactions").insert({ user_id: uE, type: "expense", account_id: personalAccountE, category_id: spaceCategory, amount: 1, currency: "RSD", occurred_on: "2026-10-12" });
    expect(d.error).not.toBeNull();
    // budget in a space on a personal category
    const e = await E.from("budgets").insert({ user_id: uE, space_id: space, category_id: personalCategoryE, period_month: "2026-10-01", amount: 1 });
    expect(e.error).not.toBeNull();
    // sub-category whose parent lives in the other ledger
    const f = await E.from("categories").insert({ user_id: uE, space_id: space, name: "stray", kind: "expense", parent_id: personalCategoryE });
    expect(f.error).not.toBeNull();
  }, 60000);

  it("a row can never move to another ledger or change creator", async () => {
    const move = await E.from("transactions").update({ space_id: null }).eq("id", spaceTx);
    expect(move.error).not.toBeNull();
    const steal = await E.from("transactions").update({ user_id: uE }).eq("id", spaceTx);
    expect(steal.error).not.toBeNull();
    const pull = await E.from("accounts").update({ space_id: space }).eq("id", personalAccountE);
    expect(pull.error).not.toBeNull();
    const row = await admin.from("transactions").select("space_id, user_id").eq("id", spaceTx).single();
    expect(row.data).toEqual({ space_id: space, user_id: uO });
  }, 60000);

  it("budgets are unique per space+category+month, not per member", async () => {
    const dup = await E.from("budgets").insert({ user_id: uE, space_id: space, category_id: spaceCategory, period_month: "2026-10-01", amount: 99 });
    expect(dup.error).not.toBeNull(); // owner already set one for this month
    // ...but the same member can have a PERSONAL budget for a personal category
    const own = await E.from("budgets").insert({ user_id: uE, category_id: personalCategoryE, period_month: "2026-10-01", amount: 5 });
    expect(own.error).toBeNull();
  }, 60000);

  // ---------------------------------------------------------------------- views
  it("balances and monthly totals aggregate the whole space across members", async () => {
    // Joint opens at 1000.00; O spent 15.00, E spent 7.00 -> 100000 - 1500 - 700.
    const bal = await V.from("account_balances").select("balance, space_id, user_id").eq("account_id", spaceAccount).single();
    expect(bal.data?.balance).toBe(100000 - 1500 - 700);
    expect(bal.data?.space_id).toBe(space);

    const month = await V.from("monthly_summary").select("expense, income, user_id").eq("space_id", space).eq("month", "2026-10-01").single();
    expect(month.data?.expense).toBe(1500 + 700);
    expect(month.data?.user_id).toBeNull(); // a space's total isn't any one member's

    expect((await X.from("account_balances").select("balance").eq("account_id", spaceAccount)).data).toHaveLength(0);
    expect((await X.from("monthly_summary").select("expense").eq("space_id", space)).data).toHaveLength(0);
  }, 60000);

  // -------------------------------------------------------------------- members
  it("only owners manage members and invites", async () => {
    const eInvite = await E.rpc("create_space_invite", { sid: space, invite_role: "viewer" });
    expect(eInvite.error).not.toBeNull();
    const xInvite = await X.rpc("create_space_invite", { sid: space, invite_role: "viewer" });
    expect(xInvite.error).not.toBeNull();

    // An editor can't promote themselves, remove the owner, or touch roles.
    await E.from("space_members").update({ role: "owner" }).eq("space_id", space).eq("user_id", uE);
    await E.from("space_members").delete().eq("space_id", space).eq("user_id", uO);
    await E.from("space_members").delete().eq("space_id", space).eq("user_id", uV);
    const roles = await admin.from("space_members").select("user_id, role").eq("space_id", space);
    expect(Object.fromEntries(roles.data!.map((r) => [r.user_id, r.role]))).toEqual({
      [uO]: "owner",
      [uE]: "editor",
      [uV]: "viewer",
    });
  }, 60000);

  it("members can list who is in the space; outsiders get nothing", async () => {
    const list = await E.rpc("list_space_members", { sid: space });
    expect(list.error).toBeNull();
    expect(list.data!.map((m) => m.role)).toEqual(["owner", "editor", "viewer"]);
    expect(list.data!.find((m) => m.is_you)?.user_id).toBe(uE);
    expect(list.data!.every((m) => typeof m.email === "string" && m.email.includes("@"))).toBe(true);

    expect((await X.rpc("list_space_members", { sid: space })).data).toEqual([]);
  }, 60000);

  it("the last owner cannot leave or be demoted; with a second owner they can", async () => {
    const demote = await O.from("space_members").update({ role: "editor" }).eq("space_id", space).eq("user_id", uO);
    expect(demote.error).not.toBeNull();
    const leave = await O.from("space_members").delete().eq("space_id", space).eq("user_id", uO);
    expect(leave.error).not.toBeNull();

    // Promote E to owner; now O may step down.
    expect((await O.from("space_members").update({ role: "owner" }).eq("space_id", space).eq("user_id", uE)).error).toBeNull();
    expect((await O.from("space_members").update({ role: "editor" }).eq("space_id", space).eq("user_id", uO)).error).toBeNull();
    // ...and back, so later tests have the original shape.
    expect((await E.from("space_members").update({ role: "owner" }).eq("space_id", space).eq("user_id", uO)).error).toBeNull();
    expect((await O.from("space_members").update({ role: "editor" }).eq("space_id", space).eq("user_id", uE)).error).toBeNull();
  }, 60000);

  it("a member can leave a space and then sees none of it", async () => {
    const { client: Y, id: uY } = await user("leaver");
    await inviteAndJoin(O, Y, "viewer");
    expect(await count(Y, "accounts", spaceAccount)).toBe(1);
    expect((await Y.from("space_members").delete().eq("space_id", space).eq("user_id", uY)).error).toBeNull();
    expect(await count(Y, "accounts", spaceAccount)).toBe(0);
  }, 60000);

  // -------------------------------------------------------------------- invites
  it("an invite is single-use by default, stored hashed, and indistinguishable when bad", async () => {
    const { client: A, id: uA } = await user("invitee-a");
    const { client: B } = await user("invitee-b");

    const token = (await O.rpc("create_space_invite", { sid: space, invite_role: "viewer" })).data!;
    const row = await admin.from("space_invites").select("token_hash, used_count, max_uses").eq("space_id", space).order("created_at", { ascending: false }).limit(1).single();
    expect(row.data?.token_hash).not.toBe(token);
    expect(row.data?.token_hash).toMatch(/^[0-9a-f]{64}$/);

    expect((await A.rpc("accept_space_invite", { invite_token: token })).data).toBe(space);
    const second = await B.rpc("accept_space_invite", { invite_token: token });
    expect(second.error?.message).toBe("This invite is not valid.");
    expect(await count(B, "accounts", spaceAccount)).toBe(0);

    const garbage = await B.rpc("accept_space_invite", { invite_token: "definitely-not-a-token" });
    expect(garbage.error?.message).toBe("This invite is not valid."); // same words

    // The first user is a viewer, with exactly the invited role.
    expect((await admin.from("space_members").select("role").eq("space_id", space).eq("user_id", uA).single()).data?.role).toBe("viewer");
  }, 90000);

  it("expired and revoked invites are refused", async () => {
    const { client: A } = await user("late");
    const { client: B } = await user("revoked");

    const expired = (await O.rpc("create_space_invite", { sid: space, invite_role: "viewer" })).data!;
    await admin
      .from("space_invites")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("token_hash", hashOf(expired));
    expect((await A.rpc("accept_space_invite", { invite_token: expired })).error?.message).toBe(
      "This invite is not valid.",
    );

    const revoked = (await O.rpc("create_space_invite", { sid: space, invite_role: "viewer" })).data!;
    const revokedByOwner = await O.from("space_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashOf(revoked))
      .select("id");
    expect(revokedByOwner.data).toHaveLength(1);
    expect((await B.rpc("accept_space_invite", { invite_token: revoked })).error?.message).toBe(
      "This invite is not valid.",
    );
  }, 90000);

  it("a multi-use invite stops at its limit", async () => {
    const people = await Promise.all([user("multi-1"), user("multi-2"), user("multi-3")]);
    const token = (await O.rpc("create_space_invite", { sid: space, invite_role: "viewer", uses: 2 })).data!;
    expect((await people[0].client.rpc("accept_space_invite", { invite_token: token })).error).toBeNull();
    expect((await people[1].client.rpc("accept_space_invite", { invite_token: token })).error).toBeNull();
    expect((await people[2].client.rpc("accept_space_invite", { invite_token: token })).error?.message).toBe(
      "This invite is not valid.",
    );
  }, 90000);

  it("only owners can see or revoke invites, and viewers can't mint them", async () => {
    expect((await E.from("space_invites").select("id").eq("space_id", space)).data ?? []).toHaveLength(0);
    expect((await V.from("space_invites").select("id").eq("space_id", space)).data ?? []).toHaveLength(0);
    expect(((await O.from("space_invites").select("id").eq("space_id", space)).data ?? []).length).toBeGreaterThan(0);
  }, 60000);

  it("a role is never downgraded by re-using an invite, and joining twice is harmless", async () => {
    const token = (await O.rpc("create_space_invite", { sid: space, invite_role: "viewer" })).data!;
    const again = await E.rpc("accept_space_invite", { invite_token: token }); // E is already an editor
    expect(again.data).toBe(space);
    expect((await admin.from("space_members").select("role").eq("space_id", space).eq("user_id", uE).single()).data?.role).toBe("editor");
    const unused = await admin.from("space_invites").select("used_count").eq("space_id", space).order("created_at", { ascending: false }).limit(1).single();
    expect(unused.data?.used_count).toBe(0); // nothing was consumed
  }, 60000);

  it("temporary (anonymous) accounts can neither create a space nor accept an invite", async () => {
    const anon = createClient<Database>(url!, anonKey!);
    const signed = await signInAnonymouslyWithRetry(anon);
    expect(signed.error).toBeNull();
    const anonId = signed.data.user!.id;
    try {
      expect((await anon.rpc("create_space", { space_name: "nope" })).error).not.toBeNull();
      const token = (await O.rpc("create_space_invite", { sid: space, invite_role: "viewer" })).data!;
      expect((await anon.rpc("accept_space_invite", { invite_token: token })).error).not.toBeNull();
    } finally {
      await admin.auth.admin.deleteUser(anonId);
    }
  }, 90000);

  // --------------------------------------------------------------------- deleted
  it("receipt storage follows membership: members read, editors write, outsiders nothing", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const path = `${space}/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`;

    expect((await E.storage.from("receipts").upload(path, bytes, { contentType: "image/jpeg" })).error).toBeNull();
    expect((await V.storage.from("receipts").download(path)).error).toBeNull(); // viewer reads
    expect((await V.storage.from("receipts").upload(`${space}/${crypto.randomUUID()}/x.jpg`, bytes, { contentType: "image/jpeg" })).error).not.toBeNull();
    expect((await X.storage.from("receipts").download(path)).error).not.toBeNull();
    expect((await X.storage.from("receipts").upload(`${space}/${crypto.randomUUID()}/y.jpg`, bytes, { contentType: "image/jpeg" })).error).not.toBeNull();
    // A viewer cannot delete it; the owner can.
    await V.storage.from("receipts").remove([path]);
    expect((await O.storage.from("receipts").download(path)).error).toBeNull();
    await O.storage.from("receipts").remove([path]);
  }, 90000);

  it("a deleted space disappears for everyone, data included, and its invites die", async () => {
    // Minted while the space is alive, used only after it is deleted.
    const token = (await O.rpc("create_space_invite", { sid: space, invite_role: "viewer" })).data!;
    const { client: late } = await user("after-delete");

    const byEditor = await E.from("spaces").update({ deleted_at: new Date().toISOString() }).eq("id", space).select("id");
    expect(byEditor.data ?? []).toHaveLength(0); // an editor can't delete it

    const byOwner = await O.from("spaces").update({ deleted_at: new Date().toISOString() }).eq("id", space).select("id");
    expect(byOwner.data).toHaveLength(1);

    for (const c of [O, E, V]) {
      expect(await count(c, "accounts", spaceAccount)).toBe(0);
      expect(await count(c, "transactions", spaceTx)).toBe(0);
    }
    expect((await late.rpc("accept_space_invite", { invite_token: token })).error?.message).toBe(
      "This invite is not valid.",
    );

    // Restore so afterAll's cleanup sees the space the way it was.
    await admin.from("spaces").update({ deleted_at: null }).eq("id", space);
  }, 90000);
});
