import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { JoinInvite } from "@/components/spaces/join-invite";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await getContext();
  // Not signed in: the login screen first, then straight back to this invite.
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 lg:max-w-lg lg:p-8">
      <h1 className="font-heading text-xl font-medium">You&apos;ve been invited</h1>
      <p className="text-sm text-muted-foreground">
        Someone invited you to share a ledger in Dinero. Joining adds it to
        your account next to your personal data, which stays private.
      </p>
      <JoinInvite token={token} />
    </main>
  );
}
