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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fromMinor } from "@/lib/money";
import type { Account, AccountType } from "@/lib/db/accounts";
import { createAccountAction, updateAccountAction } from "@/app/accounts/actions";
import { CURRENCIES, toCurrency, type Currency } from "@/lib/currency";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  debit: "Debit card",
  credit: "Credit card",
  savings: "Savings",
};

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];

export function AccountDialog({ account }: { account?: Account }) {
  const isEdit = account !== undefined;
  const action = isEdit ? updateAccountAction : createAccountAction;

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AccountType>(account?.type ?? "cash");
  const [currency, setCurrency] = useState<Currency>(
    toCurrency(account?.currency),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action({ status: "idle" }, formData);
      if (result.status === "error") {
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
        if (!next) {
          setType(account?.type ?? "cash");
          setCurrency(toCurrency(account?.currency));
          setError(null);
        }
      }}
    >
      <SheetTrigger
        render={
          isEdit ? <Button variant="outline" size="sm" /> : <Button size="sm" />
        }
      >
        {isEdit ? "Edit" : "Add account"}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit ${account.name}` : "Add account"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this account's details."
              : "Cash, a debit card, a credit card, or a savings account."}
          </SheetDescription>
        </SheetHeader>

        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
          {isEdit && <input type="hidden" name="accountId" value={account.id} />}

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={account?.name}
              placeholder="Intesa Visa"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="type">Type</Label>
            {isEdit ? (
              <>
                {/* Immutable after creation (also enforced by a DB trigger) -
                    carried through as a hidden field so the action can still
                    tell whether the credit-only fields below apply. */}
                <input type="hidden" name="type" value={type} />
                <p className="text-sm text-muted-foreground">
                  {ACCOUNT_TYPE_LABELS[type]}
                </p>
              </>
            ) : (
              <Select
                name="type"
                value={type}
                onValueChange={(value) => setType(value as AccountType)}
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue>
                    {(value: AccountType) => ACCOUNT_TYPE_LABELS[value]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            {isEdit ? (
              <p className="text-sm text-muted-foreground">
                {currency}
                <span className="block text-xs">
                  Fixed once the account exists. To use another currency, add a new
                  account.
                </span>
              </p>
            ) : (
              <Select
                name="currency"
                value={currency}
                onValueChange={(value) => setCurrency(value as Currency)}
              >
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue>{(value: Currency) => value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="openingBalance">Opening balance ({currency})</Label>
              <Input
                id="openingBalance"
                name="openingBalance"
                inputMode="decimal"
                placeholder="0"
                className="font-mono tabular-nums"
                defaultValue="0"
              />
            </div>
          )}

          {type === "credit" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="creditLimit">Credit limit ({currency})</Label>
                <Input
                  id="creditLimit"
                  name="creditLimit"
                  inputMode="decimal"
                  placeholder="0"
                  className="font-mono tabular-nums"
                  defaultValue={
                    account?.creditLimit != null
                      ? fromMinor(account.creditLimit).toString()
                      : ""
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="statementDay">Statement day</Label>
                  <Input
                    id="statementDay"
                    name="statementDay"
                    type="number"
                    min={1}
                    max={28}
                    defaultValue={account?.statementDay ?? undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dueDay">Due day</Label>
                  <Input
                    id="dueDay"
                    name="dueDay"
                    type="number"
                    min={1}
                    max={28}
                    defaultValue={account?.dueDay ?? undefined}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="includeInNetWorth">Include in net worth</Label>
            <Switch
              id="includeInNetWorth"
              name="includeInNetWorth"
              defaultChecked={account?.includeInNetWorth ?? true}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : isEdit ? "Save changes" : "Add account"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
