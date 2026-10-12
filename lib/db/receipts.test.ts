import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { attachReceipt, getReceiptSignedUrl, removeReceipt } from "./receipts";
import { createTransaction } from "./transactions";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { RECEIPT_BUCKET, buildReceiptPath } from "@/lib/receipts";

// Live test of receipt storage. The thing that matters is isolation: the
// bucket is only as private as its policies, and a policy file on disk is
// not proof of what is live - so this uploads as one user and tries to read,
// overwrite and sign as another. Needs migration
// 20261012180000_receipts_bucket.sql applied to the live project.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

// A valid 1x1 JPEG; the bucket checks the declared MIME type, not magic bytes.
const TINY = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

describe.skipIf(!hasCredentials)("receipt storage (live)", () => {
  let admin: SupabaseClient<Database>;
  let a: SupabaseClient<Database>;
  let b: SupabaseClient<Database>;
  let userA: string;
  let userB: string;
  let accountA: string;
  const uploaded: string[] = [];

  const bucket = (c: SupabaseClient<Database>) => c.storage.from(RECEIPT_BUCKET);

  async function newTx(): Promise<string> {
    const id = crypto.randomUUID();
    await createTransaction(a, userA, {
      id,
      type: "expense",
      accountId: accountA,
      categoryId: null,
      amount: 1000n,
      occurredOn: "2026-10-12",
    });
    return id;
  }

  async function put(client: SupabaseClient<Database>, path: string, type = "image/jpeg") {
    const res = await bucket(client).upload(path, TINY, { contentType: type, upsert: false });
    if (!res.error) uploaded.push(path);
    return res;
  }

  async function exists(path: string): Promise<boolean> {
    const dir = path.slice(0, path.lastIndexOf("/"));
    const name = path.slice(path.lastIndexOf("/") + 1);
    const { data } = await admin.storage.from(RECEIPT_BUCKET).list(dir);
    return (data ?? []).some((o) => o.name === name);
  }

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    const probe = await admin.storage.getBucket(RECEIPT_BUCKET);
    if (probe.error || !probe.data) {
      throw new Error(
        "Bucket 'receipts' does not exist. Apply supabase/migrations/20261012180000_receipts_bucket.sql (SQL editor or `npx supabase db push`), then re-run.",
      );
    }

    a = createClient<Database>(url!, anonKey!);
    b = createClient<Database>(url!, anonKey!);
    const [sa, sb] = await Promise.all([
      signInAnonymouslyWithRetry(a),
      signInAnonymouslyWithRetry(b),
    ]);
    if (sa.error || !sa.data.user) throw sa.error;
    if (sb.error || !sb.data.user) throw sb.error;
    userA = sa.data.user.id;
    userB = sb.data.user.id;

    const { data: acc, error } = await a
      .from("accounts")
      .insert({ user_id: userA, name: "Wallet", type: "cash" })
      .select()
      .single();
    if (error || !acc) throw error;
    accountA = acc.id;
  }, 60000);

  afterAll(async () => {
    if (uploaded.length) await admin.storage.from(RECEIPT_BUCKET).remove(uploaded);
    for (const id of [userA, userB]) {
      if (!id) continue;
      await admin.from("transactions").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }, 60000);

  it("the bucket is private", async () => {
    const { data } = await admin.storage.getBucket(RECEIPT_BUCKET);
    expect(data?.public).toBe(false);
  });

  it("a user can upload into their own folder and read it back via a signed URL", async () => {
    const tx = await newTx();
    const path = buildReceiptPath(userA, tx, crypto.randomUUID(), "jpg");
    expect((await put(a, path)).error).toBeNull();

    const signed = await getReceiptSignedUrl(a, userA, path);
    expect(signed).toBeTruthy();
    const res = await fetch(signed!);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(TINY.length);
  }, 60000);

  it("another user cannot upload into, read from, or sign someone else's folder", async () => {
    const tx = await newTx();
    const path = buildReceiptPath(userA, tx, crypto.randomUUID(), "jpg");
    expect((await put(a, path)).error).toBeNull();

    // B writes into A's folder: refused.
    const intruder = buildReceiptPath(userA, tx, crypto.randomUUID(), "jpg");
    expect((await put(b, intruder)).error).not.toBeNull();
    expect(await exists(intruder)).toBe(false);

    // B reads / signs A's object: refused.
    expect((await bucket(b).download(path)).error).not.toBeNull();
    expect((await bucket(b).createSignedUrl(path, 60)).error).not.toBeNull();
    // ...and the app-level helper refuses before even asking.
    expect(await getReceiptSignedUrl(b, userB, path)).toBeNull();

    // B cannot delete it either (a delete the policy hides removes nothing).
    await bucket(b).remove([path]);
    expect(await exists(path)).toBe(true);
  }, 60000);

  it("rejects non-image types and oversized files", async () => {
    const tx = await newTx();
    const text = await put(a, buildReceiptPath(userA, tx, crypto.randomUUID(), "jpg"), "text/plain");
    expect(text.error).not.toBeNull();

    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const path = buildReceiptPath(userA, tx, crypto.randomUUID(), "jpg");
    const res = await bucket(a).upload(path, big, { contentType: "image/jpeg" });
    expect(res.error).not.toBeNull();
  }, 90000);

  it("attach stores the path, replacing deletes the old photo, remove clears both", async () => {
    const tx = await newTx();
    const first = buildReceiptPath(userA, tx, crypto.randomUUID(), "jpg");
    const second = buildReceiptPath(userA, tx, crypto.randomUUID(), "jpg");
    await put(a, first);
    await put(a, second);

    await attachReceipt(a, userA, tx, first);
    await attachReceipt(a, userA, tx, second);

    const { data } = await a.from("transactions").select("receipt_url").eq("id", tx).single();
    expect(data?.receipt_url).toBe(second);
    expect(await exists(first)).toBe(false); // old photo deleted
    expect(await exists(second)).toBe(true);

    await removeReceipt(a, userA, tx);
    const after = await a.from("transactions").select("receipt_url").eq("id", tx).single();
    expect(after.data?.receipt_url).toBeNull();
    expect(await exists(second)).toBe(false);
  }, 90000);

  it("attach refuses a path in another folder or for another transaction", async () => {
    const tx = await newTx();
    const other = await newTx();
    await expect(
      attachReceipt(a, userA, tx, buildReceiptPath(userB, tx, crypto.randomUUID(), "jpg")),
    ).rejects.toThrow(/Invalid receipt/);
    await expect(
      attachReceipt(a, userA, tx, buildReceiptPath(userA, other, crypto.randomUUID(), "jpg")),
    ).rejects.toThrow(/Invalid receipt/);
    await expect(attachReceipt(a, userA, tx, `${userA}/${tx}/../x.jpg`)).rejects.toThrow(
      /Invalid receipt/,
    );
  }, 60000);

  it("createTransaction can store a receipt path at creation, under a client-chosen id", async () => {
    const id = crypto.randomUUID();
    const path = buildReceiptPath(userA, id, crypto.randomUUID(), "jpg");
    await put(a, path);
    await createTransaction(a, userA, {
      id,
      receiptPath: path,
      type: "expense",
      accountId: accountA,
      categoryId: null,
      amount: 500n,
      occurredOn: "2026-10-12",
    });
    const { data } = await a.from("transactions").select("id, receipt_url").eq("id", id).single();
    expect(data).toEqual({ id, receipt_url: path });
  }, 60000);
});
