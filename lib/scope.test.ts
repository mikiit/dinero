import { describe, expect, it } from "vitest";
import {
  canWrite,
  personalScope,
  receiptOwnerKey,
  scopeColumns,
  scopeFilter,
} from "./scope";

const USER = "11111111-1111-4111-8111-111111111111";
const SPACE = "22222222-2222-4222-8222-222222222222";

describe("scope", () => {
  it("a personal scope selects rows with no space and writes none", () => {
    const s = personalScope(USER);
    expect(scopeFilter(s)).toEqual(["space_id", "is", null]);
    expect(scopeColumns(s)).toEqual({ user_id: USER, space_id: null });
  });

  it("a space scope selects that space and records the actor as creator", () => {
    const s = { userId: USER, spaceId: SPACE };
    expect(scopeFilter(s)).toEqual(["space_id", "eq", SPACE]);
    expect(scopeColumns(s)).toEqual({ user_id: USER, space_id: SPACE });
  });

  it("receipt photos live under the space, or the user for personal ones", () => {
    expect(receiptOwnerKey(personalScope(USER))).toBe(USER);
    expect(receiptOwnerKey({ userId: USER, spaceId: SPACE })).toBe(SPACE);
  });

  it("only viewers cannot write; the personal ledger has no role and is writable", () => {
    expect(canWrite(null)).toBe(true);
    expect(canWrite("owner")).toBe(true);
    expect(canWrite("editor")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
  });
});
