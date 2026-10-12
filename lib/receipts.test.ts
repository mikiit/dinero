import { describe, expect, it } from "vitest";
import {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPT_INPUT_BYTES,
  buildReceiptPath,
  extensionFor,
  isReceiptPathFor,
  scaledSize,
  validateReceiptFile,
} from "./receipts";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TX = "33333333-3333-4333-8333-333333333333";
const OBJ = "44444444-4444-4444-8444-444444444444";

describe("receipt paths", () => {
  it("builds and recognises the canonical path", () => {
    const path = buildReceiptPath(USER, TX, OBJ, "jpg");
    expect(path).toBe(`${USER}/${TX}/${OBJ}.jpg`);
    expect(isReceiptPathFor(path, USER, TX)).toBe(true);
  });

  it("rejects someone else's folder or another transaction", () => {
    expect(isReceiptPathFor(buildReceiptPath(OTHER, TX, OBJ, "jpg"), USER, TX)).toBe(false);
    expect(isReceiptPathFor(buildReceiptPath(USER, OTHER, OBJ, "jpg"), USER, TX)).toBe(false);
  });

  it("rejects traversal, extra segments, bad extensions and junk", () => {
    expect(isReceiptPathFor(`${USER}/${TX}/../${OTHER}/${OBJ}.jpg`, USER, TX)).toBe(false);
    expect(isReceiptPathFor(`${USER}/${TX}/x/${OBJ}.jpg`, USER, TX)).toBe(false);
    expect(isReceiptPathFor(`${USER}/${TX}/${OBJ}.exe`, USER, TX)).toBe(false);
    expect(isReceiptPathFor(`${USER}/${TX}/${OBJ}.jpg/..`, USER, TX)).toBe(false);
    expect(isReceiptPathFor("", USER, TX)).toBe(false);
    expect(isReceiptPathFor(`${USER}/${TX}/${OBJ}.jpg`, "not-an-id", TX)).toBe(false);
  });
});

describe("extensionFor / validateReceiptFile", () => {
  it("maps supported types only", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/heic")).toBe("heic");
    expect(extensionFor("application/pdf")).toBeNull();
  });

  it("accepts photos up to the limit and rejects the rest", () => {
    expect(validateReceiptFile({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateReceiptFile({ type: "image/png", size: MAX_RECEIPT_BYTES })).toBeNull();
    expect(validateReceiptFile({ type: "image/png", size: MAX_RECEIPT_BYTES + 1 })).toMatch(/5 MB/);
    expect(validateReceiptFile({ type: "application/pdf", size: 1000 })).toMatch(/photo/);
    expect(validateReceiptFile({ type: "image/jpeg", size: 0 })).toMatch(/empty/);
  });

  it("lets a large phone original be picked, since it is shrunk before upload", () => {
    const eightMb = { type: "image/jpeg", size: 8 * 1024 * 1024 };
    expect(validateReceiptFile(eightMb)).toMatch(/5 MB/); // not storable as is
    expect(validateReceiptFile(eightMb, MAX_RECEIPT_INPUT_BYTES)).toBeNull();
    expect(
      validateReceiptFile({ type: "image/jpeg", size: MAX_RECEIPT_INPUT_BYTES + 1 }, MAX_RECEIPT_INPUT_BYTES),
    ).toMatch(/40 MB/);
  });
});

describe("scaledSize", () => {
  it("never enlarges", () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaledSize(1600, 1000)).toEqual({ width: 1600, height: 1000 });
  });

  it("fits the longest edge and keeps the aspect ratio", () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it("never produces a zero dimension", () => {
    expect(scaledSize(100000, 10).height).toBeGreaterThanOrEqual(1);
  });
});
