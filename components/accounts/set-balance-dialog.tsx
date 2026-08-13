"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRSD, toDecimalString, toMinor } from "@/lib/money";
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Set balance
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set balance for {account.name}</DialogTitle>
          <DialogDescription>
            {isCredit
              ? "Enter what you currently owe. This writes a single adjustment for the difference - opening balance is never changed."
              : "Enter the account's current balance. This writes a single adjustment for the difference - opening balance is never changed."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="targetBalance">
              {isCredit ? "Owed" : "Balance"} (RSD)
            </Label>
            <Input
              id="targetBalance"
              inputMode="decimal"
              autoFocus
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
              <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
                <p>Current: {formatRSD(displayedCurrent)}</p>
                <p>
                  New: {formatRSD(isCredit ? -parsedTarget : parsedTarget)}
                </p>
                <p className="font-medium">
                  Adjustment:{" "}
                  {(isCredit ? -delta : delta) > 0n ? "+" : ""}
                  {formatRSD(isCredit ? -delta : delta)}
                </p>
              </div>
            ))}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending || parsedTarget === null || isNoOp || !!parseError}
          >
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
