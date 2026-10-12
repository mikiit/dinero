"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import {
  archiveAccountAction,
  restoreAccountAction,
} from "@/app/accounts/actions";

export function ArchiveAccountButton({
  accountId,
  name,
}: {
  accountId: string;
  name: string;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveAccountAction(accountId);
      if (result.error) {
        show({ message: result.error });
        return;
      }
      router.refresh();
      show({
        message: `Archived ${name}.`,
        undo: async () => {
          const restored = await restoreAccountAction(accountId);
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
