import { describe, expect, it } from "vitest";
import {
  assertBaselineInventory,
  replaceBaselineItems,
} from "../../scripts/composition/baseline-check.ts";

const previous = {
  story: { fixture: "story", family: "story" },
  "passage/first": { fixture: "passage", family: "story-passage" },
  "passage/retired": { fixture: "passage", family: "story-passage" },
};

describe("partial baseline regeneration", () => {
  it("removes retired and renamed passage beats so the next inventory check passes", () => {
    const regenerated = {
      "passage/renamed": { fixture: "passage", family: "story-passage" },
    };
    const filters = { only: ["passage"] };
    const items = replaceBaselineItems(previous, regenerated, filters);
    expect(items).toEqual({ story: previous.story, ...regenerated });
    expect(() =>
      assertBaselineInventory({
        storedItems: items,
        renderItems: [{ id: "passage/renamed" }],
        filters,
      }),
    ).not.toThrow();
    expect(previous).toHaveProperty("passage/retired");
  });

  it("removes fixtures retired from a selected family", () => {
    const regenerated = {
      replacement: { fixture: "replacement", family: "story" },
    };
    expect(
      replaceBaselineItems(previous, regenerated, { families: ["story"] }),
    ).toEqual({
      "passage/first": previous["passage/first"],
      "passage/retired": previous["passage/retired"],
      ...regenerated,
    });
  });

  it("preserves items outside the intersection of fixture and family filters", () => {
    const regenerated = {
      "passage/first": previous["passage/first"],
    };
    expect(
      replaceBaselineItems(previous, regenerated, {
        only: ["story", "passage"],
        families: ["story-passage"],
      }),
    ).toEqual({ story: previous.story, ...regenerated });
  });

  it("replaces the entire inventory when no filters are specified", () => {
    const regenerated = { replacement: { fixture: "new", family: "story" } };
    expect(replaceBaselineItems(previous, regenerated)).toEqual(regenerated);
  });
});
