"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteAccountAction } from "@/app/settings/actions";

/** Erases the account and all of its data. Hard to do by accident: it takes
 * opening the dialog and typing a word, and it says exactly what goes. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction(confirmation);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Full reload: nothing of the old account may linger in memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Not while it is running: closing would hide the outcome.
        if (pending) return;
        setOpen(next);
        if (!next) {
          setConfirmation("");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        Delete my account
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently erases your login and everything in your personal
            ledger: accounts, transactions, categories, budgets, recurring
            rules and receipt photos. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            In a shared space, what you added stays with the space for the
            people who still use it, and you leave it. If you are the only
            owner of a space with other people in it, hand it over first.
          </p>
          <p>
            Want a copy first?{" "}
            {/* Plain anchor: a file download, not a page. */}
            <a href="/api/export/transactions" download className="underline underline-offset-4">
              Export your transactions (CSV)
            </a>
            .
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="deleteConfirm">Type DELETE to confirm</Label>
            <Input
              id="deleteConfirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              disabled={pending}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending || confirmation.trim().toUpperCase() !== "DELETE"}
          >
            {pending ? "Deleting…" : "Delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
