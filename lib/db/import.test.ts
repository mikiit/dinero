import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { buildTransactionsCsv } from "./export";
import { insertPlannedTransactions, planImportForUser } from "./import";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { TRANSACTION_CSV_HEADERS } from "@/lib/import-transactions";
import { personalScope } from "@/lib/scope";

// Live round trip: user A's export imported into user B (who has accounts and
// categories with the same names but none of A's transactions) must
// reproduce A's ledger exactly, and importing it AGAIN must add nothing.
// 1003 rows so both the export's and the duplicate check's paging cross the
// 1000-row PostgREST boundary.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

type Db = SupabaseClient<Database>;

describe.skipIf(!hasCredentials)("transactions CSV import (live)", () => {
  let admin: Db;
  const users: { client: Db; id: string }[] = [];

  async function newUser(): Promise<{ client: Db; id: string }> {
    const client = createClient<Database>(url!, anonKey!);
    const { data, error } = await signInAnonymouslyWithRetry(client);
    if (error || !data.user) throw error;
    const user = { client, id: data.user.id };
    users.push(user);
    return user;
  }

  /** Same account/category names for both users; archived card included. */
  async function seedStructure({ client, id }: { client: Db; id: string }) {
    const { data: accounts, error: aErr } = await client
      .from("accounts")
      .insert([
        { user_id: id, name: "Wallet", type: "cash" },
        { user_id: id, name: "=Card", type: "debit" },
        {
          user_id: id,
          name: "Old",
          type: "debit",
          archived_at: new Date().toISOString(),
        },
      ])
      .select();
    if (aErr || !accounts) throw aErr;

    const { data: food, error: fErr } = await client
      .from("categories")
      .insert({ user_id: id, name: "Food", kind: "expense" })
      .select()
      .single();
    if (fErr || !food) throw fErr;
    const { data: cats, error: cErr } = await client
      .from("categories")
      .insert([
        { user_id: id, name: "Groceries", kind: "expense", parent_id: food.id },
        { user_id: id, name: "Other", kind: "expense" },
        { user_id: id, name: "Other", kind: "income" },
      ])
      .select();
    if (cErr || !cats) throw cErr;

    const acc = (name: string) => accounts.find((a) => a.name === name)!.id;
    const cat = (name: string, kind: string) =>
      cats.find((c) => c.name === name && c.kind === kind)!.id;
    return { acc, cat };
  }

  const sortedLines = (csv: string) =>
    csv.replace("﻿", "").trimEnd().split("\r\n").slice(1).sort();

  let a: { client: Db; id: string };
  let b: { client: Db; id: string };
  let exported = "";

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    a = await newUser();
    b = await newUser();
    const sa = await seedStructure(a);
    await seedStructure(b);

    const base = {
      user_id: a.id,
      currency: "RSD",
      occurred_on: "2026-01-15",
    };
    const bulk = Array.from({ length: 1000 }, (_, i) => ({
      ...base,
      type: "expense" as const,
      account_id: sa.acc("Wallet"),
      category_id: sa.cat("Groceries", "expense"),
      amount: 100 + i,
      note: `bulk ${i}`,
    }));
    // Two byte-identical rows: a legitimate repeat, not a duplicate to drop.
    const twin = {
      ...base,
      type: "expense" as const,
      account_id: sa.acc("Wallet"),
      category_id: sa.cat("Other", "expense"),
      amount: 25000,
      merchant: "Maxi, Beograd",
      note: "=twin",
    };
    const { error } = await a.client.from("transactions").insert([
      ...bulk,
      twin,
      twin,
      {
        ...base,
        type: "income" as const,
        account_id: sa.acc("=Card"),
        category_id: sa.cat("Other", "income"),
        amount: 99900,
      },
      {
        ...base,
        type: "transfer" as const,
        account_id: sa.acc("Wallet"),
        to_account_id: sa.acc("=Card"),
        amount: 5000,
      },
      {
        ...base,
        type: "adjustment" as const,
        account_id: sa.acc("Old"),
        amount: -777,
      },
    ]);
    if (error) throw error;

    exported = await buildTransactionsCsv(a.client, personalScope(a.id));
  }, 90000);

  afterAll(async () => {
    for (const { id } of users) {
      await admin.from("transactions").delete().eq("user_id", id);
      await admin.from("categories").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }, 60000);

  it("export header matches what the importer expects", () => {
    expect(exported.replace("﻿", "").split("\r\n")[0]).toBe(
      TRANSACTION_CSV_HEADERS.join(","),
    );
  });

  it("is idempotent: importing your own export adds nothing", async () => {
    const plan = await planImportForUser(a.client, personalScope(a.id), exported);
    expect(plan.errors).toEqual([]);
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.duplicates).toBe(1005);
  }, 60000);

  it("restores a ledger into another user exactly, then is a no-op", async () => {
    const plan = await planImportForUser(b.client, personalScope(b.id), exported);
    expect(plan.errors).toEqual([]);
    expect(plan.duplicates).toBe(0);
    expect(plan.toInsert).toHaveLength(1005);

    await insertPlannedTransactions(b.client, personalScope(b.id), plan.toInsert);

    const bExport = await buildTransactionsCsv(b.client, personalScope(b.id));
    expect(sortedLines(bExport)).toEqual(sortedLines(exported));

    const again = await planImportForUser(b.client, personalScope(b.id), exported);
    expect(again.toInsert).toHaveLength(0);
    expect(again.duplicates).toBe(1005);
  }, 90000);

  it("rejects rows naming accounts or categories the user lacks", async () => {
    const csv = [
      TRANSACTION_CSV_HEADERS.join(","),
      "2026-02-01,expense,Wallet,,Food > Groceries,1.00,RSD,,ok",
      "2026-02-01,expense,Ghost,,,1.00,RSD,,bad account",
      "2026-02-01,expense,Wallet,,Nope,1.00,RSD,,bad category",
    ].join("\r\n");
    const plan = await planImportForUser(b.client, personalScope(b.id), csv);
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.errors.map((e) => e.line)).toEqual([3, 4]);
  }, 60000);
});
