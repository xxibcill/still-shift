import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";

const nestedComposition = (): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers: [
    { id: "inset", type: "precomp", comp: "scene" },
    { id: "controller", type: "null" },
  ],
  precomps: [
    {
      id: "scene",
      width: 100,
      height: 100,
      frameCount: 24,
      layers: [
        {
          id: "dot",
          type: "null",
          transform: {
            position: {
              x: {
                keys: [
                  { frame: 0, value: 23 },
                  { frame: 23, value: 0 },
                ],
              },
              y: 0,
            },
          },
        },
        { id: "deeper", type: "precomp", comp: "leaf" },
      ],
    },
    {
      id: "leaf",
      width: 100,
      height: 100,
      frameCount: 24,
      layers: [{ id: "dot", type: "null" }],
    },
  ],
});

function expectCycle(doc: Composition, path?: string) {
  const result = validateComposition(doc);
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "comp-motion-cycle",
      ...(path === undefined ? {} : { path }),
    }),
  );
}

describe("precomp time dependencies", () => {
  it.each(["scene/dot.x", "scene/dot.transform.position.x"])(
    "rejects remapping a precomp from its evaluated child %s",
    (source) => {
      const doc = nestedComposition();
      doc.drivers = [{ target: "inset.timeRemap", source }];
      expectCycle(doc, "drivers[0].source");
    },
  );

  it("rejects a remap cycle through a sum term", () => {
    const doc = nestedComposition();
    doc.drivers = [{ target: "inset.timeRemap", sum: ["scene/dot.x"] }];
    expectCycle(doc, "drivers[0].sum[0]");
  });

  it("rejects an indirect remap cycle through a root controller", () => {
    const doc = nestedComposition();
    doc.drivers = [
      { target: "inset.timeRemap", source: "controller.x" },
      { target: "controller.x", source: "scene/dot.x" },
    ];
    expectCycle(doc);
  });

  it("propagates sampled-time dependencies through nested precomps", () => {
    const doc = nestedComposition();
    doc.drivers = [{ target: "inset.timeRemap", source: "scene/leaf/dot.x" }];
    expectCycle(doc);
  });

  it("checks a remap target inside a precomp", () => {
    const doc = nestedComposition();
    doc.drivers = [
      { target: "scene/deeper.timeRemap", source: "scene/leaf/dot.x" },
    ];
    expectCycle(doc);
  });

  it("checks every instance of a reused precomp", () => {
    const doc = nestedComposition();
    doc.layers.push({ id: "second", type: "precomp", comp: "scene" });
    doc.drivers = [{ target: "second.timeRemap", source: "scene/dot.x" }];
    expectCycle(doc);
  });

  it("accepts reading a child to drive only the enclosing transform", () => {
    const doc = nestedComposition();
    doc.layers[0] = {
      id: "inset",
      type: "precomp",
      comp: "scene",
      timeRemap: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 23, value: 23 },
        ],
      },
    };
    doc.drivers = [{ target: "inset.opacity", source: "scene/leaf/dot.x" }];
    expect(validateComposition(doc)).toMatchObject({ ok: true });
  });

  it("accepts independent clocks and controllers", () => {
    const doc = nestedComposition();
    doc.drivers = [
      { target: "inset.timeRemap", source: "controller.x" },
      { target: "scene/deeper.timeRemap", source: "scene/dot.x" },
    ];
    expect(validateComposition(doc)).toMatchObject({ ok: true });
  });

  it("keeps identically named layers in independent precomps separate", () => {
    const doc = nestedComposition();
    doc.layers.push({ id: "other-inset", type: "precomp", comp: "other" });
    doc.precomps!.push({
      ...doc.precomps![1]!,
      id: "other",
    });
    doc.drivers = [{ target: "inset.timeRemap", source: "other/dot.x" }];
    expect(validateComposition(doc)).toMatchObject({ ok: true });
  });
});
