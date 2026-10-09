import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { sampleStoryCamera } from "../../packages/renderer-core/src/story-camera.ts";
import type { StoryScene } from "../../packages/scene-contract/src/story.ts";

const linear = (a: number, b: number, end = 20) => ({
  keys: [
    { frame: 0, value: a },
    { frame: end, value: b, interpolation: "linear" as const },
  ],
});
const comp = (layers: CompositionLayer[] = []): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 200,
  height: 100,
  fps: 30,
  frameCount: 60,
  assets: [],
  layers,
});
const solid = (id = "box"): Extract<CompositionLayer, { type: "solid" }> => ({
  id,
  type: "solid",
  size: [20, 10],
  color: "#ffffff",
  transform: { position: [50, 30] },
});
const state = (doc: Composition, time = 0, id = "box") =>
  evaluateComp(doc, time).layers.find((l) => l.id === id)!;
const assertMatrix = (actual: number[], expected: number[]) =>
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
const diagnostic = (run: () => unknown) => {
  try {
    run();
    throw new Error("Expected evaluation failure");
  } catch (error) {
    return passageDiagnostics(error);
  }
};

it("clamps mask feather overshoot without motion bindings", () => {
  const layer = solid();
  layer.masks = [
    {
      id: "cut",
      mode: "add",
      path: {
        closed: true,
        vertices: [
          [0, 0],
          [20, 0],
          [20, 10],
        ],
      },
      feather: {
        keys: [
          { frame: 0, value: 10 },
          { frame: 20, value: 0, easing: "out-back" },
        ],
      },
    },
  ];
  const doc = CompositionSchema.parse(comp([layer]));
  expect(state(doc, 15).masks[0]!.feather).toBe(0);
});

describe("composition image crossfade defaults", () => {
  const imageComp = (): Composition => ({
    ...comp([
      {
        id: "image",
        type: "image",
        size: [100, 100],
        sources: [{ asset: "art" }, { asset: "art" }],
        state: 1,
      },
      { id: "controller", type: "null" },
    ]),
    assets: [
      {
        id: "art",
        type: "image",
        path: "art.png",
        sha256: "sha256:" + "0".repeat(64),
        width: 200,
        height: 100,
      },
    ],
  });

  it("defaults unauthored crossfade properties to the selected source at full mix", () => {
    const doc = imageComp();
    expect(evaluateProperty(doc, "image.stateFrom", 5.5)).toBe(1);
    expect(evaluateProperty(doc, "image.stateMix", 5.5)).toBe(1);
  });

  it("lets drivers read an unauthored crossfade mix without corrupting transforms", () => {
    const doc = imageComp();
    doc.drivers = [{ target: "controller.x", source: "image.stateMix" }];
    const result = state(doc, 5.5, "controller");
    expect(result.transform.position).toEqual([1, 0]);
    expect(result.worldMatrix).toEqual([1, 0, 0, 1, 1, 0]);
  });

  it("blends a weighted driver into an unauthored crossfade mix", () => {
    const doc = imageComp();
    doc.signals = [
      {
        id: "fade",
        keys: [
          { frame: 0, value: 0.5 },
          { frame: 20, value: 0.5 },
        ],
      },
    ];
    doc.drivers = [
      {
        target: "image.stateMix",
        signal: "fade",
        weight: [
          { frame: 0, value: 0.5 },
          { frame: 20, value: 0.5 },
        ],
      },
    ];
    expect(evaluateProperty(doc, "image.stateMix", 5.5)).toBe(0.75);
  });

  it("adds periodic motion to an unauthored crossfade mix", () => {
    const doc = imageComp();
    doc.periodic = [
      {
        target: "image.stateMix",
        start: 0,
        end: 20,
        oscillate: { period: 20, amplitude: -0.75 },
      },
    ];
    expect(evaluateProperty(doc, "image.stateMix", 5)).toBe(0.25);
  });

  it("preserves authored crossfade properties", () => {
    const doc = imageComp();
    const layer = doc.layers[0] as Extract<CompositionLayer, { type: "image" }>;
    layer.stateFrom = 0;
    layer.stateMix = linear(0, 1);
    expect(evaluateProperty(doc, "image.stateFrom", 5.5)).toBe(0);
    expect(evaluateProperty(doc, "image.stateMix", 5.5)).toBe(0.275);
  });
});

describe("pure composition property sampling", () => {
  it("evaluates the CE1 first slice and all-field fixture without a DOM", () => {
    for (const name of ["first-slice", "every-field"]) {
      const doc = JSON.parse(
        readFileSync(
          new URL(
            `../../benchmarks/fixtures/composition/ce1/${name}.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      ) as Composition;
      const result = evaluateComp(doc, 10.5);
      expect(result.layers).toHaveLength(doc.layers.length);
      expect(
        result.layers.every((l) => l.worldMatrix.every(Number.isFinite)),
      ).toBe(true);
    }
  });
  it("samples separated dimensions and canonical/legacy property paths at fractional frames", () => {
    const doc = comp([
      {
        ...solid(),
        transform: {
          position: { x: linear(10, 50), y: 20 },
          rotation: linear(0, 90),
        },
      },
    ]);
    expect(evaluateProperty(doc, "box.x", 5.5)).toBe(21);
    expect(evaluateProperty(doc, "box.transform.position", 5.5)).toEqual([
      21, 20,
    ]);
    expect(evaluateProperty(doc, "box.transform.rotation", 5.5)).toBeCloseTo(
      24.75,
    );
  });
  it("preserves hold and discrete boundaries, including before the first key", () => {
    const doc = comp([
      {
        ...solid(),
        transform: {
          rotation: {
            keys: [
              { frame: 5, value: 10 },
              { frame: 20, value: 90, interpolation: "hold" },
            ],
          },
        },
      },
    ]);
    expect(evaluateProperty(doc, "box.rotation", -10)).toBe(10);
    expect(evaluateProperty(doc, "box.rotation", 19.9)).toBe(10);
    expect(evaluateProperty(doc, "box.rotation", 20)).toBe(90);
    const text = comp([
      {
        id: "title",
        type: "text",
        text: "one",
        states: ["one", "two"],
        fontSize: 24,
        color: "#ffffff",
        state: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 10, value: 1 },
          ],
        },
      },
    ]);
    expect(evaluateProperty(text, "title.state", 9.9)).toBe(0);
    expect(evaluateComp(text, 10).layers[0]!.text).toBe("two");
  });
  it("interpolates sRGB RGBA channels, including alpha, in floating point", () => {
    const doc = comp([
      {
        ...solid(),
        type: "solid",
        size: [20, 10],
        color: {
          keys: [
            { frame: 0, value: "#ff000000" },
            { frame: 20, value: "#0000ffff", interpolation: "linear" },
          ],
        },
      },
    ]);
    expect(evaluateProperty(doc, "box.color", 5)).toEqual([
      0.75, 0, 0.25, 0.25,
    ]);
    expect(evaluateProperty(doc, "box.color.a", 5)).toBe(0.25);
  });
  it("uses temporal scalar speed in property units per frame", () => {
    const doc = comp([
      {
        ...solid(),
        transform: {
          rotation: {
            keys: [
              { frame: 0, value: 0, out: { ease: 1 / 3, speed: 2 } },
              { frame: 20, value: 40, in: { ease: 1 / 3, speed: 2 } },
            ],
          },
        },
      },
    ]);
    expect(evaluateProperty(doc, "box.rotation", 5)).toBeCloseTo(10, 6);
  });
  it("uses arc length for spatial position instead of cubic parameter time", () => {
    const doc = comp([
      {
        ...solid(),
        transform: {
          position: {
            keys: [
              { frame: 0, value: [0, 0], spatialOut: [0, 0] },
              {
                frame: 20,
                value: [100, 0],
                spatialIn: [-100, 0],
                interpolation: "linear",
              },
            ],
          },
        },
      },
    ]);
    expect(evaluateProperty(doc, "box.transform.position", 5)).toEqual([25, 0]);
    expect(evaluateProperty(doc, "box.transform.position", 20)).toEqual([
      100, 0,
    ]);
  });
  it("samples curved spatial positions and clamps holds before the next key", () => {
    const doc = comp([
      {
        ...solid(),
        transform: {
          position: {
            keys: [
              { frame: 0, value: [0, 0], spatialOut: [0, 100] },
              {
                frame: 20,
                value: [100, 0],
                spatialIn: [0, 100],
                interpolation: "linear",
              },
            ],
          },
        },
      },
    ]);
    const point = evaluateProperty(
      doc,
      "box.transform.position",
      10,
    ) as number[];
    expect(point[0]).toBeCloseTo(50, 6);
    expect(point[1]).toBeCloseTo(75, 6);
    const held = structuredClone(doc);
    held.layers[0]!.transform!.position = {
      keys: [
        { frame: 0, value: [0, 0], spatialOut: [0, 100] },
        { frame: 20, value: [100, 0], interpolation: "hold" },
      ],
    };
    expect(evaluateProperty(held, "box.transform.position", 10)).toEqual([
      0, 0,
    ]);
  });
  it("interpolates mask vertices and missing tangents as zero", () => {
    const doc = comp([
      {
        ...solid(),
        masks: [
          {
            id: "mask",
            mode: "add",
            opacity: linear(0, 1),
            path: {
              keys: [
                {
                  frame: 0,
                  value: {
                    closed: true,
                    vertices: [
                      [0, 0],
                      [10, 0],
                      [0, 10],
                    ],
                  },
                },
                {
                  frame: 20,
                  value: {
                    closed: true,
                    vertices: [
                      [0, 0],
                      [20, 0],
                      [0, 20],
                    ],
                    outTangents: [
                      [0, 0],
                      [2, 0],
                      [0, 0],
                    ],
                  },
                  interpolation: "linear",
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(evaluateProperty(doc, "box.masks[mask].opacity", 5)).toBe(0.25);
    expect(evaluateProperty(doc, "box.masks[mask].path", 10)).toMatchObject({
      vertices: [
        [0, 0],
        [15, 0],
        [0, 15],
      ],
      outTangents: [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    });
  });
  it("returns diagnostics for bad paths, invalid data and invalid evaluation times", () => {
    expect(
      diagnostic(() => evaluateProperty(comp(), "missing.x", 0))[0]!.code,
    ).toBe("comp-path-layer");
    expect(
      diagnostic(() =>
        evaluateComp({ ...comp(), fps: 61 } as unknown as Composition, 0),
      )[0]!.code,
    ).toBe("comp-schema-range");
    expect(() => evaluateComp({ ...comp(), fps: 17 }, 0)).not.toThrow();
    for (const time of [NaN, Infinity, 216001])
      expect(diagnostic(() => evaluateComp(comp(), time))[0]).toMatchObject({
        code: "comp-evaluation-time",
        path: "time",
      });
  });
});

describe("composition transforms and bounds", () => {
  it("defaults sized anchors to the centre and null anchors to zero", () => {
    const doc = comp([solid(), { id: "root", type: "null" }]);
    expect(state(doc).transform.anchor).toEqual([10, 5]);
    expect(state(doc, 0, "root").transform.anchor).toEqual([0, 0]);
    assertMatrix(state(doc).worldMatrix, [1, 0, 0, 1, 40, 25]);
    expect(state(doc).bounds).toEqual({
      left: 40,
      top: 25,
      right: 60,
      bottom: 35,
    });
  });
  it("composes position, rotation, skew and scale around the anchor", () => {
    const doc = comp([
      {
        ...solid(),
        transform: {
          anchor: [2, 3],
          position: [50, 30],
          rotation: 90,
          scale: [2, 3],
          skewX: 45,
          skewY: 45,
        },
      },
    ]);
    assertMatrix(state(doc).worldMatrix, [-2, 2, -3, 3, 63, 17]);
    expect(transformPoint(state(doc).worldMatrix, [2, 3])).toEqual([50, 30]);
  });
  it("moving an anchor moves artwork; moving constraintReference leaves the matrix unchanged", () => {
    const doc = comp([
      {
        ...solid(),
        transform: { position: [50, 30], anchor: { x: linear(0, 10), y: 0 } },
        constraintReference: { x: linear(5, 15), y: 8 },
      },
    ]);
    expect(state(doc, 0).worldMatrix[4]).toBe(50);
    expect(state(doc, 20).worldMatrix[4]).toBe(40);
    const reference = comp([
      { ...solid(), constraintReference: { x: linear(5, 15), y: 8 } },
    ]);
    expect(state(reference, 0).worldMatrix).toEqual(
      state(reference, 20).worldMatrix,
    );
    expect(evaluateProperty(reference, "box.constraintReference.x", 10)).toBe(
      10,
    );
  });
  it("inherits all parent transforms but never ordinary parent opacity", () => {
    const doc = comp([
      {
        id: "root",
        type: "null",
        transform: {
          position: [100, 50],
          rotation: 90,
          scale: [2, 3],
          opacity: 0.1,
        },
      },
      {
        ...solid(),
        parent: "root",
        transform: { anchor: [0, 0], position: [10, 5], opacity: 0.8 },
      },
    ]);
    assertMatrix(state(doc).worldMatrix, [0, 2, -3, 0, 85, 70]);
    expect(state(doc).opacity).toBe(0.8);
  });
  it("handles depth-16 parent chains in reverse array order", () => {
    const layers: CompositionLayer[] = Array.from({ length: 16 }, (_, i) => ({
      id: `node${i}`,
      type: "null",
      ...(i ? { parent: `node${i - 1}` } : {}),
      transform: { position: [1, 2] },
    }));
    expect(
      state(comp(layers.reverse()), 0, "node15").worldMatrix.slice(4),
    ).toEqual([16, 32]);
  });
  it("multiplies group opacity through ordinary parents and gates group visibility", () => {
    const doc = comp([
      {
        id: "group",
        type: "group",
        size: [100, 100],
        transform: { opacity: 0.5 },
      },
      {
        id: "root",
        type: "null",
        parent: "group",
        transform: { opacity: 0.1 },
      },
      { ...solid(), parent: "root", transform: { opacity: 0.8 } },
    ]);
    expect(state(doc).opacity).toBe(0.4);
    const hidden = structuredClone(doc);
    hidden.layers[0]!.enabled = false;
    expect(state(hidden).visible).toBe(false);
  });
  it("computes rotated and reflected bounds without dropping negative scales", () => {
    const doc = comp([
      {
        ...solid(),
        transform: {
          anchor: [0, 0],
          position: [50, 30],
          rotation: 90,
          scale: [-2, 3],
        },
      },
    ]);
    const bounds = state(doc).bounds!;
    expect(bounds.left).toBeCloseTo(20);
    expect(bounds.top).toBeCloseTo(-10);
    expect(bounds.right).toBeCloseTo(50);
    expect(bounds.bottom).toBeCloseTo(30);
  });
  it("uses fitted image geometry and supplied measured text bounds", () => {
    const doc = comp([
      {
        id: "image",
        type: "image",
        size: [100, 100],
        sources: [{ asset: "art" }],
      },
      {
        id: "title",
        type: "text",
        text: "Title",
        fontSize: 24,
        color: "#ffffff",
      },
    ]);
    doc.assets = [
      {
        id: "art",
        type: "image",
        path: "art.png",
        sha256: "sha256:" + "0".repeat(64),
        width: 200,
        height: 100,
      },
    ];
    expect(state(doc, 0, "image").bounds).toEqual({
      left: -50,
      top: -25,
      right: 50,
      bottom: 25,
    });
    expect(evaluateComp(doc, 0).diagnostics[0]!.code).toBe(
      "comp-text-layout-missing",
    );
    const result = evaluateComp(doc, 0, {
      textBounds: { title: [{ left: 0, top: -18, right: 70, bottom: 4 }] },
    });
    expect(result.layers[1]!.bounds).toEqual({
      left: 0,
      top: -18,
      right: 70,
      bottom: 4,
    });
    expect(result.diagnostics).toEqual([]);
  });
  it("keeps invisible parents and matte sources available as dependencies", () => {
    const doc = comp([
      {
        id: "root",
        type: "null",
        enabled: false,
        transform: { position: [20, 0] },
      },
      {
        ...solid(),
        parent: "root",
        trackMatte: { layer: "matte", mode: "alpha" },
      },
      solid("matte"),
    ]);
    expect(state(doc).visible).toBe(true);
    expect(state(doc).worldMatrix[4]).toBe(60);
    expect(state(doc, 0, "matte").drawable).toBe(false);
  });
});

describe("composition time and precomps", () => {
  it("respects inclusive in points, exclusive out points, enabled, solo and guides", () => {
    const doc = comp([{ ...solid(), inPoint: 5, outPoint: 10 }]);
    expect(state(doc, 4.99).visible).toBe(false);
    expect(state(doc, 5).visible).toBe(true);
    expect(state(doc, 10).visible).toBe(false);
    const solo = comp([{ ...solid(), solo: true }, solid("other")]);
    expect(state(solo, 0, "other").visible).toBe(false);
    const guide = comp([{ ...solid(), guide: true }]);
    expect(state(guide).visible).toBe(false);
    expect(
      evaluateComp(guide, 0, { includeGuides: true }).layers[0]!.visible,
    ).toBe(true);
  });
  it("keeps soloed children visible through nested groups and ordinary parents", () => {
    const layers: CompositionLayer[] = [
      { id: "outer", type: "group", size: [100, 100] },
      { id: "parent", type: "null", parent: "outer", enabled: false },
      { id: "inner", type: "group", size: [100, 100], parent: "parent" },
      { ...solid(), parent: "inner", solo: true },
      { ...solid("sibling"), parent: "inner" },
      { ...solid("outerSibling"), parent: "outer" },
      solid("other"),
    ];
    const doc = comp(layers.reverse());
    const result = evaluateComp(doc, 0);
    expect(result.layers.filter((l) => l.visible).map((l) => l.id)).toEqual([
      "box",
      "inner",
      "outer",
    ]);
    expect(result.layers.filter((l) => l.drawable).map((l) => l.id)).toEqual([
      "box",
    ]);
  });
  it("includes descendants of soloed groups without selecting unrelated layers", () => {
    const doc = comp([
      { id: "group", type: "group", size: [100, 100], solo: true },
      { id: "parent", type: "null", parent: "group", enabled: false },
      { id: "inner", type: "group", size: [100, 100], parent: "parent" },
      { ...solid(), parent: "inner" },
      { ...solid("sibling"), parent: "group" },
      solid("other"),
    ]);
    const result = evaluateComp(doc, 0);
    expect(result.layers.filter((l) => l.visible).map((l) => l.id)).toEqual([
      "group",
      "inner",
      "box",
      "sibling",
    ]);
    expect(result.layers.filter((l) => l.drawable).map((l) => l.id)).toEqual([
      "box",
      "sibling",
    ]);
  });
  it("keeps multiple solo selections separate from their unselected siblings", () => {
    const doc = comp([
      { id: "a", type: "group", size: [100, 100] },
      { id: "b", type: "group", size: [100, 100] },
      { ...solid(), parent: "a", solo: true },
      { ...solid("selected"), parent: "b", solo: true },
      { ...solid("aSibling"), parent: "a" },
      { ...solid("bSibling"), parent: "b" },
    ]);
    expect(
      evaluateComp(doc, 0)
        .layers.filter((l) => l.drawable)
        .map((l) => l.id),
    ).toEqual(["box", "selected"]);
  });
  it.each([
    { gate: "disabled", fields: { enabled: false }, time: 5 },
    { gate: "guide", fields: { guide: true }, time: 5 },
    { gate: "before in point", fields: { inPoint: 5 }, time: 4.99 },
    { gate: "at out point", fields: { outPoint: 10 }, time: 10 },
  ])(
    "preserves a group's $gate visibility gate when soloing",
    ({ fields, time }) => {
      for (const solo of ["group", "box"]) {
        const doc = comp([
          {
            id: "group",
            type: "group",
            size: [100, 100],
            ...fields,
            solo: solo === "group",
          },
          { ...solid(), parent: "group", solo: solo === "box" },
        ]);
        expect(state(doc, time).visible).toBe(false);
      }
    },
  );
  it("allows soloed children of guide groups when guides are included", () => {
    const doc = comp([
      { id: "group", type: "group", size: [100, 100], guide: true },
      { ...solid(), parent: "group", solo: true },
    ]);
    expect(
      evaluateComp(doc, 0, { includeGuides: true }).layers[1]!.drawable,
    ).toBe(true);
  });
  it("does not select children merely because an ordinary parent is soloed", () => {
    const doc = comp([
      { ...solid("parent"), solo: true },
      { ...solid(), parent: "parent" },
    ]);
    expect(
      evaluateComp(doc, 0)
        .layers.filter((l) => l.drawable)
        .map((l) => l.id),
    ).toEqual(["parent"]);
  });
  it("keeps group solo selection scoped to independently timed precomp instances", () => {
    const doc: Composition = {
      ...comp([
        { id: "a", type: "precomp", comp: "child", timeRemap: 5 },
        { id: "b", type: "precomp", comp: "child", timeRemap: 15 },
        solid("other"),
      ]),
      precomps: [
        {
          id: "child",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [
            {
              id: "group",
              type: "group",
              size: [100, 100],
              inPoint: 10,
              outPoint: 20,
            },
            { ...solid(), parent: "group", solo: true },
            { ...solid("sibling"), parent: "group" },
          ],
        },
      ],
    };
    const result = evaluateComp(doc, 0);
    expect(result.layers[0]!.precomp!.layers.every((l) => !l.drawable)).toBe(
      true,
    );
    expect(result.layers[1]!.precomp!.layers[1]!.drawable).toBe(true);
    expect(result.layers[1]!.precomp!.layers[2]!.drawable).toBe(false);
    expect(result.layers[2]!.drawable).toBe(true);
  });
  it("stretches and reverses layer time without playback state", () => {
    const doc = comp([
      {
        ...solid(),
        startFrame: 10,
        stretch: 2,
        transform: { rotation: linear(0, 100) },
      },
      {
        ...solid("reverse"),
        startFrame: 30,
        stretch: -1,
        transform: { rotation: linear(0, 100) },
      },
    ]);
    expect(evaluateProperty(doc, "box.rotation", 20)).toBe(25);
    expect(evaluateProperty(doc, "reverse.rotation", 20)).toBe(50);
    expect(evaluateProperty(doc, "reverse.rotation", 30)).toBe(0);
  });
  const nested = (): Composition => ({
    ...comp([
      {
        id: "host",
        type: "precomp",
        comp: "child",
        startFrame: 10,
        stretch: 2,
      },
    ]),
    precomps: [
      {
        id: "child",
        width: 100,
        height: 100,
        fps: 60,
        frameCount: 120,
        layers: [{ ...solid(), transform: { rotation: linear(0, 100) } }],
      },
    ],
  });
  it("samples a different-rate precomp at the parent's elapsed seconds", () => {
    const doc = nested();
    expect(evaluateComp(doc, 20).layers[0]!.precomp!.time).toBe(10);
    expect(evaluateProperty(doc, "host/box.rotation", 20)).toBe(50);
    expect(state(doc, 20, "host").transform.anchor).toEqual([50, 50]);
  });
  it("samples remap keys at layer time and treats values as child frames", () => {
    const doc = nested();
    (
      doc.layers[0] as Extract<CompositionLayer, { type: "precomp" }>
    ).timeRemap = linear(20, 0);
    expect(evaluateComp(doc, 20).layers[0]!.precomp!.time).toBe(15);
    expect(evaluateProperty(doc, "host/box.rotation", 20)).toBe(75);
  });
  it("reads independently timed reused precomps by their host instance paths", () => {
    const doc = nested();
    doc.layers = [
      { id: "a", type: "precomp", comp: "child", timeRemap: 5 },
      { id: "b", type: "precomp", comp: "child", timeRemap: 15 },
    ];
    const result = evaluateComp(doc, 20);
    expect(
      result.layers.map((l) => l.precomp!.layers[0]!.transform.rotation),
    ).toEqual([25, 75]);
    expect(evaluateProperty(doc, "a/box.rotation", 20)).toBe(25);
    expect(evaluateProperty(doc, "b/box.rotation", 20)).toBe(75);
    expect(
      diagnostic(() => evaluateProperty(doc, "child/box.rotation", 20))[0]!
        .code,
    ).toBe("comp-path-scope");
  });
  it("does not inherit precomp opacity into its unflattened child states", () => {
    const doc = nested();
    doc.layers[0]!.transform = { opacity: 0.25 };
    const host = evaluateComp(doc, 20).layers[0]!;
    expect(host.opacity).toBe(0.25);
    expect(host.precomp!.layers[0]!.opacity).toBe(1);
  });
  it("reads delayed driver sources through independent sibling instance clocks", () => {
    const doc = nested();
    doc.precomps![0]!.fps = 30;
    doc.layers = [
      { id: "intro", type: "precomp", comp: "child", startFrame: 5 },
      { id: "outro", type: "precomp", comp: "child", startFrame: -5 },
      { id: "controller", type: "null" },
    ];
    doc.drivers = [
      {
        target: "controller.x",
        source: "intro/box.rotation",
        map: { delay: 2 },
      },
      {
        target: "controller.y",
        source: "outro/box.rotation",
        map: { delay: 2 },
      },
    ];
    expect(state(doc, 10, "controller").transform.position).toEqual([15, 65]);
  });
  it("reaches nested precomps through their own clocks", () => {
    const doc = nested();
    doc.precomps![0]!.layers = [
      { id: "inner", type: "precomp", comp: "deep", timeRemap: 8 },
    ];
    doc.precomps!.push({
      id: "deep",
      width: 100,
      height: 100,
      frameCount: 60,
      layers: [{ ...solid(), transform: { rotation: linear(0, 100) } }],
    });
    expect(evaluateProperty(doc, "host/inner/box.rotation", 20)).toBe(40);
    expect(
      diagnostic(() => evaluateProperty(doc, "host/deep/box.rotation", 20))[0]!
        .code,
    ).toBe("comp-path-scope");
  });
  it("evaluates the CE2 timing fixture against hand-computed clocks", () => {
    const doc = JSON.parse(
      readFileSync(
        new URL(
          "../../benchmarks/fixtures/composition/ce2/timing.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Composition;
    const result = evaluateComp(doc, 20);
    const clocks = result.layers
      .filter((l) => l.precomp)
      .map((l) => l.precomp!.time);
    expect(clocks).toEqual([10, 40, 0]);
    expect(
      result.layers.find((l) => l.id === "forward")!.precomp!.layers[0]!
        .transform.position,
    ).toEqual([25, 50]);
  });
  it.each([
    {
      name: "before forward playback",
      host: { startFrame: 10 },
      frame: 0,
      expected: 0,
    },
    {
      name: "after forward playback",
      host: { startFrame: 10 },
      frame: 40,
      expected: 29,
    },
    {
      name: "before reverse playback",
      host: { startFrame: 50, stretch: -1 },
      frame: 0,
      expected: 29,
    },
    {
      name: "after reverse playback",
      host: { startFrame: 29, stretch: -1 },
      frame: 40,
      expected: 0,
    },
    {
      name: "after half-speed playback",
      host: { startFrame: -5, stretch: 2 },
      frame: 59,
      expected: 29,
    },
    {
      name: "with a different source rate",
      host: {},
      fps: 60 as const,
      frame: 20,
      expected: 29,
    },
    {
      name: "with a negative remap",
      host: { timeRemap: -5 },
      frame: 10,
      expected: 0,
    },
    {
      name: "with an oversized remap",
      host: { timeRemap: 35 },
      frame: 10,
      expected: 29,
    },
    {
      name: "with a fractional boundary remap",
      host: { timeRemap: 29.5 },
      frame: 10,
      expected: 29,
    },
    {
      name: "with a fractional interior remap",
      host: { timeRemap: 5.25 },
      frame: 10,
      expected: 5.25,
    },
    {
      name: "with a keyed remap",
      host: { timeRemap: linear(-5, 35) },
      frame: 20,
      expected: 29,
    },
    {
      name: "with a single-frame source",
      host: { timeRemap: 35 },
      frameCount: 1,
      frame: 10,
      expected: 0,
    },
  ])(
    "holds source boundaries $name",
    ({ host, fps = 30 as const, frameCount = 30, frame, expected }) => {
      const doc: Composition = {
        ...comp([{ id: "host", type: "precomp", comp: "child", ...host }]),
        precomps: [
          {
            id: "child",
            width: 100,
            height: 100,
            fps,
            frameCount,
            background: "#ffffff",
            layers: [
              { ...solid(), transform: { rotation: linear(0, 290, 29) } },
            ],
          },
        ],
      };
      const result = evaluateComp(doc, frame).layers[0]!;
      expect(result.visible).toBe(true);
      expect(result.precomp!.time).toBe(expected);
      expect(result.precomp!.background).toEqual([1, 1, 1, 1]);
      expect(result.precomp!.layers[0]!.drawable).toBe(true);
      expect(result.precomp!.layers[0]!.transform.rotation).toBeCloseTo(
        expected * 10,
        9,
      );
      expect(evaluateProperty(doc, "host/box.rotation", frame)).toBeCloseTo(
        expected * 10,
        9,
      );
    },
  );
  it("preserves authored remap values while holding the sampled source", () => {
    const doc = nested();
    doc.precomps![0]!.background = "#ffffff";
    const host = doc.layers[0] as Extract<
      CompositionLayer,
      { type: "precomp" }
    >;
    host.timeRemap = -1;
    const result = evaluateComp(doc, 20).layers[0]!;
    expect(result.timeRemap).toBe(-1);
    expect(evaluateProperty(doc, "host.timeRemap", 20)).toBe(-1);
    expect(result.precomp!.time).toBe(0);
    expect(result.precomp!.background).toEqual([1, 1, 1, 1]);
    expect(result.precomp!.layers.every((layer) => layer.visible)).toBe(true);
  });
  it("keeps host in/out gates in composition time when the source holds", () => {
    const doc = nested();
    doc.precomps![0]!.frameCount = 30;
    doc.precomps![0]!.fps = 30;
    Object.assign(doc.layers[0]!, {
      startFrame: 10,
      stretch: 1,
      inPoint: 5,
      outPoint: 40,
    });
    for (const frame of [0, 40]) {
      const host = evaluateComp(doc, frame).layers[0]!;
      expect(host.visible).toBe(false);
      expect(host.precomp).toBeUndefined();
    }
    expect(evaluateComp(doc, 5).layers[0]!.precomp!.time).toBe(0);
    expect(evaluateComp(doc, 39).layers[0]!.precomp!.time).toBe(29);
  });
});

describe("composition motion and constraints", () => {
  const driverChain = (length = 500): Composition => ({
    ...comp(
      Array.from({ length: length + 1 }, (_, i) => ({
        id: `node${i}`,
        type: "null" as const,
        transform: {
          position: i === length ? { x: linear(0, 40), y: 0 } : [0, 0],
        },
      })),
    ),
    drivers: Array.from({ length }, (_, i) => ({
      target: `node${i}.x`,
      source: `node${i + 1}.x`,
      map: { offset: 1 },
    })),
  });
  it.each([false, true])(
    "evaluates the maximum driver chain independently of painter order (reversed: %s)",
    (reverse) => {
      const doc = driverChain();
      if (reverse) doc.layers.reverse();
      expect(() => CompositionSchema.parse(doc)).not.toThrow();
      for (const time of [10.5, 0, 5.5]) {
        expect(evaluateProperty(doc, "node0.x", time)).toBe(500 + 2 * time);
        expect(state(doc, time, "node0").transform.position[0]).toBe(
          500 + 2 * time,
        );
      }
    },
  );
  it("evaluates long driver dependencies at delayed source times", () => {
    const doc = driverChain();
    for (const driver of doc.drivers!) driver.map!.delay = 1;
    expect(evaluateProperty(doc, "node0.x", 10.5)).toBe(500);
  });
  it("resumes lag sampling across long driver dependencies", () => {
    const doc = driverChain();
    doc.drivers![0]!.map!.lag = 2;
    const time = 2.5;
    expect(evaluateProperty(doc, "node0.x", time)).toBeCloseTo(
      500 + 2 * (time - 2 + (2 + time) * Math.exp(-time)),
      9,
    );
  });
  it("keeps long dependency chains local to each reused precomp instance", () => {
    const chain = driverChain(250);
    const doc: Composition = {
      ...comp([
        { id: "first", type: "precomp", comp: "child", startFrame: 5 },
        { id: "second", type: "precomp", comp: "child", startFrame: -5 },
      ]),
      precomps: [
        {
          id: "child",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: chain.layers,
        },
      ],
      drivers: ["first", "second"].flatMap((instance) =>
        chain.drivers!.map((driver) => ({
          ...driver,
          target: `${instance}/${driver.target}`,
          source: `${instance}/${driver.source}`,
        })),
      ),
    };
    expect(
      evaluateComp(doc, 10.5).layers.map(
        (layer) => layer.precomp!.layers[0]!.transform.position[0],
      ),
    ).toEqual([261, 281]);
  });
  it("uses dependency order rather than painter order for driver sources", () => {
    const doc = comp([
      { ...solid(), transform: { position: [1, 2] } },
      {
        id: "source",
        type: "null",
        transform: { position: { x: linear(0, 20), y: 0 } },
      },
    ]);
    doc.drivers = [
      { target: "box.x", source: "source.x", map: { scale: 2, offset: 3 } },
    ];
    expect(evaluateProperty(doc, "box.x", 5)).toBe(13);
  });
  it("applies action, response, current and carrier layers in that order", () => {
    const doc = comp([solid()]);
    doc.signals = [
      {
        id: "value",
        keys: [
          { frame: 0, value: 2 },
          { frame: 20, value: 2 },
        ],
      },
    ];
    doc.drivers = [
      {
        target: "box.transform.scale.x",
        signal: "value",
        layer: "current",
        blend: "add",
      },
      { target: "box.transform.scale.x", signal: "value", layer: "response" },
      { target: "box.transform.scale.x", signal: "value", layer: "action" },
    ];
    doc.periodic = [
      {
        target: "box.transform.scale.x",
        start: 0,
        end: 20,
        oscillate: { period: 20, amplitude: 1 },
        layer: "carrier",
      },
    ];
    expect(evaluateProperty(doc, "box.scaleX", 5)).toBe(7);
  });
  it("supports signal sums, delay, range, clamp, step and weights", () => {
    const doc = comp([solid()]);
    doc.signals = [
      {
        id: "ramp",
        keys: [
          { frame: 0, value: 0 },
          { frame: 20, value: 20, interpolation: "linear" },
        ],
      },
    ];
    doc.drivers = [
      {
        target: "box.x",
        sum: ["ramp", "ramp"],
        map: {
          delay: 2,
          range: [0, 20],
          to: [0, 100],
          clamp: [0, 35],
          step: 10,
        },
        weight: [
          { frame: 0, value: 0.5 },
          { frame: 20, value: 0.5 },
        ],
      },
    ];
    expect(evaluateProperty(doc, "box.x", 10)).toBe(40);
  });
  it("computes lag from source history, including fractional time, without previous frames", () => {
    const doc = comp([solid()]);
    doc.signals = [
      {
        id: "ramp",
        keys: [
          { frame: 0, value: 0 },
          { frame: 20, value: 20, interpolation: "linear" },
        ],
      },
    ];
    doc.drivers = [{ target: "box.x", signal: "ramp", map: { lag: 2 } }];
    // Critically damped response to x(t)=t with omega=1 and zero initial state.
    expect(evaluateProperty(doc, "box.x", 2.5)).toBeCloseTo(
      2.5 - 2 + (2 + 2.5) * Math.exp(-2.5),
      9,
    );
  });
  it("evaluates remap motion once and allows a host transform to read its child", () => {
    const doc = {
      ...comp([{ id: "host", type: "precomp", comp: "child", timeRemap: 5 }]),
      precomps: [
        {
          id: "child",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [
            { ...solid(), transform: { position: { x: linear(0, 20), y: 0 } } },
          ],
        },
      ],
    };
    doc.signals = [
      {
        id: "offset",
        keys: [
          { frame: 0, value: 5 },
          { frame: 20, value: 5 },
        ],
      },
    ];
    doc.drivers = [
      { target: "host.timeRemap", signal: "offset", blend: "add" },
      { target: "host.x", source: "host/box.x" },
    ];
    const host = evaluateComp(doc, 20).layers[0]!;
    expect(host.timeRemap).toBe(10);
    expect(host.precomp!.time).toBe(10);
    expect(host.transform.position[0]).toBe(10);
  });
  it("keeps drivers within each reused precomp instance", () => {
    const doc: Composition = {
      ...comp([
        { id: "a", type: "precomp", comp: "child", timeRemap: 5 },
        { id: "b", type: "precomp", comp: "child", timeRemap: 15 },
      ]),
      precomps: [
        {
          id: "child",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [
            solid(),
            {
              id: "source",
              type: "null",
              transform: { position: { x: linear(0, 20), y: 0 } },
            },
          ],
        },
      ],
      drivers: ["a", "b"].map((instance) => ({
        target: `${instance}/box.x`,
        source: `${instance}/source.x`,
      })),
    };
    expect(
      evaluateComp(doc, 10).layers.map(
        (l) => l.precomp!.layers[0]!.transform.position[0],
      ),
    ).toEqual([5, 15]);
  });
  it("applies a cross-instance driver only to its addressed target", () => {
    const doc: Composition = {
      ...comp([
        { id: "a", type: "precomp", comp: "child", timeRemap: 5 },
        { id: "b", type: "precomp", comp: "child", timeRemap: 15 },
      ]),
      precomps: [
        {
          id: "child",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [
            solid(),
            {
              id: "source",
              type: "null",
              transform: { position: { x: linear(0, 20), y: 0 } },
            },
          ],
        },
      ],
      drivers: [{ target: "a/box.x", source: "b/source.x" }],
    };
    expect(
      evaluateComp(doc, 10).layers.map(
        (layer) => layer.precomp!.layers[0]!.transform.position[0],
      ),
    ).toEqual([15, 50]);
  });
  it("binds periodic motion to individual instances using root-frame windows", () => {
    const doc: Composition = {
      ...comp([
        { id: "a", type: "precomp", comp: "child", startFrame: 5 },
        { id: "b", type: "precomp", comp: "child", startFrame: -5 },
      ]),
      precomps: [
        {
          id: "child",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [solid()],
        },
      ],
      periodic: ["a", "b"].map((instance, i) => ({
        target: `${instance}/box.rotation`,
        start: 0,
        end: 8,
        oscillate: { amplitude: i === 0 ? 2 : 5, period: 8 },
      })),
    };
    const rotations = (time: number) =>
      evaluateComp(doc, time).layers.map(
        (layer) => layer.precomp!.layers[0]!.transform.rotation,
      );
    expect(rotations(2)).toEqual([2, 5]);
    expect(rotations(9)).toEqual([0, 0]);
    expect(rotations(2)).toEqual([2, 5]);
  });
  it("binds nested remap drivers to independently reused host clocks", () => {
    const doc: Composition = {
      ...comp([
        { id: "a", type: "precomp", comp: "child" },
        { id: "b", type: "precomp", comp: "child" },
      ]),
      precomps: [
        {
          id: "child",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [
            { id: "inner", type: "precomp", comp: "deep", timeRemap: 5 },
          ],
        },
        {
          id: "deep",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [solid()],
        },
      ],
      signals: ["first", "second"].map((id, i) => ({
        id,
        keys: [
          { frame: 0, value: i === 0 ? 7 : 17 },
          { frame: 20, value: i === 0 ? 7 : 17 },
        ],
      })),
      drivers: [
        { target: "a/inner.timeRemap", signal: "first" },
        { target: "b/inner.timeRemap", signal: "second" },
      ],
    };
    expect(
      evaluateComp(doc, 10).layers.map(
        (layer) => layer.precomp!.layers[0]!.precomp!.time,
      ),
    ).toEqual([7, 17]);
    expect(evaluateProperty(doc, "a/inner.timeRemap", 10)).toBe(7);
    expect(evaluateProperty(doc, "b/inner.timeRemap", 10)).toBe(17);
  });
  it("attaches the separate reference point through a transformed parent", () => {
    const doc = comp([
      {
        id: "parent",
        type: "null",
        transform: { position: [10, 0], scale: [2, 2] },
      },
      {
        ...solid(),
        parent: "parent",
        constraintReference: [20, 0],
        transform: { anchor: [0, 0] },
      },
      {
        ...solid("source"),
        transform: { anchor: [0, 0], position: [100, 50] },
      },
    ]);
    doc.constraints = [
      { type: "attach", target: "box", anchor: "source", point: [0, 0] },
    ];
    expect(transformPoint(state(doc).worldMatrix, [20, 0])).toEqual([100, 50]);
    expect(state(doc).transform.position).toEqual([25, 25]);
  });
  it("keeps nested driver sources local to their addressed ancestor routes", () => {
    const doc: Composition = {
      ...comp([
        { id: "a", type: "precomp", comp: "aScene", startFrame: 5 },
        { id: "b", type: "precomp", comp: "bScene", startFrame: -5 },
      ]),
      precomps: [
        {
          id: "aScene",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [{ id: "inner", type: "precomp", comp: "deep" }],
        },
        {
          id: "bScene",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [{ id: "inner", type: "precomp", comp: "deep" }],
        },
        {
          id: "deep",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [
            solid(),
            {
              id: "source",
              type: "null",
              transform: { position: { x: linear(0, 20), y: 0 } },
            },
          ],
        },
      ],
      drivers: ["a", "b"].map((instance) => ({
        target: `${instance}/inner/box.x`,
        source: `${instance}/inner/source.x`,
        map: { delay: 2 },
      })),
    };
    expect(
      evaluateComp(doc, 10).layers.map(
        (l) => l.precomp!.layers[0]!.precomp!.layers[0]!.transform.position[0],
      ),
    ).toEqual([3, 13]);
  });
  it("looks at a target in parent space", () => {
    const doc = comp([
      { id: "parent", type: "null", transform: { rotation: 90 } },
      {
        ...solid(),
        parent: "parent",
        transform: { anchor: [0, 0], position: [0, 0] },
      },
      { id: "target", type: "null", transform: { position: [100, 0] } },
    ]);
    doc.constraints = [{ type: "look-at", target: "box", toward: "target" }];
    expect(state(doc).transform.rotation).toBeCloseTo(-90);
  });
  it("defaults the constraint reference to the driven anchor", () => {
    const doc = comp([
      solid(),
      {
        ...solid("source"),
        transform: { anchor: [0, 0], position: [100, 50] },
      },
    ]);
    doc.signals = [
      {
        id: "anchor",
        keys: [
          { frame: 0, value: 60 },
          { frame: 20, value: 60 },
        ],
      },
    ];
    doc.drivers = [{ target: "box.anchorX", signal: "anchor" }];
    doc.constraints = [
      { type: "attach", target: "box", anchor: "source", point: [0, 0] },
    ];
    expect(state(doc).constraintReference).toEqual([60, 5]);
    expect(state(doc).transform.position).toEqual([100, 50]);
  });
  it("uses measured text geometry for constraint points and diagnoses missing measurements", () => {
    const doc = comp([
      solid(),
      {
        id: "title",
        type: "text",
        text: "Title",
        fontSize: 24,
        color: "#ffffff",
        transform: { position: [100, 50] },
      },
    ]);
    doc.constraints = [{ type: "attach", target: "box", anchor: "title" }];
    expect(diagnostic(() => evaluateComp(doc, 0))[0]!.code).toBe(
      "comp-text-layout-missing",
    );
    const result = evaluateComp(doc, 0, {
      textBounds: { title: [{ left: 0, top: -10, right: 100, bottom: 20 }] },
    });
    expect(result.layers[0]!.transform.position).toEqual([150, 55]);
  });
  it.each(["y", "scaleY", "rotation"] as const)(
    "solves contact using %s",
    (solve) => {
      const doc = comp([
        { ...solid(), transform: { anchor: [0, 0], position: [0, 0] } },
        {
          ...solid("surface"),
          type: "solid",
          size: [100, 10],
          transform: { anchor: [0, 0], position: [0, 5] },
        },
      ]);
      doc.constraints = [
        {
          type: "contact",
          target: "box",
          surface: "surface",
          edge: "top",
          point: [0.5, 1],
          solve: [solve],
        },
      ];
      expect(transformPoint(state(doc).worldMatrix, [10, 10])[1]).toBeCloseTo(
        5,
        7,
      );
    },
  );
  it("corrects safe-area bounds in composition space through parent rotation", () => {
    const doc = comp([
      { id: "parent", type: "null", transform: { rotation: 90 } },
      {
        ...solid(),
        parent: "parent",
        transform: { anchor: [0, 0], position: [0, 0] },
      },
    ]);
    doc.constraints = [
      { type: "keep-in-safe-area", target: "box", inset: 5, clamp: true },
    ];
    const bounds = state(doc).bounds!;
    expect(bounds.left).toBeCloseTo(5);
    expect(bounds.top).toBeCloseTo(5);
  });
  it("reports collapsed parent transforms only when a constraint needs their inverse", () => {
    const doc = comp([
      { id: "parent", type: "null", transform: { scale: [0, 1] } },
      { ...solid(), parent: "parent" },
      solid("source"),
    ]);
    expect(state(doc).worldMatrix[0]).toBe(0);
    const constrained = structuredClone(doc);
    constrained.constraints = [
      { type: "attach", target: "box", anchor: "source" },
    ];
    expect(diagnostic(() => evaluateComp(constrained, 0))[0]!.code).toBe(
      "comp-constraint-singular",
    );
  });
});

describe("composition determinism and camera", () => {
  it("matches the story camera curves, depth and jolt timing", () => {
    const doc = comp([solid(), { ...solid("fixed"), cameraDepth: 0 }]);
    doc.camera2d = {
      keys: [
        { frame: 0, x: 100, y: 50, zoom: 1 },
        { frame: 59, x: 120, y: 60, zoom: 2 },
      ],
      jolts: [{ frame: 10, dx: 4, dy: -3, decayFrames: 8 }],
    };
    const story = {
      width: doc.width,
      height: doc.height,
      camera: { ...doc.camera2d, depth: {} },
    } as StoryScene;
    for (const time of [0, 10, 10.5, 17.9, 18, 35, 59]) {
      const expected = sampleStoryCamera(story, time);
      for (const axis of ["x", "y", "zoom"] as const)
        expect(evaluateProperty(doc, `comp.camera.${axis}`, time)).toBeCloseTo(
          expected[axis],
          10,
        );
      expect(state(doc, time, "fixed").screenMatrix).toEqual(
        state(doc, time, "fixed").worldMatrix,
      );
    }
  });
  it("random fixed-seed seeks equal sequential playback, including precomps and noise", () => {
    const doc: Composition = {
      ...comp([
        {
          ...solid(),
          transform: {
            position: { x: linear(0, 100), y: 20 },
            rotation: linear(0, 90),
          },
        },
        {
          id: "host",
          type: "precomp",
          comp: "child",
          stretch: -1,
          startFrame: 59,
        },
      ]),
      precomps: [
        {
          id: "child",
          width: 100,
          height: 100,
          frameCount: 60,
          layers: [solid()],
        },
      ],
      periodic: [
        {
          target: "box.x",
          start: 0,
          end: 59,
          noise: { seed: 123, period: 7, amplitude: 4 },
        },
      ],
    };
    const sequential = Array.from({ length: 120 }, (_, i) =>
      evaluateComp(doc, i / 2),
    );
    let seed = 0x12345678;
    for (let i = 0; i < 300; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const index = seed % 120;
      expect(evaluateComp(doc, index / 2)).toEqual(sequential[index]);
    }
  });
  it("does not mutate inputs or expose cached mutable results", () => {
    const doc = comp([
      { ...solid(), transform: { position: { x: linear(0, 100), y: 20 } } },
    ]);
    const original = structuredClone(doc);
    const result = evaluateComp(doc, 5);
    result.layers[0]!.transform.position[0] = -1000;
    const point = evaluateProperty(
      doc,
      "box.transform.position",
      5,
    ) as number[];
    point[0] = -1000;
    expect(evaluateProperty(doc, "box.x", 5)).toBe(25);
    expect(doc).toEqual(original);
  });
  it("accepts the new reference point contract and rejects 3D references", () => {
    expect(() =>
      CompositionSchema.parse(
        comp([{ ...solid(), constraintReference: [10, 20] }]),
      ),
    ).not.toThrow();
    expect(() =>
      CompositionSchema.parse(
        comp([{ ...solid(), constraintReference: [10, 20, 30] }]),
      ),
    ).toThrow();
  });
});
