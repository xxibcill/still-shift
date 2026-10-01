import { describe, expect, it } from "vitest";
import {
  resolvePropertyPath,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";

const composition = (): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 30,
  frameCount: 30,
  assets: [],
  layers: [
    { id: "intro", type: "precomp", comp: "scene" },
    {
      id: "outro",
      type: "precomp",
      comp: "scene",
      startFrame: 29,
      stretch: -1,
    },
    { id: "controller", type: "null" },
  ],
  precomps: [
    {
      id: "scene",
      width: 100,
      height: 100,
      frameCount: 30,
      layers: [
        { id: "hero", type: "null" },
        { id: "nested", type: "precomp", comp: "leaf" },
      ],
    },
    {
      id: "leaf",
      width: 100,
      height: 100,
      frameCount: 30,
      layers: [{ id: "hero", type: "null" }],
    },
  ],
});

describe("precomp instance property paths", () => {
  it.each(["intro", "outro"])("retains the %s instance route", (instance) => {
    const doc = composition();
    expect(resolvePropertyPath(doc, `${instance}/hero.x`)).toMatchObject({
      path: `${instance}/hero.transform.position.x`,
      scope: [instance],
      type: "scalar",
    });
    expect(resolvePropertyPath(doc, `${instance}/nested/hero.x`)).toMatchObject(
      {
        scope: [instance, "nested"],
        layer: { id: "hero" },
      },
    );
  });

  it.each([
    "scene/hero.x",
    "intro/leaf/hero.x",
    "missing/hero.x",
    "controller/hero.x",
  ])("rejects a missing or non-precomp instance hop: %s", (path) => {
    const doc = composition();
    // A matching definition must not make a non-precomp layer traversable.
    doc.precomps!.push({ ...doc.precomps![1]!, id: "controller" });
    expect(resolvePropertyPath(doc, path)).toMatchObject({
      code: "comp-path-scope",
    });
  });

  it("accepts a one-way driver between reused instances", () => {
    const doc = composition();
    doc.drivers = [{ target: "intro/hero.x", source: "outro/hero.x" }];
    expect(validateComposition(doc)).toMatchObject({ ok: true });
  });

  it("accepts remapping an instance from an independently timed sibling", () => {
    const doc = composition();
    doc.drivers = [
      { target: "intro.timeRemap", source: "outro/hero.x" },
      { target: "intro/nested.timeRemap", source: "outro/nested/hero.x" },
    ];
    expect(validateComposition(doc)).toMatchObject({ ok: true });
  });

  it.each([
    [{ target: "intro.timeRemap", source: "intro/nested/hero.x" }],
    [{ target: "intro/nested.timeRemap", source: "intro/nested/hero.x" }],
    [
      { target: "intro.timeRemap", source: "outro/hero.x" },
      { target: "outro.timeRemap", source: "intro/hero.x" },
    ],
    [
      { target: "intro/hero.x", source: "outro/hero.x" },
      { target: "outro/hero.x", source: "intro/hero.x" },
    ],
  ])(
    "rejects actual cycles across instance properties and clocks",
    (...drivers) => {
      const doc = composition();
      doc.drivers = drivers;
      const result = validateComposition(doc);
      expect(result.ok).toBe(false);
      expect(
        result.diagnostics.some((issue) => issue.code === "comp-motion-cycle"),
      ).toBe(true);
    },
  );

  it("checks parent and constraint dependencies in the addressed instance", () => {
    const doc = composition();
    doc.precomps![0]!.layers.push({
      id: "child",
      type: "null",
      parent: "hero",
    });
    doc.precomps![0]!.constraints = [
      { type: "attach", target: "hero", anchor: "nested" },
    ];
    doc.drivers = [{ target: "intro/nested.x", source: "intro/child.x" }];
    const result = validateComposition(doc);
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((issue) => issue.code === "comp-motion-cycle"),
    ).toBe(true);
  });

  it("keeps unused source template ids separate from matching instance ids", () => {
    const doc = composition();
    doc.layers[0]!.id = "scene";
    doc.precomps!.push({
      ...doc.precomps![0]!,
      id: "unused",
      layers: [{ id: "hero", type: "null" }],
    });
    doc.drivers = [{ target: "scene/hero.x", source: "outro/hero.x" }];
    expect(validateComposition(doc)).toMatchObject({ ok: true });
  });

  it("does not expand every combination of deeply reused definitions", () => {
    const doc = composition();
    doc.layers = [{ id: "intro", type: "precomp", comp: "p0" }];
    doc.precomps = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      width: 100,
      height: 100,
      frameCount: 30,
      layers:
        i < 7
          ? Array.from({ length: 100 }, (_, j) => ({
              id: `instance${j}`,
              type: "precomp" as const,
              comp: `p${i + 1}`,
            }))
          : [{ id: "hero", type: "null" as const }],
    }));
    doc.signals = [
      {
        id: "signal",
        keys: [
          { frame: 0, value: 0 },
          { frame: 29, value: 1 },
        ],
      },
    ];
    doc.drivers = [
      { target: `intro/${"instance0/".repeat(7)}hero.x`, signal: "signal" },
    ];
    expect(validateComposition(doc)).toMatchObject({ ok: true });
  });
});
