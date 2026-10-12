import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("allows paths inside the app, including queries", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/join/abc123")).toBe("/join/abc123");
    expect(safeNextPath("/reports?m=2026-10")).toBe("/reports?m=2026-10");
  });

  it("rejects anything that could leave the app", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("evil.example")).toBeNull();
  });

  it("rejects control characters and empty values", () => {
    expect(safeNextPath("/ok\r\nSet-Cookie: x=1")).toBeNull();
    expect(safeNextPath("/a\tb")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});
