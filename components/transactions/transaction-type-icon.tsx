import {
  ArrowLeftRightIcon,
  CircleMinusIcon,
  CirclePlusIcon,
  EqualIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/db/accounts";
import type { AnyTransactionType } from "@/lib/db/transactions";

// A non-color signal for transaction type, so expense/income/transfer stay
// distinct for colorblind users too (deuteranopia/protanopia both make
// red vs. green text alone unreliable) - the shape carries the meaning,
// color is reinforcement, not the only channel.
const ICON_BY_TYPE: Record<AnyTransactionType, typeof CircleMinusIcon> = {
  expense: CircleMinusIcon,
  income: CirclePlusIcon,
  transfer: ArrowLeftRightIcon,
  adjustment: EqualIcon,
};

const AMOUNT_TONE_BY_TYPE = {
  expense: "expense",
  income: "income",
  transfer: "transfer",
  adjustment: "muted",
} as const;

/** The single source of truth for type -> color, shared by this icon and
 * by every <Amount tone=.../> that renders a transaction's signed value,
 * so the icon and the number it sits next to never disagree. */
export function transactionAmountTone(type: AnyTransactionType) {
  return AMOUNT_TONE_BY_TYPE[type];
}

const TEXT_TONE_CLASS = {
  expense: "text-expense",
  income: "text-income",
  transfer: "text-transfer",
  muted: "text-muted-foreground",
} as const;

/** For a transfer row, appends the destination account so the row shows
 * both legs of the movement ("Checking → Savings") - every list that shows
 * an account name shows only t.accountId (the source), which by itself
 * would leave half of what moved invisible. */
export function transferAccountLabel(
  sourceAccountName: string | undefined,
  type: AnyTransactionType,
  toAccountId: string | null,
  accountById: Map<string, Account>,
): string {
  const base = sourceAccountName ?? "Unknown account";
  if (type !== "transfer" || !toAccountId) return base;
  return `${base} → ${accountById.get(toAccountId)?.name ?? "Unknown account"}`;
}

export function TransactionTypeIcon({
  type,
  className,
}: {
  type: AnyTransactionType;
  className?: string;
}) {
  const Icon = ICON_BY_TYPE[type];
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0",
        TEXT_TONE_CLASS[transactionAmountTone(type)],
        className,
      )}
    />
  );
}
