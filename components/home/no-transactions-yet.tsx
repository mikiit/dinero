/** Empty state for the Home lists: say what to do next, not just that
 * there is nothing. The hint names the control the person actually has -
 * the round + on a phone, the Add transaction button on desktop - and is
 * left out for someone who can only view a shared space. */
export function NoTransactionsYet({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>No transactions yet.</p>
      {canWrite && (
        <p>
          <span className="lg:hidden">Tap the + button to add your first one.</span>
          <span className="hidden lg:inline">
            Use &ldquo;Add transaction&rdquo; to add your first one.
          </span>
        </p>
      )}
    </div>
  );
}
