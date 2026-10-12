"use server";

import { revalidatePath } from "next/cache";
import { requireWriteContext } from "@/lib/context";
import {
  clearBudget,
  copyPreviousMonthBudgets,
  setBudget,
} from "@/lib/db/budgets";
import { isCurrency } from "@/lib/currency";
import { toMinor } from "@/lib/money";

export type BudgetActionResult = { error?: string; added?: number };

const MONTH_START = /^\d{4}-(0[1-9]|1[0-2])-01$/;

/** Empty amount clears the budget; anything else sets it. */
export async function setBudgetAction(
  categoryId: string,
  monthStartIso: string,
  currency: string,
  amountText: string,
): Promise<BudgetActionResult> {
  if (!MONTH_START.test(monthStartIso)) return { error: "Invalid month." };
  if (!isCurrency(currency)) return { error: "Unknown currency." };

  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;

    if (amountText.trim() === "") {
      await clearBudget(supabase, scope, categoryId, monthStartIso, currency);
    } else {
      let amount: bigint;
      try {
        amount = toMinor(amountText);
      } catch {
        return { error: "Enter an amount like 15000 or 15000,50." };
      }
      await setBudget(supabase, scope, categoryId, monthStartIso, currency, amount);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }

  revalidatePath("/budgets");
  revalidatePath("/reports");
  return {};
}

export async function copyBudgetsAction(
  monthStartIso: string,
  currency: string,
): Promise<BudgetActionResult> {
  if (!MONTH_START.test(monthStartIso)) return { error: "Invalid month." };
  if (!isCurrency(currency)) return { error: "Unknown currency." };

  try {
    const gate = await requireWriteContext();
    if (!gate.ctx) return { error: gate.error };
    const { supabase, scope } = gate.ctx;
    const added = await copyPreviousMonthBudgets(supabase, scope, monthStartIso, currency);
    revalidatePath("/budgets");
    revalidatePath("/reports");
    return { added };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not copy." };
  }
}
