import { Button } from "@/components/ui/button";
import { archiveAccountAction } from "@/app/accounts/actions";

export function ArchiveAccountButton({ accountId }: { accountId: string }) {
  return (
    <form action={archiveAccountAction}>
      <input type="hidden" name="accountId" value={accountId} />
      <Button type="submit" variant="ghost" size="sm">
        Archive
      </Button>
    </form>
  );
}
