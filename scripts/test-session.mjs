#!/usr/bin/env node
// Dev tooling for browser-driven verification: creates a disposable
// anonymous test user (never the real session already sitting in your
// browser's cookies) so clicking around in Chrome to verify a feature can
// never touch your actual accounts/categories/transactions.
//
// Usage:
//   node scripts/test-session.mjs setup                    -> minimal: one account, no transactions
//   node scripts/test-session.mjs setup --seed-transactions -> two accounts, five categories, 30
//                                                                transactions across 6 days, plus
//                                                                the independently-computed expected
//                                                                day total / account balances
//   node scripts/test-session.mjs teardown <userId>         -> deletes that user and all their rows
//
// See app/api/dev/test-session/route.ts for how the printed tokens get
// into an actual browser tab.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = env.SUPABASE_SECRET_KEY;

if (!url || !anonKey || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

// Fixed, non-random template applied identically to each of the 6 seeded
// days, so every day's total is the same number and easy to eyeball in
// the UI, and the final account balances are round enough to hand-check.
// All amounts are minor units (para).
const CHECKING_OPENING = 1_000_000; // 10,000.00 RSD
const SAVINGS_OPENING = 500_000; // 5,000.00 RSD
const DAY_TEMPLATE = [
  { type: "expense", category: "Groceries", account: "checking", amount: 100_000 }, // 1,000.00
  { type: "expense", category: "Transport", account: "checking", amount: 30_000 }, // 300.00
  { type: "expense", category: "Eating out", account: "checking", amount: 55_075, note: "Team lunch" }, // 550.75
  { type: "income", category: "Salary", account: "checking", amount: 500_000 }, // 5,000.00
  { type: "expense", category: "Groceries", account: "savings", amount: 20_000 }, // 200.00
];
const SEED_DAYS = 6;

const CATEGORIES = [
  { name: "Groceries", kind: "expense" },
  { name: "Transport", kind: "expense" },
  { name: "Eating out", kind: "expense" },
  { name: "Salary", kind: "income" },
];

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function setup(seedTransactions) {
  const client = createClient(url, anonKey);

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw error ?? new Error("signInAnonymously returned no session");
  }
  const userId = data.user.id;

  if (!seedTransactions) {
    const { error: accountError } = await client.from("accounts").insert({
      user_id: userId,
      name: "Test Wallet",
      type: "cash",
      opening_balance: 1_000_000,
    });
    if (accountError) throw accountError;

    console.log(
      JSON.stringify({
        userId,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      }),
    );
    return;
  }

  const { data: checking, error: checkingError } = await client
    .from("accounts")
    .insert({
      user_id: userId,
      name: "Test Checking",
      type: "cash",
      opening_balance: CHECKING_OPENING,
    })
    .select()
    .single();
  if (checkingError) throw checkingError;

  const { data: savings, error: savingsError } = await client
    .from("accounts")
    .insert({
      user_id: userId,
      name: "Test Savings",
      type: "savings",
      opening_balance: SAVINGS_OPENING,
    })
    .select()
    .single();
  if (savingsError) throw savingsError;

  // Negative opening_balance = owed, per the credit card balance
  // convention (lib/credit.ts). No transactions are seeded against it -
  // its only purpose is exercising the "Owed: X" + utilization bar
  // display and the set-balance-via-adjustment flow against a real limit.
  const CREDIT_LIMIT = 200_000; // 2,000.00 RSD
  const CREDIT_OPENING = -80_000; // owes 800.00 RSD -> 40% utilization
  const { data: credit, error: creditError } = await client
    .from("accounts")
    .insert({
      user_id: userId,
      name: "Test Credit Card",
      type: "credit",
      opening_balance: CREDIT_OPENING,
      credit_limit: CREDIT_LIMIT,
    })
    .select()
    .single();
  if (creditError) throw creditError;

  const accountIdByKey = { checking: checking.id, savings: savings.id, credit: credit.id };

  const categoryIdByName = {};
  for (const c of CATEGORIES) {
    const { data: cat, error: catError } = await client
      .from("categories")
      .insert({ user_id: userId, name: c.name, kind: c.kind })
      .select()
      .single();
    if (catError) throw catError;
    categoryIdByName[c.name] = cat.id;
  }

  const rows = [];
  for (let dayOffset = 0; dayOffset < SEED_DAYS; dayOffset++) {
    const occurredOn = isoDaysAgo(dayOffset);
    for (const tx of DAY_TEMPLATE) {
      rows.push({
        user_id: userId,
        type: tx.type,
        account_id: accountIdByKey[tx.account],
        category_id: categoryIdByName[tx.category],
        amount: tx.amount,
        currency: "RSD",
        occurred_on: occurredOn,
        note: tx.note ?? null,
      });
    }
  }

  const { error: txError } = await client.from("transactions").insert(rows);
  if (txError) throw txError;

  const checkingDayNet = DAY_TEMPLATE.filter((t) => t.account === "checking").reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
    0,
  );
  const savingsDayNet = DAY_TEMPLATE.filter((t) => t.account === "savings").reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
    0,
  );
  const dayTotalMinor = checkingDayNet + savingsDayNet;

  console.log(
    JSON.stringify(
      {
        userId,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        accountIds: accountIdByKey,
        categoryIds: categoryIdByName,
        transactionCount: rows.length,
        seedDays: Array.from({ length: SEED_DAYS }, (_, i) => isoDaysAgo(i)),
        expected: {
          dayTotalMinor,
          dayTotalRSD: (dayTotalMinor / 100).toFixed(2),
          checkingBalanceMinor: CHECKING_OPENING + checkingDayNet * SEED_DAYS,
          checkingBalanceRSD: (
            (CHECKING_OPENING + checkingDayNet * SEED_DAYS) /
            100
          ).toFixed(2),
          savingsBalanceMinor: SAVINGS_OPENING + savingsDayNet * SEED_DAYS,
          savingsBalanceRSD: (
            (SAVINGS_OPENING + savingsDayNet * SEED_DAYS) /
            100
          ).toFixed(2),
          creditBalanceMinor: CREDIT_OPENING,
          creditOwedRSD: (-CREDIT_OPENING / 100).toFixed(2),
          creditLimitRSD: (CREDIT_LIMIT / 100).toFixed(2),
          creditUtilizationPercent: (-CREDIT_OPENING / CREDIT_LIMIT) * 100,
        },
      },
      null,
      2,
    ),
  );
}

async function teardown(userId) {
  if (!userId) {
    console.error("Usage: node scripts/test-session.mjs teardown <userId>");
    process.exit(1);
  }

  const admin = createClient(url, secretKey);

  await admin.from("budgets").delete().eq("user_id", userId);
  await admin.from("transactions").delete().eq("user_id", userId);
  await admin.from("recurring_rules").delete().eq("user_id", userId);
  await admin.from("categories").delete().eq("user_id", userId);
  await admin.from("accounts").delete().eq("user_id", userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;

  console.log(JSON.stringify({ ok: true, userId }));
}

const [, , command, ...rest] = process.argv;

if (command === "setup") {
  await setup(rest.includes("--seed-transactions"));
} else if (command === "teardown") {
  await teardown(rest[0]);
} else {
  console.error(
    "Usage: node scripts/test-session.mjs <setup [--seed-transactions]|teardown> [userId]",
  );
  process.exit(1);
}
