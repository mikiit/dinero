import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moveCategoryAction } from "@/app/categories/actions";

export function MoveCategoryButtons({
  categoryId,
  disableUp,
  disableDown,
}: {
  categoryId: string;
  disableUp: boolean;
  disableDown: boolean;
}) {
  return (
    <form action={moveCategoryAction} className="flex gap-1">
      <input type="hidden" name="categoryId" value={categoryId} />
      <Button
        type="submit"
        name="direction"
        value="up"
        variant="ghost"
        size="icon-sm"
        disabled={disableUp}
        aria-label="Move up"
      >
        <ChevronUp />
      </Button>
      <Button
        type="submit"
        name="direction"
        value="down"
        variant="ghost"
        size="icon-sm"
        disabled={disableDown}
        aria-label="Move down"
      >
        <ChevronDown />
      </Button>
    </form>
  );
}
