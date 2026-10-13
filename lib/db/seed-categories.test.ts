import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { listCategories } from "./categories";
import { insertMissingDefaults } from "./seed-categories";
import { DEFAULT_CATEGORIES } from "./default-categories";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { personalScope } from "@/lib/scope";

// Regression: a brand-new account got every default category TWICE, because
// the layout and the page both ask for categories on the first load, both
// saw "none yet", and both inserted the full set. Two concurrent first
// requests must still produce exactly one set.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("default category seeding (live)", () => {
  let admin: SupabaseClient<Database>;
  let client: SupabaseClient<Database>;
  let userId: string;

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    client = createClient<Database>(url!, anonKey!);
    const { data, error } = await signInAnonymouslyWithRetry(client);
    if (error || !data.user) throw error;
    userId = data.user.id;
  }, 30000);

  afterAll(async () => {
    if (!userId) return;
    await admin.from("categories").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }, 30000);

  it("seeds each default exactly once when two loads race on a new account", async () => {
    const scope = personalScope(userId);

    const [a, b, c] = await Promise.all([
      listCategories(client, scope),
      listCategories(client, scope),
      listCategories(client, scope),
    ]);

    expect(a).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(b).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(c).toHaveLength(DEFAULT_CATEGORIES.length);

    const { data } = await admin.from("categories").select("name, kind").eq("user_id", userId);
    expect(data).toHaveLength(DEFAULT_CATEGORIES.length);
    const keys = new Set((data ?? []).map((r) => `${r.kind}:${r.name}`));
    expect(keys.size).toBe(DEFAULT_CATEGORIES.length); // no name twice
  }, 60000);

  it("does not bring the defaults back or double them on later loads", async () => {
    const scope = personalScope(userId);
    const again = await listCategories(client, scope);
    expect(again).toHaveLength(DEFAULT_CATEGORIES.length);
  }, 60000);

  // The in-process dedupe in seedDefaultCategories cannot help across
  // serverless instances, so this calls insertMissingDefaults directly from
  // two independent clients (each its own connection, no shared in-flight
  // map) and relies on the database unique index alone. Needs migration
  // 20261013150000_categories_unique_active applied to the test project.
  it("seeds each default exactly once when two separate clients race", async () => {
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;
    expect(token).toBeTruthy();

    const other = createClient<Database>(url!, anonKey!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Start from a clean slate for this user.
    await admin.from("categories").delete().eq("user_id", userId);

    const scope = personalScope(userId);
    await Promise.all([
      insertMissingDefaults(client, scope),
      insertMissingDefaults(other, scope),
      insertMissingDefaults(client, scope),
      insertMissingDefaults(other, scope),
    ]);

    const { data } = await admin
      .from("categories")
      .select("name, kind")
      .eq("user_id", userId);
    expect(data).toHaveLength(DEFAULT_CATEGORIES.length);
    const keys = new Set((data ?? []).map((r) => `${r.kind}:${r.name}`));
    expect(keys.size).toBe(DEFAULT_CATEGORIES.length);
    for (const c of DEFAULT_CATEGORIES) {
      expect(keys.has(`${c.kind}:${c.name}`)).toBe(true);
    }
  }, 60000);
});
