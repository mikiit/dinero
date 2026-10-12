"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { PlusIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Amount } from "@/components/ui/amount";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FREQUENCIES, type Frequency } from "@/lib/recurring";
import type { Account } from "@/lib/db/accounts";
import type { Category } from "@/lib/db/categories";
import {
  TransactionFormFields,
  type TransactionFormState,
} from "@/components/transactions/transaction-form-fields";
import {
  deleteRuleAction,
  saveRuleAction,
  setRulePausedAction,
} from "@/app/recurring/actions";
import { cn } from "@/lib/utils";
import { DEFAULT_CURRENCY } from "@/lib/currency";

export type RuleItem = {
  id: string;
  title: string;
  type: "expense" | "income" | "transfer";
  /** Minor units, as a string (no bigint across the RSC boundary). */
  amount: string;
  currency: string;
  accountName: string;
  toAccountName: string | null;
  scheduleText: string;
  nextRunOn: string;
  endOn: string | null;
  autoPost: boolean;
  paused: boolean;
  ended: boolean;
  form: RuleFormValues;
};

export type RuleFormValues = TransactionFormState & {
  frequency: Frequency;
  interval: string;
  endOn: string;
  autoPost: boolean;
};

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Day",
  weekly: "Week",
  monthly: "Month",
  yearly: "Year",
};

function emptyValues(accounts: Account[], today: string): RuleFormValues {
  return {
    type: "expense",
    accountId: accounts[0]?.id ?? "",
    toAccountId: "",
    categoryId: "",
    amount: "",
    occurredOn: today,
    note: "",
    frequency: "monthly",
    interval: "1",
    endOn: "",
    autoPost: false,
  };
}

function RuleForm({
  initial,
  ruleId,
  accounts,
  categories,
  onDone,
}: {
  initial: RuleFormValues;
  ruleId: string | null;
  accounts: Account[];
  categories: Category[];
  onDone: () => void;
}) {
  const [form, setForm] = useState<RuleFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveRuleAction({
        id: ruleId ?? undefined,
        type: form.type,
        accountId: form.accountId,
        toAccountId: form.toAccountId,
        categoryId: form.categoryId,
        amount: form.amount,
        note: form.note,
        startOn: form.occurredOn,
        frequency: form.frequency,
        interval: Number(form.interval),
        endOn: form.endOn,
        autoPost: form.autoPost,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <>
      <TransactionFormFields
        state={form}
        onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
        accounts={accounts}
        categories={categories}
        dateLabel={ruleId ? "Next date" : "First date"}
        sameCurrencyTransfersOnly
      >
        <div className="space-y-1.5">
          <Label htmlFor="interval">Repeat every</Label>
          <div className="flex gap-2">
            <Input
              id="interval"
              type="number"
              min={1}
              max={365}
              inputMode="numeric"
              className="w-20 font-mono"
              value={form.interval}
              onChange={(e) => setForm((p) => ({ ...p, interval: e.target.value }))}
            />
            <Select
              value={form.frequency}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, frequency: v as Frequency }))
              }
            >
              <SelectTrigger className="flex-1" aria-label="Repeat unit">
                <SelectValue>
                  {(value: string) => {
                    const unit = FREQUENCY_LABELS[value as Frequency] ?? value;
                    return form.interval === "1" ? unit : `${unit}s`;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                    {form.interval === "1" ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!ruleId && (
            <p className="text-xs text-muted-foreground">
              If the first date is in the past, the missed occurrences are
              posted with their original dates.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="endOn">Ends on (optional)</Label>
          <Input
            id="endOn"
            type="date"
            value={form.endOn}
            onChange={(e) => setForm((p) => ({ ...p, endOn: e.target.value }))}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="autoPost">Post automatically</Label>
            <p className="text-xs text-muted-foreground">
              On: added to your ledger on its date. Off: shown on Home for you
              to post or skip.
            </p>
          </div>
          <Switch
            id="autoPost"
            checked={form.autoPost}
            onCheckedChange={(checked) =>
              setForm((p) => ({ ...p, autoPost: checked }))
            }
          />
        </div>
      </TransactionFormFields>

      {/* Outside the scrolling fields on purpose: with this many fields an
          error rendered inside them lands below the fold, unseen. */}
      {error && (
        <p role="alert" className="px-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <SheetFooter className="flex-row">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onDone}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="button" className="flex-1" onClick={submit} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </>
  );
}

function RuleRow({
  rule,
  onEdit,
  readOnly,
}: {
  rule: RuleItem;
  onEdit: () => void;
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const status = rule.ended
    ? "Ended"
    : rule.paused
      ? "Paused"
      : `Next ${format(parseISO(rule.nextRunOn), "d MMM yyyy")}`;

  return (
    <li className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate text-sm font-medium", (rule.paused || rule.ended) && "text-muted-foreground")}>
            {rule.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {rule.accountName}
            {rule.toAccountName ? ` → ${rule.toAccountName}` : ""}
          </p>
        </div>
        <Amount
          value={BigInt(rule.amount)}
          currency={rule.currency}
          size="sm"
          tone={rule.type === "income" ? "income" : rule.type === "expense" ? "expense" : "transfer"}
          showUnit={rule.currency !== DEFAULT_CURRENCY}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {rule.scheduleText} · {status} ·{" "}
        {rule.autoPost ? "posts automatically" : "asks you first"}
      </p>

      {!readOnly && (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={isPending}>
          Edit
        </Button>
        {!rule.ended && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => setRulePausedAction(rule.id, !rule.paused))}
          >
            {rule.paused ? "Resume" : "Pause"}
          </Button>
        )}
        {confirmDelete ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => deleteRuleAction(rule.id))}
            >
              Delete rule
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>
      )}
      {confirmDelete && (
        <p className="text-xs text-muted-foreground">
          Transactions this rule already posted stay in your ledger.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

export function RecurringManager({
  rules,
  accounts,
  categories,
  today,
  readOnly = false,
}: {
  rules: RuleItem[];
  accounts: Account[];
  categories: Category[];
  today: string;
  readOnly?: boolean;
}) {
  // null = closed, "new" = creating, otherwise the rule being edited.
  const [editing, setEditing] = useState<RuleItem | "new" | null>(null);

  const initial: RuleFormValues | null =
    editing === "new"
      ? emptyValues(accounts, today)
      : editing
        ? editing.form
        : null;

  return (
    <div className="space-y-4">
      {readOnly ? null : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add an account before creating a recurring rule.
        </p>
      ) : (
        <Button size="sm" onClick={() => setEditing("new")}>
          <PlusIcon /> New rule
        </Button>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recurring rules yet. Use them for rent, subscriptions and salary,
          the entries that repeat every month.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onEdit={() => setEditing(rule)}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>
              {editing === "new" ? "New recurring rule" : "Edit recurring rule"}
            </SheetTitle>
            <SheetDescription>
              {editing === "new"
                ? "An entry that repeats on a schedule."
                : "Changes apply to future occurrences only; what was already posted stays as it is."}
            </SheetDescription>
          </SheetHeader>
          {initial && (
            <RuleForm
              // Remount per rule so the form never shows another rule's values.
              key={editing === "new" ? "new" : (editing as RuleItem).id}
              initial={initial}
              ruleId={editing === "new" ? null : (editing as RuleItem).id}
              accounts={accounts}
              categories={categories}
              onDone={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
