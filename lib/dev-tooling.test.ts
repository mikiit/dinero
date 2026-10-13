import { describe, expect, it } from "vitest";
import { devToolingEnabled, secretMatches } from "./dev-tooling";

describe("devToolingEnabled", () => {
  it("is on only for a local, non-production run with a secret", () => {
    expect(devToolingEnabled({ NODE_ENV: "development", TEST_SESSION_SECRET: "s" })).toBe(true);
  });

  it("is off in production, whatever else is set", () => {
    expect(devToolingEnabled({ NODE_ENV: "production", TEST_SESSION_SECRET: "s" })).toBe(false);
  });

  it("is off on Vercel even if NODE_ENV were not production", () => {
    expect(
      devToolingEnabled({ NODE_ENV: "development", VERCEL: "1", TEST_SESSION_SECRET: "s" }),
    ).toBe(false);
  });

  it("is off without a secret", () => {
    expect(devToolingEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(devToolingEnabled({ NODE_ENV: "development", TEST_SESSION_SECRET: "" })).toBe(false);
  });
});

describe("secretMatches", () => {
  it("accepts only the exact secret", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abd", "abc")).toBe(false);
    expect(secretMatches("abcd", "abc")).toBe(false);
    expect(secretMatches("", "abc")).toBe(false);
    expect(secretMatches(null, "abc")).toBe(false);
  });
});
