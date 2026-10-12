import { describe, expect, it } from "vitest";
import {
  MAX_TAGS,
  MAX_TAG_LENGTH,
  countTags,
  formatTags,
  parseTags,
  spendByTag,
} from "./tags";

describe("parseTags", () => {
  it("splits on commas and spaces, strips #, lowercases", () => {
    expect(parseTags("Trip, #Summer  gift;Kids")).toEqual(["trip", "summer", "gift", "kids"]);
  });

  it("drops empties, junk characters and duplicates (first wins)", () => {
    expect(parseTags(" , ,# trip TRIP t!r@ip ")).toEqual(["trip"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags("###")).toEqual([]);
  });

  it("keeps letters from other scripts, digits, - and _", () => {
    expect(parseTags("Одмор, zima-2026, a_b")).toEqual(["одмор", "zima-2026", "a_b"]);
  });

  it("bounds length and count", () => {
    expect(parseTags("x".repeat(100))[0]).toHaveLength(MAX_TAG_LENGTH);
    const many = Array.from({ length: 25 }, (_, i) => `t${i}`).join(",");
    expect(parseTags(many)).toHaveLength(MAX_TAGS);
  });

  it("round-trips through formatTags", () => {
    expect(parseTags(formatTags(["trip", "summer"]))).toEqual(["trip", "summer"]);
  });
});

describe("countTags", () => {
  it("counts per tag, most used first then A-Z, ignoring nulls", () => {
    expect(countTags([["b", "a"], ["b"], null, ["c", "b"], []])).toEqual([
      { tag: "b", count: 3 },
      { tag: "a", count: 1 },
      { tag: "c", count: 1 },
    ]);
  });
});

describe("spendByTag", () => {
  it("sums each transaction under every one of its tags", () => {
    const out = spendByTag([
      { tags: ["trip", "food"], amount: 1000n },
      { tags: ["trip"], amount: 500n },
      { tags: ["food", "food"], amount: 200n }, // a repeated tag counts once
      { tags: null, amount: 9999n }, // untagged: left out
    ]);
    expect(out).toEqual([
      { tag: "trip", total: 1500n, count: 2 },
      { tag: "food", total: 1200n, count: 2 },
    ]);
  });

  it("orders ties by name", () => {
    expect(
      spendByTag([
        { tags: ["b"], amount: 5n },
        { tags: ["a"], amount: 5n },
      ]).map((t) => t.tag),
    ).toEqual(["a", "b"]);
  });
});
