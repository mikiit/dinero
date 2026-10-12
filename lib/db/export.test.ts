import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { buildTransactionsCsv } from "./export";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { personalScope } from "@/lib/scope";

// Live-database test: the export must cover EVERY non-deleted transaction.
// PostgREST silently truncates a plain select at 1000 rows, so this seeds
// 1001 to prove the paging loop crosses that boundary, and checks that
// soft-deleted rows stay out while rows on archived accounts stay in.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("transactions CSV export (live)", () => {
  let admin: SupabaseClient<Database>;
  let client: SupabaseClient<Database>;
  let userId: string;

  const BULK = 1001;

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    client = createClient<Database>(url!, anonKey!);

    const { data, error } = await signInAnonymouslyWithRetry(client);
    if (error || !data.user) throw error;
    userId = data.user.id;

    const { data: wallet, error: walletError } = await client
      .from("accounts")
      .insert({ user_id: userId, name: "Wallet", type: "cash" })
      .select()
      .single();
    if (walletError || !wallet) throw walletError;

    const { data: old, error: oldError } = await client
      .from("accounts")
      .insert({
        user_id: userId,
        name: "Old card",
        type: "debit",
        archived_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (oldError || !old) throw oldError;

    const { data: parent, error: parentError } = await client
      .from("categories")
      .insert({ user_id: userId, name: "Food", kind: "expense" })
      .select()
      .single();
    if (parentError || !parent) throw parentError;

    const { data: child, error: childError } = await client
      .from("categories")
      .insert({
        user_id: userId,
        name: "Groceries",
        kind: "expense",
        parent_id: parent.id,
      })
      .select()
      .single();
    if (childError || !child) throw childError;

    const base = {
      user_id: userId,
      type: "expense" as const,
      account_id: wallet.id,
      category_id: child.id,
      amount: 12345,
      currency: "RSD",
      occurred_on: "2026-01-15",
    };

    const bulk = Array.from({ length: BULK }, (_, i) => ({
      ...base,
      note: `bulk ${i}`,
    }));
    const { error: bulkError } = await client.from("transactions").insert(bulk);
    if (bulkError) throw bulkError;

    const { error: specialError } = await client.from("transactions").insert([
      { ...base, note: "=HYPERLINK(\"x\")", merchant: "Maxi, Beograd" },
      { ...base, account_id: old.id, category_id: null, note: "on archived" },
      {
        ...base,
        note: "deleted",
        deleted_at: new Date().toISOString(),
      },
    ]);
    if (specialError) throw specialError;
  }, 60000);

  afterAll(async () => {
    if (!userId) return;
    await admin.from("transactions").delete().eq("user_id", userId);
    await admin.from("categories").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }, 30000);

  it("exports all non-deleted rows past the 1000-row page boundary", async () => {
    const csv = await buildTransactionsCsv(client, personalScope(userId));
    const lines = csv.replace("﻿", "").trimEnd().split("\r\n");

    expect(lines[0]).toBe(
      "date,type,account,to_account,category,amount,currency,to_amount,merchant,note,tags",
    );
    // header + 1001 bulk + formula row + archived-account row; not the deleted one
    expect(lines).toHaveLength(1 + BULK + 2);
    expect(csv).not.toContain(",deleted");
  }, 60000);

  it("resolves names, hierarchy, archived accounts, and guards formulas", async () => {
    const csv = await buildTransactionsCsv(client, personalScope(userId));

    expect(csv).toContain(
      '2026-01-15,expense,Wallet,,Food > Groceries,123.45,RSD,,"Maxi, Beograd","\'=HYPERLINK(""x"")"',
    );
    expect(csv).toContain("2026-01-15,expense,Old card,,,123.45,RSD,,,on archived");
  }, 60000);
});
