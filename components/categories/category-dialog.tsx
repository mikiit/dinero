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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category, CategoryKind } from "@/lib/db/categories";
import { createCategoryAction, updateCategoryAction } from "@/app/categories/actions";

const KIND_LABELS: Record<CategoryKind, string> = {
  expense: "Expense",
  income: "Income",
};

const CATEGORY_KINDS = Object.keys(KIND_LABELS) as CategoryKind[];

export function CategoryDialog({
  category,
  allCategories,
}: {
  category?: Category;
  allCategories: Category[];
}) {
  const isEdit = category !== undefined;
  const action = isEdit ? updateCategoryAction : createCategoryAction;

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? "expense");
  const [parentId, setParentId] = useState<string>(category?.parentId ?? "none");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parentOptions = allCategories.filter(
    (c) => c.parentId === null && c.kind === kind && c.id !== category?.id,
  );

  function reset() {
    setKind(category?.kind ?? "expense");
    setParentId(category?.parentId ?? "none");
    setError(null);
  }

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          isEdit ? <Button variant="outline" size="sm" /> : <Button size="sm" />
        }
      >
        {isEdit ? "Edit" : "Add category"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${category.name}` : "Add category"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this category's details."
              : "Expense or income, optionally under a parent."}
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          {isEdit && <input type="hidden" name="categoryId" value={category.id} />}

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={category?.name}
              placeholder="Groceries"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                name="icon"
                defaultValue={category?.icon ?? ""}
                placeholder="🛒"
                maxLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                name="color"
                type="color"
                defaultValue={category?.color ?? "#94a3b8"}
                className="h-8 p-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kind">Kind</Label>
            <Select
              name="kind"
              value={kind}
              onValueChange={(value) => {
                setKind(value as CategoryKind);
                setParentId("none");
              }}
            >
              <SelectTrigger id="kind" className="w-full">
                <SelectValue>
                  {(value: CategoryKind) => KIND_LABELS[value]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="parentId">Parent</Label>
            <Select
              name="parentId"
              value={parentId}
              onValueChange={(value) => setParentId(value as string)}
            >
              <SelectTrigger id="parentId" className="w-full">
                <SelectValue>
                  {(value: string) =>
                    value === "none"
                      ? "None (top-level)"
                      : (parentOptions.find((c) => c.id === value)?.name ?? value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (top-level)</SelectItem>
                {parentOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : isEdit ? "Save changes" : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
