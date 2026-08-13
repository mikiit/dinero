import { createClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/db/categories";
import { CategoryList } from "@/components/categories/category-list";
import { CategoryDialog } from "@/components/categories/category-dialog";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted-foreground">
          Setting up your session — refresh in a moment.
        </p>
      </main>
    );
  }

  const categories = await listCategories(supabase, user.id);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-medium">Categories</h1>
        <CategoryDialog allCategories={categories} />
      </div>
      <CategoryList categories={categories} />
    </main>
  );
}
