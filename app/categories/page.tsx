import { listCategories } from "@/lib/db/categories";
import { CategoryList } from "@/components/categories/category-list";
import { CategoryDialog } from "@/components/categories/category-dialog";
import { getContext } from "@/lib/context";

export default async function CategoriesPage() {
  const ctx = await getContext();

  if (!ctx) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted-foreground">
          Setting up your session — refresh in a moment.
        </p>
      </main>
    );
  }

  const { supabase, scope } = ctx;

  const categories = await listCategories(supabase, scope);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 lg:max-w-4xl lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-medium">Categories</h1>
        <CategoryDialog allCategories={categories} />
      </div>
      <CategoryList categories={categories} />
    </main>
  );
}
