import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { toDbAmount } from "@/lib/money";
import {
  anchorDayFor,
  dueOccurrences,
  firstOccurrenceFrom,
  isEnded,
  nextOccurrence,
  parseTemplate,
  type Frequency,
  type RuleTemplate,
  type Schedule,
} from "@/lib/recurring";

export type RecurringRule = {
  id: string;
  template: RuleTemplate;
  frequency: Frequency;
  interval: number;
  dayOfMonth: number | null;
  nextRunOn: string;
  endOn: string | null;
  autoPost: boolean;
  paused: boolean;
};

export type RuleInput = {
  template: RuleTemplate;
  frequency: Frequency;
  interval: number;
  /** First occurrence. A date in the past back-fills the missed ones. */
  startOn: string;
  endOn: string | null;
  autoPost: boolean;
};

type RuleRow = Database["public"]["Tables"]["recurring_rules"]["Row"];

const FREQ: readonly string[] = ["daily", "weekly", "monthly", "yearly"];

export function scheduleOf(rule: RecurringRule): Schedule {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    dayOfMonth: rule.dayOfMonth,
  };
}

/** Rows whose template or frequency is corrupt come back as null and are
 * skipped by callers - a bad rule must never post garbage or break a page. */
function toRule(row: RuleRow): RecurringRule | null {
  const template = parseTemplate(row.template);
  if (!template || !FREQ.includes(row.frequency)) return null;
  return {
    id: row.id,
    template,
    frequency: row.frequency as Frequency,
    interval: row.interval,
    dayOfMonth: row.day_of_month,
    nextRunOn: row.next_run_on,
    endOn: row.end_on,
    autoPost: row.auto_post,
    paused: row.paused_at !== null,
  };
}

function templateToJson(t: RuleTemplate): Json {
  return {
    type: t.type,
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    categoryId: t.categoryId,
    amount: t.amount,
    note: t.note,
    merchant: t.merchant,
  };
}

/** All of the user's rules (paused included), soonest first. */
export async function listRules(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RecurringRule[]> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("next_run_on", { ascending: true });
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const rule = toRule(row);
    return rule ? [rule] : [];
  });
}

async function getRule(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
): Promise<RecurringRule> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  const rule = toRule(data);
  if (!rule) throw new Error("This recurring rule is malformed.");
  return rule;
}

async function assertTemplateOwnership(
  supabase: SupabaseClient<Database>,
  userId: string,
  t: RuleTemplate,
): Promise<void> {
  const ids = [t.accountId, ...(t.toAccountId ? [t.toAccountId] : [])];
  const { data, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  if ((data ?? []).length !== new Set(ids).size) {
    throw new Error("Account not found.");
  }
  if (t.categoryId) {
    const { data: cat, error: catError } = await supabase
      .from("categories")
      .select("kind")
      .eq("id", t.categoryId)
      .eq("user_id", userId)
      .single();
    if (catError) throw catError;
    if (cat.kind !== t.type) {
      throw new Error(`Choose an ${t.type} category.`);
    }
  }
}

export async function createRule(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: RuleInput,
): Promise<void> {
  await assertTemplateOwnership(supabase, userId, input.template);
  const { error } = await supabase.from("recurring_rules").insert({
    user_id: userId,
    template: templateToJson(input.template),
    frequency: input.frequency,
    interval: input.interval,
    day_of_month: anchorDayFor(input.frequency, input.startOn),
    next_run_on: input.startOn,
    end_on: input.endOn,
    auto_post: input.autoPost,
  });
  if (error) throw error;
}

/**
 * Edits a rule. `startOn` here is the NEXT occurrence. Past occurrences
 * already in the ledger are history and are never touched, so editing the
 * amount affects only what posts from now on.
 */
export async function updateRule(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
  input: RuleInput,
): Promise<void> {
  await assertTemplateOwnership(supabase, userId, input.template);
  const { error } = await supabase
    .from("recurring_rules")
    .update({
      template: templateToJson(input.template),
      frequency: input.frequency,
      interval: input.interval,
      day_of_month: anchorDayFor(input.frequency, input.startOn),
      next_run_on: input.startOn,
      end_on: input.endOn,
      auto_post: input.autoPost,
    })
    .eq("id", ruleId)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function pauseRule(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
): Promise<void> {
  const { error } = await supabase
    .from("recurring_rules")
    .update({ paused_at: new Date().toISOString() })
    .eq("id", ruleId)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
}

/** Resuming skips ahead to the next occurrence from today: the period the
 * rule sat paused is deliberately NOT back-filled. */
export async function resumeRule(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
  todayIso: string,
): Promise<void> {
  const rule = await getRule(supabase, userId, ruleId);
  const nextRunOn = firstOccurrenceFrom(rule.nextRunOn, scheduleOf(rule), todayIso);
  const { error } = await supabase
    .from("recurring_rules")
    .update({ paused_at: null, next_run_on: nextRunOn })
    .eq("id", ruleId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteRule(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
): Promise<void> {
  const { error } = await supabase
    .from("recurring_rules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", ruleId)
    .eq("user_id", userId);
  if (error) throw error;
}

// --- posting --------------------------------------------------------------

const UNIQUE_VIOLATION = "23505";

/** Moves next_run_on past `date`, but only if it is still `date`: a
 * compare-and-swap, so of several concurrent callers exactly one advances
 * the rule and the rest are harmless no-ops. */
async function advance(
  supabase: SupabaseClient<Database>,
  userId: string,
  rule: RecurringRule,
  date: string,
): Promise<void> {
  const { error } = await supabase
    .from("recurring_rules")
    .update({ next_run_on: nextOccurrence(date, scheduleOf(rule)) })
    .eq("id", rule.id)
    .eq("user_id", userId)
    .eq("next_run_on", date);
  if (error) throw error;
}

/**
 * Posts one occurrence of a rule. Idempotent by construction:
 *   1. INSERT the transaction. The unique index on (recurring_id,
 *      occurred_on) makes a second insert for the same occurrence fail with
 *      23505 - treated as "already posted", not an error.
 *   2. Advance next_run_on with a compare-and-swap.
 * If the process dies between 1 and 2, the next pass re-runs step 1 (a
 * no-op) and completes step 2, so an occurrence is never lost or doubled.
 */
async function postOccurrence(
  supabase: SupabaseClient<Database>,
  userId: string,
  rule: RecurringRule,
  date: string,
  currency: string,
): Promise<void> {
  const t = rule.template;
  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    type: t.type,
    account_id: t.accountId,
    to_account_id: t.toAccountId,
    category_id: t.categoryId,
    amount: toDbAmount(BigInt(t.amount)),
    currency,
    occurred_on: date,
    note: t.note,
    merchant: t.merchant,
    recurring_id: rule.id,
  });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
  await advance(supabase, userId, rule, date);
}

async function accountCurrency(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", accountId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data.currency;
}

/**
 * Posts everything that is due for auto-post rules, as of `todayIso`.
 * Safe to call on every page load and from many requests at once. A rule
 * that fails (e.g. its account was deleted) is skipped so it can't take
 * the page down with it; the error is logged. Returns how many rules were
 * attempted, for tests.
 */
export async function processAutoRules(
  supabase: SupabaseClient<Database>,
  userId: string,
  todayIso: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("auto_post", true)
    .is("paused_at", null)
    .is("deleted_at", null)
    .lte("next_run_on", todayIso);
  if (error) throw error;

  let attempted = 0;
  for (const row of data ?? []) {
    const rule = toRule(row);
    if (!rule) continue;
    const { dates } = dueOccurrences(
      rule.nextRunOn,
      scheduleOf(rule),
      rule.endOn,
      todayIso,
    );
    if (dates.length === 0) continue;
    attempted++;

    try {
      const currency = await accountCurrency(supabase, userId, rule.template.accountId);
      for (const date of dates) {
        await postOccurrence(supabase, userId, rule, date, currency);
      }
    } catch (err) {
      console.error(`recurring rule ${rule.id} failed to post`, err);
    }
  }
  return attempted;
}

export type DueItem = {
  rule: RecurringRule;
  /** The oldest unhandled occurrence; the only one that can be acted on. */
  date: string;
  /** Further occurrences waiting behind it. */
  more: number;
};

/** Prompt-mode (auto_post = false) rules with something due. One item per
 * rule - its oldest occurrence - because they must be handled in order. */
export async function listDue(
  supabase: SupabaseClient<Database>,
  userId: string,
  todayIso: string,
): Promise<DueItem[]> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("auto_post", false)
    .is("paused_at", null)
    .is("deleted_at", null)
    .lte("next_run_on", todayIso)
    .order("next_run_on", { ascending: true });
  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const rule = toRule(row);
    if (!rule) return [];
    const { dates } = dueOccurrences(rule.nextRunOn, scheduleOf(rule), rule.endOn, todayIso);
    return dates.length === 0
      ? []
      : [{ rule, date: dates[0], more: dates.length - 1 }];
  });
}

/** Confirms `date` is the rule's current oldest due occurrence. Guards
 * against acting on a stale screen (already posted from another tab). */
async function loadDueOccurrence(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
  date: string,
  todayIso: string,
): Promise<RecurringRule> {
  const rule = await getRule(supabase, userId, ruleId);
  if (
    rule.paused ||
    rule.nextRunOn !== date ||
    date > todayIso ||
    isEnded(date, rule.endOn)
  ) {
    throw new Error("This occurrence was already handled. Refresh to see what is due.");
  }
  return rule;
}

export async function postDueOccurrence(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
  date: string,
  todayIso: string,
): Promise<void> {
  const rule = await loadDueOccurrence(supabase, userId, ruleId, date, todayIso);
  const currency = await accountCurrency(supabase, userId, rule.template.accountId);
  await postOccurrence(supabase, userId, rule, date, currency);
}

/** Skips an occurrence: moves on without writing a transaction. */
export async function skipDueOccurrence(
  supabase: SupabaseClient<Database>,
  userId: string,
  ruleId: string,
  date: string,
  todayIso: string,
): Promise<void> {
  const rule = await loadDueOccurrence(supabase, userId, ruleId, date, todayIso);
  await advance(supabase, userId, rule, date);
}
