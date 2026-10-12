import { describe, expect, it } from "vitest";
import { buildQuickTemplates, type TemplateRow } from "./quick-templates";

const row = (over: Partial<TemplateRow> = {}): TemplateRow => ({
  type: "expense",
  accountId: "wallet",
  categoryId: "eating",
  amount: 25000n,
  note: "Coffee",
  occurredOn: "2026-10-01",
  ...over,
});

describe("buildQuickTemplates", () => {
  it("is empty with no history", () => {
    expect(buildQuickTemplates([])).toEqual([]);
  });

  it("offers just 'repeat last' when nothing has repeated yet", () => {
    const t = buildQuickTemplates([row({ occurredOn: "2026-10-03" }), row({ note: "Lunch", amount: 90000n, occurredOn: "2026-10-02" })]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "last", note: "Coffee", amount: "25000" });
  });

  it("puts the most recent entry first, then repeated ones by frequency", () => {
    const rows = [
      row({ note: "Taxi", amount: 40000n, categoryId: "transport", occurredOn: "2026-10-10" }), // latest, once
      row({ occurredOn: "2026-10-09" }),
      row({ occurredOn: "2026-10-08" }),
      row({ occurredOn: "2026-10-07" }), // coffee x3
      row({ note: "Gym", amount: 350000n, categoryId: "fun", occurredOn: "2026-10-05" }),
      row({ note: "Gym", amount: 350000n, categoryId: "fun", occurredOn: "2026-09-05" }), // gym x2
    ];
    const t = buildQuickTemplates(rows);
    expect(t.map((x) => [x.kind, x.note, x.count])).toEqual([
      ["last", "Taxi", 1],
      ["frequent", "Coffee", 3],
      ["frequent", "Gym", 2],
    ]);
  });

  it("does not list the latest entry twice when it is also frequent", () => {
    const rows = [row({ occurredOn: "2026-10-10" }), row({ occurredOn: "2026-10-09" })];
    const t = buildQuickTemplates(rows);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "last", count: 2 });
  });

  it("treats a different amount, account, category or type as a different entry", () => {
    const rows = [
      row({ occurredOn: "2026-10-10" }),
      row({ occurredOn: "2026-10-09", amount: 26000n }),
      row({ occurredOn: "2026-10-08", accountId: "card" }),
      row({ occurredOn: "2026-10-07", categoryId: "fun" }),
      row({ occurredOn: "2026-10-06", type: "income" }),
    ];
    // Five different entries, none repeated: only "last" qualifies.
    expect(buildQuickTemplates(rows)).toHaveLength(1);
  });

  it("matches notes ignoring case and surrounding spaces, keeping the newest wording", () => {
    const rows = [
      row({ note: "Coffee", occurredOn: "2026-10-09" }),
      row({ note: "  coffee ", occurredOn: "2026-10-01" }),
      row({ note: "Lunch", amount: 90000n, occurredOn: "2026-10-10" }),
    ];
    const frequent = buildQuickTemplates(rows).find((t) => t.kind === "frequent");
    expect(frequent).toMatchObject({ note: "Coffee", count: 2 });
  });

  it("keeps a null note distinct from an empty-looking one only by value", () => {
    const rows = [
      row({ note: null, occurredOn: "2026-10-09" }),
      row({ note: "", occurredOn: "2026-10-08" }),
      row({ note: "x", amount: 1n, occurredOn: "2026-10-10" }),
    ];
    expect(buildQuickTemplates(rows).find((t) => t.kind === "frequent")?.count).toBe(2);
  });

  it("respects the limit and a custom minimum count", () => {
    const rows = [
      row({ note: "A", occurredOn: "2026-10-10" }),
      ...["B", "C", "D", "E", "F", "G"].flatMap((n, i) => [
        row({ note: n, amount: BigInt(100 + i), occurredOn: "2026-10-05" }),
        row({ note: n, amount: BigInt(100 + i), occurredOn: "2026-10-04" }),
      ]),
    ];
    expect(buildQuickTemplates(rows)).toHaveLength(5);
    expect(buildQuickTemplates(rows, { limit: 3 })).toHaveLength(3);
    expect(buildQuickTemplates(rows, { minCount: 3, limit: 9 })).toHaveLength(1); // only "last"
  });
});
