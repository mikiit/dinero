import Link from "next/link";
import { getContext } from "@/lib/context";
import { JoinInvite } from "@/components/spaces/join-invite";
import { buttonVariants } from "@/components/ui/button";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await getContext();

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 lg:max-w-lg lg:p-8">
      <h1 className="font-heading text-xl font-medium">You&apos;ve been invited</h1>

      {!ctx ? (
        <p className="text-sm text-muted-foreground">
          Setting up your session — refresh in a moment.
        </p>
      ) : ctx.user.is_anonymous ? (
        <>
          <p className="text-sm text-muted-foreground">
            Someone invited you to share a ledger in Dinero. Sign in or create
            an account first; you&apos;ll come straight back here to join.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
            className={buttonVariants({ size: "sm" })}
          >
            Create account or sign in
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Someone invited you to share a ledger in Dinero. Joining adds it to
            your account next to your personal data, which stays private.
          </p>
          <JoinInvite token={token} />
        </>
      )}
    </main>
  );
}
