import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { archiveAccount, createAccount, listAccounts, restoreAccount } from "./accounts";
import { archiveCategory, createCategory, listCategories, restoreCategory } from "./categories";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { personalScope } from "@/lib/scope";

// Archiving is now undoable (a toast with Undo); these are the database
// halves of that. The subtle one: undoing the archive of a parent category
// must bring back only the children THAT archive took with it, not ones the
// user had archived deliberately beforehand.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("archive and restore (live)", () => {
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
    await admin.from("categories").delete().eq("user_id", userId).not("parent_id", "is", null);
    await admin.from("categories").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }, 30000);

  it("an archived account disappears from the list and comes back on restore", async () => {
    const scope = personalScope(userId);
    await createAccount(client, scope, { name: "Savings box", type: "savings", openingBalance: 5000n });
    const created = (await listAccounts(client, scope)).find((a) => a.name === "Savings box")!;
    expect(created.balance).toBe(5000n);

    await archiveAccount(client, scope, created.id);
    expect((await listAccounts(client, scope)).some((a) => a.id === created.id)).toBe(false);

    await restoreAccount(client, scope, created.id);
    const back = (await listAccounts(client, scope)).find((a) => a.id === created.id);
    expect(back?.balance).toBe(5000n); // nothing about it changed
  }, 60000);

  it("restoring a parent brings back its children, but not ones archived earlier", async () => {
    const scope = personalScope(userId);
    await listCategories(client, scope); // seeds the defaults, so "Other" etc. exist
    await createCategory(client, scope, { name: "Pets", kind: "expense" });
    const pets = (await listCategories(client, scope)).find((c) => c.name === "Pets")!;
    await createCategory(client, scope, { name: "Food", kind: "expense", parentId: pets.id });
    await createCategory(client, scope, { name: "Toys", kind: "expense", parentId: pets.id });
    const all = await listCategories(client, scope);
    const food = all.find((c) => c.name === "Food" && c.parentId === pets.id)!;
    const toys = all.find((c) => c.name === "Toys")!;

    // The user archives "Toys" on its own first.
    await archiveCategory(client, scope, toys.id);

    // Then archives the whole "Pets" parent (taking "Food" with it).
    const archivedAt = await archiveCategory(client, scope, pets.id);
    const afterArchive = (await listCategories(client, scope)).map((c) => c.id);
    expect(afterArchive).not.toContain(pets.id);
    expect(afterArchive).not.toContain(food.id);

    // Undo: Pets and Food return; Toys, archived earlier, stays archived.
    await restoreCategory(client, scope, pets.id, archivedAt);
    const afterRestore = (await listCategories(client, scope)).map((c) => c.id);
    expect(afterRestore).toContain(pets.id);
    expect(afterRestore).toContain(food.id);
    expect(afterRestore).not.toContain(toys.id);
  }, 90000);
});
