import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { loadTestEnv } from "./test-env";

// Integration test against the LIVE linked Supabase project - proves
// supabase/migrations/20260813140000_lock_account_type_and_currency.sql
// actually blocks changing an account's type/currency after creation, and
// that ordinary field updates (name) still work. A CHECK constraint can't
// compare OLD vs NEW, so this is a trigger, and a trigger is only provable
// by hitting real Postgres.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("account type/currency immutability (live)", () => {
  let admin: SupabaseClient<Database>;
  let client: SupabaseClient<Database>;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    client = createClient<Database>(url!, anonKey!);

    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.user) throw error;
    userId = data.user.id;

    const { data: account, error: accountError } = await client
      .from("accounts")
      .insert({ user_id: userId, name: "Wallet", type: "cash" })
      .select()
      .single();
    if (accountError || !account) throw accountError;
    accountId = account.id;
  }, 30000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("accounts").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }, 30000);

  it("rejects changing type after creation", async () => {
    const { data, error } = await client
      .from("accounts")
      .update({ type: "credit" })
      .eq("id", accountId);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/type cannot be changed/);
  });

  it("rejects changing currency after creation", async () => {
    const { data, error } = await client
      .from("accounts")
      .update({ currency: "EUR" })
      .eq("id", accountId);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/currency cannot be changed/);
  });

  it("still allows updating other fields", async () => {
    const { data, error } = await client
      .from("accounts")
      .update({ name: "Wallet (renamed)" })
      .eq("id", accountId)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.name).toBe("Wallet (renamed)");
    expect(data?.type).toBe("cash");
  });
});
