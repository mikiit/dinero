import { describe, expect, it } from "vitest";
import { decideAccess } from "./access";

const REAL = { is_anonymous: false };
const ANON = { is_anonymous: true };

describe("decideAccess", () => {
  it("lets a signed-in user reach every page and data endpoint", () => {
    for (const path of ["/", "/transactions", "/accounts", "/spaces", "/join/abc", "/api/export/transactions"]) {
      expect(decideAccess(path, REAL, true), path).toBe("allow");
    }
  });

  it("sends a visitor with no session to the login screen for pages", () => {
    for (const path of ["/", "/transactions", "/reports", "/budgets", "/spaces", "/join/abc", "/settings"]) {
      expect(decideAccess(path, null, true), path).toBe("login");
    }
  });

  it("answers 401 (not an HTML redirect) for data endpoints", () => {
    expect(decideAccess("/api/export/transactions", null, true)).toBe("unauthorized");
  });

  it("does NOT treat a temporary anonymous session as a login", () => {
    expect(decideAccess("/", ANON, true)).toBe("login");
    expect(decideAccess("/transactions", ANON, true)).toBe("login");
    expect(decideAccess("/api/export/transactions", ANON, true)).toBe("unauthorized");
  });

  it("keeps the login screen and the auth callback reachable without a login", () => {
    for (const user of [null, ANON, REAL]) {
      expect(decideAccess("/login", user, true)).toBe("allow");
      expect(decideAccess("/auth/callback", user, true)).toBe("allow");
    }
  });

  it("keeps the Privacy Policy readable without a login", () => {
    for (const user of [null, ANON, REAL]) {
      expect(decideAccess("/privacy", user, true)).toBe("allow");
    }
    expect(decideAccess("/privacy/anything", null, true)).toBe("login");
  });

  it("only opens the dev test-login tool outside production", () => {
    expect(decideAccess("/api/dev/test-session", null, false)).toBe("allow");
    expect(decideAccess("/api/dev/test-session", null, true)).toBe("unauthorized");
    // Even for a signed-in person it is never a public path in production.
    expect(decideAccess("/api/dev/test-session", ANON, true)).toBe("unauthorized");
  });

  it("is not fooled by paths that merely start like a public one", () => {
    expect(decideAccess("/login-help", null, true)).toBe("login");
    expect(decideAccess("/loginx", null, true)).toBe("login");
    expect(decideAccess("/authors", null, true)).toBe("login");
  });
});
