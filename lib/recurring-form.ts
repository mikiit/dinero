import { toDecimalString } from "@/lib/money";
import type { Frequency } from "@/lib/recurring";
import type { RuleFormValues } from "@/components/recurring/recurring-manager";

/** Pre-fills the rule form from a stored rule. Lives outside the client
 * component so server pages can call it. */
export function formValuesForRule(args: {
  type: RuleFormValues["type"];
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  amountMinor: string;
  note: string | null;
  nextRunOn: string;
  frequency: Frequency;
  interval: number;
  endOn: string | null;
  autoPost: boolean;
}): RuleFormValues {
  return {
    type: args.type,
    accountId: args.accountId,
    toAccountId: args.toAccountId ?? "",
    categoryId: args.categoryId ?? "",
    amount: toDecimalString(BigInt(args.amountMinor)),
    occurredOn: args.nextRunOn,
    note: args.note ?? "",
    frequency: args.frequency,
    interval: String(args.interval),
    endOn: args.endOn ?? "",
    autoPost: args.autoPost,
  };
}
