"use client";

import { useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Amount } from "@/components/ui/amount";
import { toDecimalString, toMinor } from "@/lib/money";
import type { Account } from "@/lib/db/accounts";
import { setAccountBalanceAction } from "@/app/accounts/actions";

export function SetBalanceDialog({ account }: { account: Account }) {
  const isCredit = account.type === "credit";
  const displayedCurrent = isCredit ? -account.balance : account.balance;

  const [open, setOpen] = useState(false);
  const [amountInput, setAmountInput] = useState(() =>
    toDecimalString(displayedCurrent),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setAmountInput(toDecimalString(displayedCurrent));
    setError(null);
  }

  let parsedTarget: bigint | null = null;
  let parseError: string | null = null;
  if (amountInput.trim() !== "") {
    try {
      const raw = toMinor(amountInput);
      parsedTarget = isCredit ? -raw : raw;
    } catch {
      parseError = "Enter a valid amount.";
    }
  }

  const delta = parsedTarget !== null ? parsedTarget - account.balance : null;
  const isNoOp = delta === 0n;

  function handleConfirm() {
    if (parsedTarget === null || delta === null || isNoOp) return;
    setError(null);
    startTransition(async () => {
      const result = await setAccountBalanceAction({
        accountId: account.id,
        targetBalance: toDecimalString(parsedTarget!),
      });
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        Set balance
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Set balance for {account.name}</SheetTitle>
          <SheetDescription>
            {isCredit
              ? "Enter what you currently owe. This writes a single adjustment for the difference - opening balance is never changed."
              : "Enter the account's current balance. This writes a single adjustment for the difference - opening balance is never changed."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
          <div className="space-y-1.5">
            <Label htmlFor="targetBalance">
              {isCredit ? "Owed" : "Balance"} (RSD)
            </Label>
            <Input
              id="targetBalance"
              inputMode="decimal"
              autoFocus
              className="font-mono tabular-nums"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
          </div>

          {parseError && (
            <p className="text-sm text-destructive">{parseError}</p>
          )}

          {!parseError &&
            parsedTarget !== null &&
            delta !== null &&
            (isNoOp ? (
              <p className="text-sm text-muted-foreground">
                Already at this balance — no change needed.
              </p>
            ) : (
              <div className="space-y-1.5 rounded-lg bg-muted p-3 text-sm">
                <p className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current</span>
                  <Amount value={displayedCurrent} size="sm" tone="neutral" />
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-muted-foreground">New</span>
                  <Amount
                    value={isCredit ? -parsedTarget : parsedTarget}
                    size="sm"
                    tone="neutral"
                  />
                </p>
                <p className="flex items-center justify-between font-medium">
                  <span>Adjustment</span>
                  <Amount
                    value={isCredit ? -delta : delta}
                    size="sm"
                    // Tone reflects whether the account's true balance
                    // improves (delta > 0), not the displayed sign - for a
                    // credit card, Owed going DOWN is good news even
                    // though it's shown as a negative adjustment here.
                    tone={delta > 0n ? "income" : "expense"}
                    showSign
                  />
                </p>
              </div>
            ))}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <SheetFooter>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending || parsedTarget === null || isNoOp || !!parseError}
          >
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
