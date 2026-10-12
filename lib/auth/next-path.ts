/**
 * A post-login destination from a `?next=` parameter, or null if it isn't
 * safe. Only a path inside this app is allowed: anything that could land
 * the user on another site (absolute URLs, protocol-relative `//host`,
 * backslash tricks) would turn the login flow into an open redirect that a
 * phishing link could abuse after a genuine sign-in.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  // "//evil.com" and "/\evil.com" are read by browsers as another host.
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\r\n\t\\]/.test(next)) return null;
  return next;
}
