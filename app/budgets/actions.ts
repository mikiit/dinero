"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  clearBudget,
  copyPreviousMonthBudgets,
  setBudget,
} from "@/lib/db/budgets";
import { toMinor } from "@/lib/money";

export type BudgetActionResult = { error?: string; added?: number };

const MONTH_START = /^\d{4}-(0[1-9]|1[0-2])-01$/;

async function currentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/** Empty amount clears the budget; anything else sets it. */
export async function setBudgetAction(
  categoryId: string,
  monthStartIso: string,
  amountText: string,
): Promise<BudgetActionResult> {
  if (!MONTH_START.test(monthStartIso)) return { error: "Invalid month." };

  try {
    const { supabase, userId } = await currentUserId();
    if (!userId) return { error: "Not signed in." };

    if (amountText.trim() === "") {
      await clearBudget(supabase, userId, categoryId, monthStartIso);
    } else {
      let amount: bigint;
      try {
        amount = toMinor(amountText);
      } catch {
        return { error: "Enter an amount like 15000 or 15000,50." };
      }
      await setBudget(supabase, userId, categoryId, monthStartIso, amount);
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
): Promise<BudgetActionResult> {
  if (!MONTH_START.test(monthStartIso)) return { error: "Invalid month." };

  try {
    const { supabase, userId } = await currentUserId();
    if (!userId) return { error: "Not signed in." };
    const added = await copyPreviousMonthBudgets(supabase, userId, monthStartIso);
    revalidatePath("/budgets");
    revalidatePath("/reports");
    return { added };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not copy." };
  }
}
