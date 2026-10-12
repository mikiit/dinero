import { listCategories } from "@/lib/db/categories";
import { CategoryList } from "@/components/categories/category-list";
import { CategoryDialog } from "@/components/categories/category-dialog";
import { getContext } from "@/lib/context";
import { redirect } from "next/navigation";

export default async function CategoriesPage() {
  const ctx = await getContext();

  if (!ctx) redirect("/login");

  const { supabase, scope } = ctx;

  const categories = await listCategories(supabase, scope);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 lg:max-w-4xl lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-medium">Categories</h1>
        {ctx.canWrite && <CategoryDialog allCategories={categories} />}
      </div>
      <CategoryList categories={categories} readOnly={!ctx.canWrite} />
    </main>
  );
}
