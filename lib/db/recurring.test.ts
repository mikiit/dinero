import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import {
  createRule,
  deleteRule,
  listDue,
  listRules,
  pauseRule,
  postDueOccurrence,
  processAutoRules,
  resumeRule,
  skipDueOccurrence,
} from "./recurring";
import { loadTestEnv, signInAnonymouslyWithRetry } from "./test-env";
import { personalScope } from "@/lib/scope";

// SPEC.md §7, Phase 3 acceptance check, made permanent: "A recurring rent
// rule fires exactly once on its date, even if the app is opened five times
// that day." Needs migration 20261012170000_recurring_rules_idempotency.sql
// (the unique index on transactions(recurring_id, occurred_on)) applied to
// the live project - without it the concurrent test below posts duplicates,
// which is exactly the failure it exists to catch.
const { url, anonKey, secretKey, hasCredentials } = loadTestEnv();

const TODAY = "2026-10-12";

describe.skipIf(!hasCredentials)("recurring rules (live, SPEC.md P3)", () => {
  let admin: SupabaseClient<Database>;
  let client: SupabaseClient<Database>;
  let userId: string;
  let walletId: string;
  let cardId: string;
  let rentCategoryId: string;

  const base = (over: Partial<Parameters<typeof createRule>[2]> = {}) => ({
    template: {
      type: "expense" as const,
      accountId: walletId,
      toAccountId: null,
      categoryId: rentCategoryId,
      amount: "7000000",
      note: "Rent",
      merchant: null,
    },
    frequency: "monthly" as const,
    interval: 1,
    startOn: TODAY,
    endOn: null,
    autoPost: true,
    ...over,
  });

  async function postedFor(ruleId: string) {
    const { data, error } = await client
      .from("transactions")
      .select("occurred_on, amount, deleted_at, type, currency")
      .eq("user_id", userId)
      .eq("recurring_id", ruleId)
      .order("occurred_on", { ascending: true });
    if (error) throw error;
    return data;
  }

  async function newRule(over: Parameters<typeof base>[0] = {}) {
    await createRule(client, personalScope(userId), base(over));
    const rules = await listRules(client, personalScope(userId));
    // Newest by creation = the one not seen before; tests clean up by user.
    return rules.find((r) => !seen.has(r.id))!.id;
  }
  const seen = new Set<string>();
  async function createAndTrack(over: Parameters<typeof base>[0] = {}) {
    const id = await newRule(over);
    seen.add(id);
    return id;
  }

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!);
    client = createClient<Database>(url!, anonKey!);
    // Fail loudly and helpfully, not with a bare "column does not exist".
    const probe = await admin.from("recurring_rules").select("deleted_at").limit(1);
    if (probe.error) {
      throw new Error(
        "Migration 20261012170000_recurring_rules_idempotency.sql is not applied to the live project. Run `npx supabase db push`, then re-run.",
      );
    }

    const { data, error } = await signInAnonymouslyWithRetry(client);
    if (error || !data.user) throw error;
    userId = data.user.id;

    const { data: wallet } = await client
      .from("accounts")
      .insert({ user_id: userId, name: "Wallet", type: "cash" })
      .select()
      .single();
    const { data: card } = await client
      .from("accounts")
      .insert({ user_id: userId, name: "Card", type: "credit" })
      .select()
      .single();
    const { data: cat } = await client
      .from("categories")
      .insert({ user_id: userId, name: "Rent", kind: "expense" })
      .select()
      .single();
    if (!wallet || !card || !cat) throw new Error("seed failed");
    walletId = wallet.id;
    cardId = card.id;
    rentCategoryId = cat.id;
  }, 60000);

  afterAll(async () => {
    if (!userId) return;
    await admin.from("transactions").delete().eq("user_id", userId);
    await admin.from("recurring_rules").delete().eq("user_id", userId);
    await admin.from("categories").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }, 30000);

  it("fires exactly once when the app is opened five times at the same moment", async () => {
    const id = await createAndTrack();

    await Promise.all(
      Array.from({ length: 5 }, () => processAutoRules(client, personalScope(userId), TODAY)),
    );
    // ...and three more times afterwards, one by one.
    for (let i = 0; i < 3; i++) await processAutoRules(client, personalScope(userId), TODAY);

    const posted = await postedFor(id);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      occurred_on: TODAY,
      amount: 7000000,
      type: "expense",
      currency: "RSD",
    });

    const rule = (await listRules(client, personalScope(userId))).find((r) => r.id === id)!;
    expect(rule.nextRunOn).toBe("2026-11-12");
  }, 90000);

  it("catches up missed occurrences with their ORIGINAL dates, once each", async () => {
    const id = await createAndTrack({ startOn: "2026-07-12" });

    await Promise.all(
      Array.from({ length: 5 }, () => processAutoRules(client, personalScope(userId), TODAY)),
    );

    expect((await postedFor(id)).map((t) => t.occurred_on)).toEqual([
      "2026-07-12",
      "2026-08-12",
      "2026-09-12",
      "2026-10-12",
    ]);
  }, 90000);

  it("recovers from a crash between insert and advance without doubling", async () => {
    const id = await createAndTrack({ startOn: "2026-10-12" });
    await processAutoRules(client, personalScope(userId), TODAY);
    expect(await postedFor(id)).toHaveLength(1);

    // Simulate dying after the insert but before the rule was advanced.
    await admin
      .from("recurring_rules")
      .update({ next_run_on: TODAY })
      .eq("id", id);

    await processAutoRules(client, personalScope(userId), TODAY);
    expect(await postedFor(id)).toHaveLength(1); // not 2
    const rule = (await listRules(client, personalScope(userId))).find((r) => r.id === id)!;
    expect(rule.nextRunOn).toBe("2026-11-12"); // and it completed the advance
  }, 90000);

  it("a deleted auto-posted transaction is not re-created", async () => {
    const id = await createAndTrack({ startOn: "2026-10-12" });
    await processAutoRules(client, personalScope(userId), TODAY);

    await client
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("recurring_id", id);
    await admin.from("recurring_rules").update({ next_run_on: TODAY }).eq("id", id);

    await processAutoRules(client, personalScope(userId), TODAY);
    const posted = await postedFor(id);
    expect(posted).toHaveLength(1);
    expect(posted[0].deleted_at).not.toBeNull();
  }, 90000);

  it("does nothing before the date, and stops after end_on", async () => {
    const future = await createAndTrack({ startOn: "2026-11-01" });
    const ended = await createAndTrack({
      startOn: "2026-07-12",
      endOn: "2026-08-31",
    });
    await processAutoRules(client, personalScope(userId), TODAY);

    expect(await postedFor(future)).toHaveLength(0);
    expect((await postedFor(ended)).map((t) => t.occurred_on)).toEqual([
      "2026-07-12",
      "2026-08-12",
    ]);
  }, 90000);

  it("prompt rules are not auto-posted; post and skip each work exactly once", async () => {
    const post = await createAndTrack({ autoPost: false, startOn: "2026-10-12" });
    const skip = await createAndTrack({ autoPost: false, startOn: "2026-10-12" });

    await processAutoRules(client, personalScope(userId), TODAY);
    expect(await postedFor(post)).toHaveLength(0);

    const due = await listDue(client, personalScope(userId), TODAY);
    expect(due.map((d) => d.rule.id).sort()).toEqual([post, skip].sort());

    await postDueOccurrence(client, personalScope(userId), post, TODAY, TODAY);
    await skipDueOccurrence(client, personalScope(userId), skip, TODAY, TODAY);

    expect(await postedFor(post)).toHaveLength(1);
    expect(await postedFor(skip)).toHaveLength(0); // skipped = no transaction

    // A stale second click on either is rejected, not double-applied.
    await expect(postDueOccurrence(client, personalScope(userId), post, TODAY, TODAY)).rejects.toThrow(/already handled/);
    await expect(skipDueOccurrence(client, personalScope(userId), skip, TODAY, TODAY)).rejects.toThrow(/already handled/);
    expect(await postedFor(post)).toHaveLength(1);

    const stillDue = await listDue(client, personalScope(userId), TODAY);
    expect(stillDue.map((d) => d.rule.id)).not.toContain(post);
    expect(stillDue.map((d) => d.rule.id)).not.toContain(skip);
  }, 90000);

  it("handles prompt rules with several missed occurrences in order", async () => {
    const id = await createAndTrack({ autoPost: false, startOn: "2026-08-12" });
    const [item] = (await listDue(client, personalScope(userId), TODAY)).filter((d) => d.rule.id === id);
    expect(item.date).toBe("2026-08-12");
    expect(item.more).toBe(2);

    // Only the oldest can be acted on.
    await expect(postDueOccurrence(client, personalScope(userId), id, "2026-09-12", TODAY)).rejects.toThrow(/already handled/);
    await postDueOccurrence(client, personalScope(userId), id, "2026-08-12", TODAY);
    const [next] = (await listDue(client, personalScope(userId), TODAY)).filter((d) => d.rule.id === id);
    expect(next.date).toBe("2026-09-12");
  }, 90000);

  it("paused rules do not post, and resuming does not back-fill the pause", async () => {
    const id = await createAndTrack({ startOn: "2026-07-12" });
    await pauseRule(client, personalScope(userId), id);
    await processAutoRules(client, personalScope(userId), TODAY);
    expect(await postedFor(id)).toHaveLength(0);

    await resumeRule(client, personalScope(userId), id, TODAY);
    await processAutoRules(client, personalScope(userId), TODAY);
    // Resumed on Oct 12 itself: that day's occurrence posts, July-Sept do not.
    expect((await postedFor(id)).map((t) => t.occurred_on)).toEqual(["2026-10-12"]);
  }, 90000);

  it("transfers post as transfers (a card payment is not an expense)", async () => {
    const id = await createAndTrack({
      template: {
        type: "transfer",
        accountId: walletId,
        toAccountId: cardId,
        categoryId: null,
        amount: "500000",
        note: "Card payment",
        merchant: null,
      },
    });
    await processAutoRules(client, personalScope(userId), TODAY);
    const posted = await postedFor(id);
    expect(posted).toHaveLength(1);
    expect(posted[0].type).toBe("transfer");
  }, 90000);

  it("rejects a template naming another user's account or the wrong category kind", async () => {
    await expect(
      createRule(client, personalScope(userId), base({ template: { ...base().template, accountId: "00000000-0000-4000-8000-000000000000" } })),
    ).rejects.toThrow();
    const { data: income } = await client
      .from("categories")
      .insert({ user_id: userId, name: "Pay", kind: "income" })
      .select()
      .single();
    await expect(
      createRule(client, personalScope(userId), base({ template: { ...base().template, categoryId: income!.id } })),
    ).rejects.toThrow(/expense category/);
  }, 60000);

  it("a corrupt rule is skipped instead of breaking the pass", async () => {
    const bad = await admin
      .from("recurring_rules")
      .insert({
        user_id: userId,
        template: { type: "expense", accountId: "nope", amount: "-5" },
        frequency: "monthly",
        next_run_on: "2026-01-01",
        auto_post: true,
      })
      .select()
      .single();
    expect(bad.error).toBeNull();
    await expect(processAutoRules(client, personalScope(userId), TODAY)).resolves.toBeTypeOf("number");
    expect((await listRules(client, personalScope(userId))).some((r) => r.id === bad.data!.id)).toBe(false);
  }, 60000);

  it("soft-deleted rules vanish from the list and stop posting", async () => {
    const id = await createAndTrack({ startOn: "2026-10-12" });
    await deleteRule(client, personalScope(userId), id);
    await processAutoRules(client, personalScope(userId), TODAY);
    expect(await postedFor(id)).toHaveLength(0);
    expect((await listRules(client, personalScope(userId))).some((r) => r.id === id)).toBe(false);
  }, 60000);
});
