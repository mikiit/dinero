import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { signInWithPassword } from "./sign-in";
import { setNewPassword } from "./reset-password";
import { loadTestEnv } from "@/lib/db/test-env";

// The real thing, against the live Supabase project: an emailed reset link,
// the new password, and what must (and must not) still work afterwards. The
// link is minted with the admin API instead of being emailed, which is the
// same token the email would carry, without sending anyone a message.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

type Db = SupabaseClient<Database>;

describe.skipIf(!hasCredentials)("password reset (live)", () => {
  let admin: Db;
  let userId: string;
  const email = `reset-${Date.now()}@example.com`;
  const OLD = "old-password-123";
  const NEW = "brand-new-password-456";

  const fresh = () => createClient<Database>(url!, anonKey!);

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: OLD,
      email_confirm: true,
    });
    if (error || !data.user) throw error;
    userId = data.user.id;
  }, 30000);

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  }, 30000);

  async function recoveryToken(): Promise<string> {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (error || !data.properties?.hashed_token) throw error ?? new Error("no token");
    return data.properties.hashed_token;
  }

  it("a reset link sets a new password: the new one works, the old one stops", async () => {
    // Another device that is signed in with the old password.
    const otherDevice = fresh();
    await signInWithPassword(otherDevice, email, OLD);
    expect((await otherDevice.auth.getUser()).error).toBeNull();

    // The person opens the emailed link (token_hash flow) in a browser...
    const browser = fresh();
    const verified = await browser.auth.verifyOtp({ type: "recovery", token_hash: await recoveryToken() });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();

    // ...and chooses a new password with the same helper the form uses.
    await setNewPassword(browser, NEW);

    // New password signs in; old password no longer does.
    await expect(signInWithPassword(fresh(), email, NEW)).resolves.toBeTruthy();
    await expect(signInWithPassword(fresh(), email, OLD)).rejects.toThrow(/invalid login credentials/i);

    // The browser that did the reset stays signed in...
    expect((await browser.auth.getUser()).error).toBeNull();
    // ...but the other device is signed out: whoever had the old password
    // loses access too.
    expect((await otherDevice.auth.getUser()).error).not.toBeNull();
  }, 60000);

  it("a reset link works only once", async () => {
    const token = await recoveryToken();
    const first = await fresh().auth.verifyOtp({ type: "recovery", token_hash: token });
    expect(first.error).toBeNull();

    const second = await fresh().auth.verifyOtp({ type: "recovery", token_hash: token });
    expect(second.error).not.toBeNull();
    expect(second.data.session).toBeNull();
  }, 60000);

  it("a made-up link does nothing", async () => {
    const bogus = await fresh().auth.verifyOtp({
      type: "recovery",
      token_hash: "0".repeat(64),
    });
    expect(bogus.error).not.toBeNull();
    expect(bogus.data.session).toBeNull();
  }, 30000);
});
