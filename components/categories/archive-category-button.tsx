"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import {
  archiveCategoryAction,
  restoreCategoryAction,
} from "@/app/categories/actions";

export function ArchiveCategoryButton({
  categoryId,
  name,
}: {
  categoryId: string;
  name: string;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveCategoryAction(categoryId);
      if (result.error || !result.archivedAt) {
        show({ message: result.error ?? "Could not archive." });
        return;
      }
      const archivedAt = result.archivedAt;
      router.refresh();
      show({
        message: `Archived ${name}.`,
        undo: async () => {
          const restored = await restoreCategoryAction(categoryId, archivedAt);
          if (!restored.error) router.refresh();
          return restored;
        },
      });
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={archive} disabled={isPending}>
      Archive
    </Button>
  );
}
