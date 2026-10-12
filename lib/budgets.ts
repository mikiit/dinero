import { getDaysInMonth, parseISO } from "date-fns";

// Pure budget maths. Money is bigint minor units throughout; percentages are
// integer basis points (see lib/reports.ts).

export type BudgetStatus = "ok" | "warning" | "over";

export type BudgetProgress = {
  budget: bigint;
  spent: bigint;
  /** budget - spent; negative when over budget. */
  remaining: bigint;
  /** spent / budget in basis points (uncapped - 12000 = 120%); null when the
   * budget is zero, where a ratio is meaningless. */
  percentBp: number | null;
  status: BudgetStatus;
  /** What you can still spend per day for the rest of the month, today
   * included. Only for the current month and only while money remains. */
  perDay: bigint | null;
};

/** At or above this share of the budget, a category is "warning". */
const WARNING_BP = 8000;

export function budgetProgress(
  budget: bigint,
  spent: bigint,
  ctx: { monthStartIso: string; todayIso: string },
): BudgetProgress {
  const remaining = budget - spent;
  const percentBp = budget > 0n ? Number((spent * 10000n) / budget) : null;

  let status: BudgetStatus = "ok";
  if (spent > budget) status = "over";
  else if (percentBp !== null && percentBp >= WARNING_BP) status = "warning";

  let perDay: bigint | null = null;
  const inThisMonth = ctx.todayIso.slice(0, 7) === ctx.monthStartIso.slice(0, 7);
  if (inThisMonth && remaining > 0n) {
    const dayOfMonth = Number(ctx.todayIso.slice(8, 10));
    const daysLeft = getDaysInMonth(parseISO(ctx.monthStartIso)) - dayOfMonth + 1;
    perDay = remaining / BigInt(Math.max(daysLeft, 1));
  }

  return { budget, spent, remaining, percentBp, status, perDay };
}
