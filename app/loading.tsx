/**
 * Shown the moment you navigate to a page, until its data has arrived (the
 * App Router swaps it in automatically while a route renders). A neutral
 * page-shaped placeholder: a title, a summary card and a few rows - close
 * enough to every screen that nothing jumps when the real one appears.
 */
export default function Loading() {
  return (
    <main
      className="mx-auto max-w-md space-y-6 p-4 lg:max-w-5xl lg:p-8"
      aria-busy="true"
    >
      <span role="status" className="sr-only">
        Loading
      </span>
      <div className="h-6 w-32 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-lg bg-muted/70 motion-reduce:animate-none"
          />
        ))}
      </div>
    </main>
  );
}
