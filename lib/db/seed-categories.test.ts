import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { listCategories } from "./categories";
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
});
