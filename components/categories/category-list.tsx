import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Category, CategoryKind } from "@/lib/db/categories";
import { CategoryDialog } from "@/components/categories/category-dialog";
import { ArchiveCategoryButton } from "@/components/categories/archive-category-button";
import { MoveCategoryButtons } from "@/components/categories/move-category-buttons";

const KIND_LABELS: Record<CategoryKind, string> = {
  expense: "Expense categories",
  income: "Income categories",
};

const KINDS = Object.keys(KIND_LABELS) as CategoryKind[];

function CategoryRow({
  category,
  allCategories,
  disableUp,
  disableDown,
  indented,
}: {
  category: Category;
  allCategories: Category[];
  disableUp: boolean;
  disableDown: boolean;
  indented: boolean;
}) {
  return (
    <li className={indented ? "ml-6" : undefined}>
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: category.color ?? "#94a3b8" }}
          />
          {category.icon && <span>{category.icon}</span>}
          <span className="truncate text-sm">{category.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <MoveCategoryButtons
            categoryId={category.id}
            disableUp={disableUp}
            disableDown={disableDown}
          />
          <CategoryDialog category={category} allCategories={allCategories} />
          <ArchiveCategoryButton categoryId={category.id} />
        </div>
      </div>
    </li>
  );
}

export function CategoryList({ categories }: { categories: Category[] }) {
  if (categories.length === 0) {
    return <p className="text-sm text-muted-foreground">No categories yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      {KINDS.map((kind) => {
        const topLevel = categories.filter(
          (c) => c.kind === kind && c.parentId === null,
        );
        if (topLevel.length === 0) return null;

        return (
          <Card key={kind}>
            <CardHeader>
              <CardTitle>{KIND_LABELS[kind]}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {topLevel.map((parent, parentIndex) => {
                  const children = categories.filter(
                    (c) => c.parentId === parent.id,
                  );
                  return (
                    <Fragment key={parent.id}>
                      <CategoryRow
                        category={parent}
                        allCategories={categories}
                        disableUp={parentIndex === 0}
                        disableDown={parentIndex === topLevel.length - 1}
                        indented={false}
                      />
                      {children.map((child, childIndex) => (
                        <CategoryRow
                          key={child.id}
                          category={child}
                          allCategories={categories}
                          disableUp={childIndex === 0}
                          disableDown={childIndex === children.length - 1}
                          indented
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
