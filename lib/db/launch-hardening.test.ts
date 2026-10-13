import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { signInWithPassword } from "@/lib/auth/sign-in";
import { RECEIPT_BUCKET } from "@/lib/receipts";
import { removeReceiptFolder } from "./receipts";
import { loadTestEnv } from "./test-env";

// Live test of 20261013120000: erasing an account, and throttling invites.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

type Db = SupabaseClient<Database>;

describe.skipIf(!hasCredentials)("launch hardening (live)", () => {
  let admin: Db;
  const userIds: string[] = [];
  const spaceIds: string[] = [];
  const stamp = Date.now();
  const PW = "hardening-test-pw-1";

  async function user(tag: string): Promise<{ client: Db; id: string }> {
    const email = `hd-${tag}-${stamp}@example.com`;
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

  async function space(owner: Db, name: string): Promise<string> {
    const { data, error } = await owner.rpc("create_space", { space_name: name });
    if (error || !data) throw error;
    spaceIds.push(data);
    return data;
  }

  const rows = async (table: "accounts" | "categories" | "transactions" | "budgets" | "recurring_rules", col: "user_id" | "space_id", id: string) => {
    // "user_id" means the PERSONAL ledger: what someone added to a shared
    // space carries their id too, but belongs to the space.
    let query = admin.from(table).select("id").eq(col, id);
    if (col === "user_id") query = query.is("space_id", null);
    const { data, error } = await query;
    if (error) throw error;
    return data.length;
  };

  beforeAll(() => {
    admin = createClient<Database>(url!, secretKey!);
  });

  afterAll(async () => {
    for (const id of spaceIds) {
      for (const t of ["transactions", "recurring_rules", "budgets"] as const) {
        await admin.from(t).delete().eq("space_id", id);
      }
      await admin.from("categories").delete().eq("space_id", id).not("parent_id", "is", null);
      await admin.from("categories").delete().eq("space_id", id);
      await admin.from("accounts").delete().eq("space_id", id);
      await admin.from("spaces").delete().eq("id", id);
    }
    for (const id of userIds) {
      for (const t of ["transactions", "recurring_rules", "budgets"] as const) {
        await admin.from(t).delete().eq("user_id", id);
      }
      await admin.from("categories").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("user_id", id);
      await admin.from("invite_attempts").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }, 120000);

  // ---- invites ------------------------------------------------------------

  it("throttles someone who keeps guessing invite tokens", async () => {
    const { client } = await user("guesser");
    for (let i = 0; i < 10; i++) {
      const res = await client.rpc("accept_space_invite", { invite_token: `guess-${i}` });
      expect(res.error).toBeNull();
      expect(res.data).toBeNull(); // refused, and recorded
    }
    const eleventh = await client.rpc("accept_space_invite", { invite_token: "guess-10" });
    expect(eleventh.error?.message).toMatch(/Too many attempts/);
  }, 90000);

  it("a locked-out person is refused even with a real invite, others are not affected", async () => {
    const { client: owner } = await user("inviter");
    const { client: locked } = await user("locked");
    const { client: fresh } = await user("fresh");
    const sid = await space(owner, "Invites");
    const token = (await owner.rpc("create_space_invite", { sid, invite_role: "viewer", uses: 5 })).data!;

    for (let i = 0; i < 10; i++) await locked.rpc("accept_space_invite", { invite_token: `nope-${i}` });
    expect((await locked.rpc("accept_space_invite", { invite_token: token })).error?.message).toMatch(
      /Too many attempts/,
    );
    expect((await fresh.rpc("accept_space_invite", { invite_token: token })).data).toBe(sid);
  }, 90000);

  it("caps how many invite links a space can have live at once", async () => {
    const { client: owner } = await user("capper");
    const sid = await space(owner, "Capped");
    for (let i = 0; i < 25; i++) {
      const made = await owner.rpc("create_space_invite", { sid, invite_role: "viewer" });
      expect(made.error).toBeNull();
    }
    const over = await owner.rpc("create_space_invite", { sid, invite_role: "viewer" });
    expect(over.error?.message).toMatch(/25 active invite links/);
  }, 120000);

  // ---- account deletion ---------------------------------------------------

  async function seedPersonal(client: Db, id: string) {
    const mk = async <T,>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> => {
      const { data, error } = await p;
      if (error || !data) throw error ?? new Error("insert returned nothing");
      return data as NonNullable<T>;
    };
    const acc = await mk(client.from("accounts").insert({ user_id: id, name: "Wallet", type: "cash", opening_balance: 1000 }).select("id").single());
    const parent = await mk(client.from("categories").insert({ user_id: id, name: "Food", kind: "expense" }).select("id").single());
    const child = await mk(client.from("categories").insert({ user_id: id, name: "Groceries", kind: "expense", parent_id: parent.id }).select("id").single());
    await mk(client.from("budgets").insert({ user_id: id, category_id: parent.id, period_month: "2026-10-01", amount: 5000 }).select("id").single());
    const rule = await mk(client.from("recurring_rules").insert({ user_id: id, template: { type: "expense", accountId: acc.id, amount: "100" }, frequency: "monthly", next_run_on: "2026-11-01" }).select("id").single());
    await mk(client.from("transactions").insert({ user_id: id, type: "expense", account_id: acc.id, category_id: child.id, amount: 250, currency: "RSD", occurred_on: "2026-10-10", recurring_id: rule.id }).select("id").single());
    return { acc: acc.id };
  }

  it("erases the personal ledger, a solo space, receipts and the login - and keeps others' data", async () => {
    const { client: gone, id: goneId } = await user("leaver");
    const { client: other, id: otherId } = await user("stayer");
    await seedPersonal(gone, goneId);
    await seedPersonal(other, otherId);

    // A space only the leaver is in, with data.
    const solo = await space(gone, "Solo");
    const soloAcc = (await gone.from("accounts").insert({ user_id: goneId, space_id: solo, name: "SoloAcc", type: "cash" }).select("id").single()).data!.id;
    await gone.from("categories").insert({ user_id: goneId, space_id: solo, name: "SoloCat", kind: "expense" });
    await gone.from("transactions").insert({ user_id: goneId, space_id: solo, type: "expense", account_id: soloAcc, amount: 5, currency: "RSD", occurred_on: "2026-10-10" });

    // A space the leaver merely belongs to (the other person owns it).
    const shared = await space(other, "Shared");
    const token = (await other.rpc("create_space_invite", { sid: shared, invite_role: "editor" })).data!;
    expect((await gone.rpc("accept_space_invite", { invite_token: token })).data).toBe(shared);
    const sharedAcc = (await other.from("accounts").insert({ user_id: otherId, space_id: shared, name: "Joint", type: "cash" }).select("id").single()).data!.id;
    await gone.from("transactions").insert({ user_id: goneId, space_id: shared, type: "expense", account_id: sharedAcc, amount: 7, currency: "RSD", occurred_on: "2026-10-10" });

    // Receipts in the personal folder.
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    for (const tx of ["tx-a", "tx-b"]) {
      const up = await gone.storage.from(RECEIPT_BUCKET).upload(`${goneId}/${tx}/r.png`, png);
      expect(up.error).toBeNull();
    }
    expect(await removeReceiptFolder(gone, goneId)).toBe(2);
    const left = await admin.storage.from(RECEIPT_BUCKET).list(goneId);
    expect(left.data ?? []).toHaveLength(0);

    const check = await gone.rpc("account_deletion_check");
    expect((check.data as { blocked_by: string | null }).blocked_by).toBeNull();
    expect((check.data as { purge_space_ids: string[] }).purge_space_ids).toEqual([solo]);

    const del = await gone.rpc("delete_my_account");
    expect(del.error).toBeNull();

    // Gone: personal rows, the solo space and its data, the membership, the login.
    for (const t of ["accounts", "categories", "transactions", "budgets", "recurring_rules"] as const) {
      expect(await rows(t, "user_id", goneId), `${t} of the leaver`).toBe(0) ;
    }
    expect(await rows("accounts", "space_id", solo)).toBe(0);
    expect((await admin.from("spaces").select("id").eq("id", solo)).data).toHaveLength(0);
    expect((await admin.from("space_members").select("user_id").eq("user_id", goneId)).data).toHaveLength(0);
    expect((await admin.auth.admin.getUserById(goneId)).data.user).toBeNull();

    // Kept: the other person's personal data, and the shared space with the
    // row the leaver added to it.
    expect(await rows("transactions", "user_id", otherId)).toBe(1);
    expect(await rows("accounts", "space_id", shared)).toBe(1);
    expect((await admin.from("transactions").select("id").eq("space_id", shared)).data).toHaveLength(1);
  }, 180000);

  it("refuses to delete while the only owner of a space others use", async () => {
    const { client: owner, id: ownerId } = await user("owner-blocked");
    const { client: member } = await user("member");
    const sid = await space(owner, "Family");
    const token = (await owner.rpc("create_space_invite", { sid, invite_role: "viewer" })).data!;
    await member.rpc("accept_space_invite", { invite_token: token });

    const check = await owner.rpc("account_deletion_check");
    expect((check.data as { blocked_by: string | null }).blocked_by).toBe("Family");

    const del = await owner.rpc("delete_my_account");
    expect(del.error?.message).toMatch(/shared space with other people \(Family\)/);
    expect((await admin.auth.admin.getUserById(ownerId)).data.user).not.toBeNull();
    expect((await admin.from("spaces").select("id").eq("id", sid)).data).toHaveLength(1);
  }, 120000);

  it("lets an owner delete once they hand the space over", async () => {
    const { client: owner, id: ownerId } = await user("owner-handover");
    const { client: member, id: memberId } = await user("heir");
    const sid = await space(owner, "Handover");
    const token = (await owner.rpc("create_space_invite", { sid, invite_role: "viewer" })).data!;
    await member.rpc("accept_space_invite", { invite_token: token });
    await owner.from("space_members").update({ role: "owner" }).eq("space_id", sid).eq("user_id", memberId);

    expect((await owner.rpc("delete_my_account")).error).toBeNull();
    expect((await admin.auth.admin.getUserById(ownerId)).data.user).toBeNull();
    expect((await admin.from("space_members").select("user_id").eq("space_id", sid)).data?.map((m) => m.user_id)).toEqual([memberId]);
  }, 120000);

  it("cannot be run by someone who is not signed in", async () => {
    const anon = createClient<Database>(url!, anonKey!);
    expect((await anon.rpc("delete_my_account")).error).not.toBeNull();
    expect((await anon.rpc("account_deletion_check")).error).not.toBeNull();
  });
});
