import { describe, expect, it } from "vitest";
import { assertBaselineInventory } from "../../scripts/composition/baseline-check.ts";

const storedItems = {
  story: { fixture: "story", family: "story" },
  "passage/first": { fixture: "passage", family: "story-passage" },
  "passage/second": { fixture: "passage", family: "story-passage" },
};
const renderItems = Object.keys(storedItems).map((id) => ({ id }));

describe("composition baseline inventory", () => {
  it("accepts the complete stored acceptance set", () => {
    expect(() =>
      assertBaselineInventory({ storedItems, renderItems }),
    ).not.toThrow();
  });

  it("detects a fixture removed from a full run", () => {
    expect(() =>
      assertBaselineInventory({
        storedItems,
        renderItems: renderItems.slice(1),
      }),
    ).toThrow("missing render items: story");
  });

  it("detects a removed passage beat even in a filtered run", () => {
    expect(() =>
      assertBaselineInventory({
        storedItems,
        renderItems: [{ id: "passage/first" }],
        filters: { only: ["passage"] },
      }),
    ).toThrow("missing render items: passage/second");
  });

  it("detects a removed fixture within a selected family", () => {
    expect(() =>
      assertBaselineInventory({
        storedItems: {
          ...storedItems,
          neighbor: { fixture: "neighbor", family: "story" },
        },
        renderItems: [{ id: "neighbor" }],
        filters: { families: ["story"] },
      }),
    ).toThrow("missing render items: story");
  });

  it("allows intentional fixture filtering", () => {
    expect(() =>
      assertBaselineInventory({
        storedItems,
        renderItems: renderItems.slice(1),
        filters: { only: ["passage"] },
      }),
    ).not.toThrow();
  });

  it("requires a baseline for new acceptance items", () => {
    expect(() =>
      assertBaselineInventory({
        storedItems,
        renderItems: [...renderItems, { id: "new" }],
      }),
    ).toThrow("missing baseline items: new");
  });

  it("rejects an empty expanded acceptance set", () => {
    expect(() =>
      assertBaselineInventory({ storedItems, renderItems: [] }),
    ).toThrow("missing render items: story, passage/first, passage/second");
  });
});
