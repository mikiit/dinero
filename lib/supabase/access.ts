// Who may see what, decided in one pure function so it can be tested
// exhaustively: the app is for signed-in people only.

export type AccessDecision =
  /** Let the request through. */
  | "allow"
  /** A page: send the visitor to the login screen. */
  | "login"
  /** A data endpoint: answer 401 rather than redirect to an HTML page. */
  | "unauthorized";

/** Reachable without being signed in: the login screen itself and the
 * OAuth/email-confirmation callback it depends on. (The manifest, service
 * worker, offline page and icons never reach this check - they are excluded
 * from the proxy matcher, so the browser can fetch them without cookies.) */
function isPublicPath(pathname: string, isProduction: boolean): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/auth/callback" || pathname.startsWith("/auth/")) return true;
  // Dev-only tooling that logs a browser tab in as a test user; the route
  // itself 404s in production, this just stops the gate from blocking it
  // while developing.
  if (!isProduction && pathname.startsWith("/api/dev/")) return true;
  return false;
}

/**
 * A temporary (anonymous) session is NOT a login: it is what the app used to
 * hand every visitor, and it must not open the app any more.
 */
export function decideAccess(
  pathname: string,
  user: { is_anonymous?: boolean } | null,
  isProduction: boolean,
): AccessDecision {
  if (isPublicPath(pathname, isProduction)) return "allow";

  const signedIn = user !== null && user.is_anonymous !== true;
  if (signedIn) return "allow";

  return pathname.startsWith("/api/") ? "unauthorized" : "login";
}
