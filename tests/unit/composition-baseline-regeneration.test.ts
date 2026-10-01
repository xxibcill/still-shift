import { describe, expect, it } from "vitest";
import {
  assertBaselineInventory,
  assertBaselineProvenance,
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

const provenance = {
  browserArgs: ["--disable-gpu", "--enable-unsafe-swiftshader"],
  renderEnvironment: {
    profile: "chromium-software-2",
    browserVersion: "151.0.7922.34",
    webglRenderer: "SwiftShader",
    rasterFingerprint: "sha256:original",
    platform: "darwin" as const,
    arch: "arm64",
  },
  machine: {
    cpu: "Apple M5 Pro",
    logicalCores: 15,
    platform: "darwin",
    arch: "arm64",
  },
};

describe("partial baseline provenance", () => {
  it("accepts the same provenance regardless of object key order", () => {
    expect(() =>
      assertBaselineProvenance(provenance, {
        machine: { ...provenance.machine },
        renderEnvironment: { ...provenance.renderEnvironment },
        browserArgs: [...provenance.browserArgs],
      }),
    ).not.toThrow();
  });

  it.each([
    ["profile", "chromium-software-3"],
    ["browserVersion", "152.0.0.0"],
    ["webglRenderer", "another SwiftShader"],
    ["rasterFingerprint", "sha256:changed"],
    ["platform", "linux"],
    ["arch", "x64"],
  ])("rejects a changed %s before retaining old hashes", (field, value) => {
    expect(() =>
      assertBaselineProvenance(provenance, {
        ...provenance,
        renderEnvironment: { ...provenance.renderEnvironment, [field]: value },
      }),
    ).toThrow(/full.*--write/i);
  });

  it("rejects changed launch arguments", () => {
    expect(() =>
      assertBaselineProvenance(provenance, {
        ...provenance,
        browserArgs: ["--use-angle=swiftshader"],
      }),
    ).toThrow(/full.*--write/i);
  });

  it("rejects a different machine", () => {
    expect(() =>
      assertBaselineProvenance(provenance, {
        ...provenance,
        machine: { ...provenance.machine, cpu: "Apple M6 Pro" },
      }),
    ).toThrow(/full.*--write/i);
  });

  it("rejects relabeling legacy baselines with missing machine provenance", () => {
    const legacy = {
      browserArgs: provenance.browserArgs,
      renderEnvironment: provenance.renderEnvironment,
    };
    expect(() => assertBaselineProvenance(legacy, provenance)).toThrow(
      /full.*--write/i,
    );
  });
});
