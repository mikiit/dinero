#!/usr/bin/env node
// Dev tooling for browser-driven verification: creates a disposable
// anonymous test user (never the real session already sitting in your
// browser's cookies) so clicking around in Chrome to verify a feature can
// never touch your actual accounts/categories/transactions.
//
// Usage:
//   node scripts/test-session.mjs setup      -> prints {userId, accessToken, refreshToken}
//   node scripts/test-session.mjs teardown <userId>  -> deletes that user and all their rows
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

async function setup() {
  const client = createClient(url, anonKey);

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw error ?? new Error("signInAnonymously returned no session");
  }
  const userId = data.user.id;

  const { error: accountError } = await client.from("accounts").insert({
    user_id: userId,
    name: "Test Wallet",
    type: "cash",
    opening_balance: 1000000, // 10,000.00 RSD - enough headroom for test expenses
  });
  if (accountError) throw accountError;

  console.log(
    JSON.stringify({
      userId,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    }),
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

const [, , command, arg] = process.argv;

if (command === "setup") {
  await setup();
} else if (command === "teardown") {
  await teardown(arg);
} else {
  console.error("Usage: node scripts/test-session.mjs <setup|teardown> [userId]");
  process.exit(1);
}
