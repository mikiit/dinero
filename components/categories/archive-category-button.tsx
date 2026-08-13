import { Button } from "@/components/ui/button";
import { archiveCategoryAction } from "@/app/categories/actions";

export function ArchiveCategoryButton({ categoryId }: { categoryId: string }) {
  return (
    <form action={archiveCategoryAction}>
      <input type="hidden" name="categoryId" value={categoryId} />
      <Button type="submit" variant="ghost" size="sm">
        Archive
      </Button>
    </form>
  );
}
