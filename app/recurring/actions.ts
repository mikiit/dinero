"use server";

import { revalidatePath } from "next/cache";
import { requireWriteContext } from "@/lib/context";
import {
  createRule,
  deleteRule,
  pauseRule,
  postDueOccurrence,
  resumeRule,
  skipDueOccurrence,
  updateRule,
} from "@/lib/db/recurring";
import { toMinor } from "@/lib/money";
import {
  FREQUENCIES,
  todayInAppTimeZone,
  type Frequency,
  type TemplateType,
} from "@/lib/recurring";

export type RecurringActionResult = { error?: string };

export type SaveRuleInput = {
  /** Present when editing. */
  id?: string;
  type: TemplateType;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  /** Raw decimal string ("70000", "70000,50"); parsed here. */
  amount: string;
  note: string;
  /** First occurrence (create) or next occurrence (edit). */
  startOn: string;
  frequency: Frequency;
  interval: number;
  /** Empty string = never ends. */
  endOn: string;
  autoPost: boolean;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export async function saveRuleAction(
  input: SaveRuleInput,
): Promise<RecurringActionResult> {
  if (!["expense", "income", "transfer"].includes(input.type)) {
    return { error: "Invalid type." };
  }
  if (!FREQUENCIES.includes(input.frequency)) return { error: "Invalid frequency." };
  if (!Number.isInteger(input.interval) || input.interval < 1 || input.interval > 365) {
    return { error: "Repeat interval must be a whole number between 1 and 365." };
  }
  if (!DATE.test(input.startOn)) return { error: "Choose a date." };
  if (input.endOn !== "" && !DATE.test(input.endOn)) return { error: "Invalid end date." };
  if (input.endOn !== "" && input.endOn < input.startOn) {
    return { error: "The end date is before the next date." };
  }

  let amount: bigint;
  try {
    amount = toMinor(input.amount);
  } catch {
    return { error: "Enter a valid amount." };
  }
  if (amount <= 0n) return { error: "Enter an amount greater than zero." };

  if (input.type === "transfer") {
    if (!input.toAccountId) return { error: "Choose a destination account." };
    if (input.toAccountId === input.accountId) {
      return { error: "Choose two different accounts." };
    }
  } else if (!input.categoryId) {
    return { error: "Choose a category." };
  }

  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;

    const rule = {
      template: {
        type: input.type,
        accountId: input.accountId,
        toAccountId: input.type === "transfer" ? input.toAccountId : null,
        categoryId: input.type === "transfer" ? null : input.categoryId,
        amount: amount.toString(),
        note: input.note.trim() === "" ? null : input.note.trim(),
        merchant: null,
      },
      frequency: input.frequency,
      interval: input.interval,
      startOn: input.startOn,
      endOn: input.endOn === "" ? null : input.endOn,
      autoPost: input.autoPost,
    };

    if (input.id) await updateRule(supabase, scope, input.id, rule);
    else await createRule(supabase, scope, rule);
  } catch (err) {
    return { error: message(err, "Could not save the rule.") };
  }

  revalidatePath("/", "layout");
  return {};
}

export async function setRulePausedAction(
  ruleId: string,
  paused: boolean,
): Promise<RecurringActionResult> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;
    if (paused) await pauseRule(supabase, scope, ruleId);
    else await resumeRule(supabase, scope, ruleId, todayInAppTimeZone());
  } catch (err) {
    return { error: message(err, "Could not update the rule.") };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function deleteRuleAction(
  ruleId: string,
): Promise<RecurringActionResult> {
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;
    await deleteRule(supabase, scope, ruleId);
  } catch (err) {
    return { error: message(err, "Could not delete the rule.") };
  }
  revalidatePath("/", "layout");
  return {};
}

/** Home's "Due" card: post or skip the oldest due occurrence of a rule. */
export async function resolveDueAction(
  ruleId: string,
  date: string,
  decision: "post" | "skip",
): Promise<RecurringActionResult> {
  if (!DATE.test(date)) return { error: "Invalid date." };
  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;
    const today = todayInAppTimeZone();
    if (decision === "post") {
      await postDueOccurrence(supabase, scope, ruleId, date, today);
    } else {
      await skipDueOccurrence(supabase, scope, ruleId, date, today);
    }
  } catch (err) {
    return { error: message(err, "Could not complete that.") };
  }
  revalidatePath("/", "layout");
  return {};
}
