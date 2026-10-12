import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { createAccount, listAccounts } from "./accounts";
import { clearBudget, listBudgets, setBudget } from "./budgets";
import { getMonthlySeries, getSpendBreakdown } from "./reports";
import {
  createTransaction,
  getMonthlySummary,
  listRecentTransactions,
  updateTransaction,
} from "./transactions";
import { createRule } from "./recurring";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { personalScope } from "@/lib/scope";

// Live test of multi-currency (supabase/migrations/20261013100000): accounts
// in different currencies keep separate totals, a cross-currency transfer
// credits the RECEIVED amount, and the database refuses inconsistent rows.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

describe.skipIf(!hasCredentials)("multi-currency (live)", () => {
  let admin: SupabaseClient<Database>;
  let client: SupabaseClient<Database>;
  let userId: string;
  let rsdId: string;
  let rsd2Id: string;
  let eurId: string;
  let foodId: string;

  const MONTH = "2026-05-01";
  const DAY = "2026-05-10";
  const scope = () => personalScope(userId);

  async function accountId(name: string) {
    return (await listAccounts(client, scope())).find((a) => a.name === name)!.id;
  }

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    client = createClient<Database>(url!, anonKey!);
    const { data, error } = await signInAnonymouslyWithRetry(client);
    if (error || !data.user) throw error;
    userId = data.user.id;

    await createAccount(client, scope(), { name: "Cash RSD", type: "cash", openingBalance: 1_000_000n });
    await createAccount(client, scope(), { name: "Cash RSD 2", type: "cash", openingBalance: 0n });
    await createAccount(client, scope(), {
      name: "Euro",
      type: "cash",
      currency: "EUR",
      openingBalance: 50_000n,
    });
    rsdId = await accountId("Cash RSD");
    rsd2Id = await accountId("Cash RSD 2");
    eurId = await accountId("Euro");

    const { data: cat, error: catError } = await client
      .from("categories")
      .insert({ user_id: userId, name: "Food", kind: "expense" })
      .select()
      .single();
    if (catError || !cat) throw catError;
    foodId = cat.id;
  }, 60000);

  afterAll(async () => {
    if (!userId) return;
    await admin.from("recurring_rules").delete().eq("user_id", userId);
    await admin.from("budgets").delete().eq("user_id", userId);
    await admin.from("transactions").delete().eq("user_id", userId);
    await admin.from("categories").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }, 30000);

  it("an account keeps the currency it was created with; default is RSD", async () => {
    const accounts = await listAccounts(client, scope());
    expect(accounts.find((a) => a.id === rsdId)!.currency).toBe("RSD");
    expect(accounts.find((a) => a.id === eurId)!.currency).toBe("EUR");
  });

  it("rejects an unsupported currency at the database", async () => {
    const { error } = await client
      .from("accounts")
      .insert({ user_id: userId, name: "Pounds", type: "cash", currency: "GBP" });
    expect(error?.message).toMatch(/accounts_currency_supported/);
  });

  it("a transaction takes its account's currency", async () => {
    await createTransaction(client, scope(), {
      type: "expense",
      accountId: eurId,
      categoryId: foodId,
      amount: 1_000n,
      occurredOn: DAY,
    });
    const [t] = await listRecentTransactions(client, scope(), 1);
    expect(t.currency).toBe("EUR");
    expect(t.toAmount).toBeNull();
  }, 30000);

  it("a same-currency transfer needs no received amount and credits amount", async () => {
    await createTransaction(client, scope(), {
      type: "transfer",
      accountId: rsdId,
      toAccountId: rsd2Id,
      amount: 20_000n,
      occurredOn: DAY,
    });
    const accounts = await listAccounts(client, scope());
    expect(accounts.find((a) => a.id === rsdId)!.balance).toBe(980_000n);
    expect(accounts.find((a) => a.id === rsd2Id)!.balance).toBe(20_000n);

    await expect(
      createTransaction(client, scope(), {
        type: "transfer",
        accountId: rsdId,
        toAccountId: rsd2Id,
        amount: 100n,
        toAmount: 100n, // ignored by the app: same currency
        occurredOn: DAY,
      }),
    ).resolves.toBeUndefined();
  }, 30000);

  it("a cross-currency transfer credits the received amount, not the sent one", async () => {
    // Send 100.00 EUR, receive 11,700.00 RSD.
    await createTransaction(client, scope(), {
      type: "transfer",
      accountId: eurId,
      toAccountId: rsdId,
      amount: 10_000n,
      toAmount: 1_170_000n,
      occurredOn: DAY,
    });
    const accounts = await listAccounts(client, scope());
    // EUR: 500.00 - 10.00 (expense) - 100.00 (sent)
    expect(accounts.find((a) => a.id === eurId)!.balance).toBe(39_000n);
    // RSD: 10,000.00 - 200.00 (to RSD 2) - 1.00 (second same-ccy) + 11,700.00
    expect(accounts.find((a) => a.id === rsdId)!.balance).toBe(980_000n - 100n + 1_170_000n);

    const [t] = await listRecentTransactions(client, scope(), 1);
    expect(t.type).toBe("transfer");
    expect(t.amount).toBe(10_000n);
    expect(t.toAmount).toBe(1_170_000n);
    expect(t.currency).toBe("EUR");
  }, 30000);

  it("a cross-currency transfer without the received amount is refused", async () => {
    await expect(
      createTransaction(client, scope(), {
        type: "transfer",
        accountId: eurId,
        toAccountId: rsdId,
        amount: 100n,
        occurredOn: DAY,
      }),
    ).rejects.toThrow(/received/);
    await expect(
      createTransaction(client, scope(), {
        type: "transfer",
        accountId: eurId,
        toAccountId: rsdId,
        amount: 100n,
        toAmount: 0n,
        occurredOn: DAY,
      }),
    ).rejects.toThrow(/received/);
  });

  it("the database itself refuses mismatched currency or to_amount", async () => {
    const base = {
      user_id: userId,
      type: "expense" as const,
      account_id: eurId,
      amount: 100,
      occurred_on: DAY,
    };
    const wrongCurrency = await client.from("transactions").insert({ ...base, currency: "RSD" });
    expect(wrongCurrency.error?.message).toMatch(/does not match its account currency/);

    const toAmountOnExpense = await client
      .from("transactions")
      .insert({ ...base, currency: "EUR", to_amount: 100 });
    expect(toAmountOnExpense.error?.message).toMatch(/to_amount_only_for_transfer/);

    const sameCcyToAmount = await client.from("transactions").insert({
      ...base,
      type: "transfer",
      to_account_id: rsd2Id,
      account_id: rsdId,
      currency: "RSD",
      to_amount: 100,
    });
    expect(sameCcyToAmount.error?.message).toMatch(/only for transfers between different currencies/);

    const missingToAmount = await client.from("transactions").insert({
      ...base,
      type: "transfer",
      to_account_id: rsdId,
      currency: "EUR",
    });
    expect(missingToAmount.error?.message).toMatch(/needs the received amount/);
  });

  it("editing an expense keeps its currency consistent with the account", async () => {
    const { data } = await client
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("account_id", eurId)
      .eq("type", "expense")
      .single();
    await updateTransaction(client, scope(), data!.id, {
      type: "expense",
      accountId: rsdId, // moved to an RSD account: currency follows
      categoryId: foodId,
      amount: 1_000n,
      occurredOn: DAY,
    });
    const { data: after } = await client.from("transactions").select("currency").eq("id", data!.id).single();
    expect(after!.currency).toBe("RSD");
  });

  it("month totals, spend and budgets are kept apart per currency", async () => {
    await createTransaction(client, scope(), { type: "expense", accountId: rsdId, categoryId: foodId, amount: 30_000n, occurredOn: DAY });
    await createTransaction(client, scope(), { type: "expense", accountId: eurId, categoryId: foodId, amount: 2_500n, occurredOn: DAY });
    await createTransaction(client, scope(), { type: "income", accountId: eurId, categoryId: null, amount: 9_900n, occurredOn: DAY });

    const summary = await getMonthlySummary(client, scope(), MONTH);
    const eur = summary.find((s) => s.currency === "EUR")!;
    const rsd = summary.find((s) => s.currency === "RSD")!;
    expect(eur.expense).toBe(2_500n);
    expect(eur.income).toBe(9_900n);
    // RSD: the 10.00 EUR expense was moved to an RSD account above.
    expect(rsd.expense).toBe(1_000n + 30_000n);

    expect((await getSpendBreakdown(client, scope(), MONTH, "EUR")).total).toBe(2_500n);
    expect((await getSpendBreakdown(client, scope(), MONTH, "RSD")).total).toBe(31_000n);
    expect((await getSpendBreakdown(client, scope(), MONTH, "USD")).total).toBe(0n);

    const eurSeries = await getMonthlySeries(client, scope(), MONTH, "EUR");
    expect(eurSeries[eurSeries.length - 1].income).toBe(9_900n);
    const usdSeries = await getMonthlySeries(client, scope(), MONTH, "USD");
    expect(usdSeries[usdSeries.length - 1].expense).toBe(0n);

    await setBudget(client, scope(), foodId, MONTH, "RSD", 100_000n);
    await setBudget(client, scope(), foodId, MONTH, "EUR", 5_000n);
    expect((await listBudgets(client, scope(), MONTH, "RSD")).get(foodId)).toBe(100_000n);
    expect((await listBudgets(client, scope(), MONTH, "EUR")).get(foodId)).toBe(5_000n);
    await clearBudget(client, scope(), foodId, MONTH, "EUR");
    expect((await listBudgets(client, scope(), MONTH, "EUR")).has(foodId)).toBe(false);
    expect((await listBudgets(client, scope(), MONTH, "RSD")).has(foodId)).toBe(true);
  }, 60000);

  it("a recurring transfer across currencies is refused; same-currency is fine", async () => {
    const rule = (toAccountId: string) => ({
      template: {
        type: "transfer" as const,
        accountId: rsdId,
        toAccountId,
        categoryId: null,
        amount: "1000",
        note: null,
        merchant: null,
      },
      frequency: "monthly" as const,
      interval: 1,
      startOn: "2026-06-01",
      endOn: null,
      autoPost: false,
    });
    await expect(createRule(client, scope(), rule(eurId))).rejects.toThrow(/same currency/);
    await expect(createRule(client, scope(), rule(rsd2Id))).resolves.toBeUndefined();
  }, 30000);
});
