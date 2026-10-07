import { expect, it } from "vitest";
import {
  CompositionSchema,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
const scene = (
  expressions: NonNullable<Composition["expressions"]>,
): Composition => ({
  schemaVersion: "composition-1",
  id: "optics",
  width: 128,
  height: 96,
  fps: 24,
  frameCount: 32,
  assets: [],
  layers: [
    { id: "camera", type: "camera" },
    { id: "reader", type: "null" },
  ],
  expressions,
});
it("resolves derived focal length after zoom and film expressions regardless of author order", () => {
  for (const reverse of [false, true]) {
    const entries: [string, { source: string }][] = [
        [
          "reader.transform.position.x",
          { source: "ref('camera.focalLength')" },
        ],
        ["camera.filmSize", { source: "value * 1.5" }],
        ["camera.zoom", { source: "value * 2" }],
      ],
      doc = CompositionSchema.parse(
        scene(Object.fromEntries(reverse ? entries.reverse() : entries)),
      );
    expect(evaluateComp(doc, 5).layers[1]!.transform.position[0]).toBe(108);
    expect(evaluateProperty(doc, "camera.focalLength", 5)).toBe(108);
  }
});
it("resolves derived zoom after focal-length and film expressions without insertion-order drift", () => {
  for (const reverse of [false, true]) {
    const entries: [string, { source: string }][] = [
        ["reader.transform.position.x", { source: "ref('camera.zoom')" }],
        ["camera.filmSize", { source: "value * 1.5" }],
        ["camera.focalLength", { source: "value * 2" }],
      ],
      doc = CompositionSchema.parse(
        scene(Object.fromEntries(reverse ? entries.reverse() : entries)),
      );
    expect(evaluateComp(doc, 5).layers[1]!.transform.position[0]).toBeCloseTo(
      (72 * 128) / 54,
      12,
    );
    expect(evaluateProperty(doc, "camera.focalLength", 5)).toBe(72);
  }
});
it("rejects implicit optical feedback cycles while allowing independent primary reads", () => {
  for (const expressions of [
    { "camera.zoom": { source: "ref('camera.focalLength')" } },
    { "camera.filmSize": { source: "ref('camera.focalLength')" } },
  ])
    expect(validateComposition(scene(expressions)).ok).toBe(false);
  expect(
    validateComposition(
      scene({ "camera.filmSize": { source: "ref('camera.zoom') / 4" } }),
    ).ok,
  ).toBe(true);
});
it("resolves secondary zoom when a motion driver selects focal length and an expression changes film size", () => {
  const doc = CompositionSchema.parse({
    ...scene({
      "reader.transform.position.x": { source: "ref('camera.zoom')" },
      "camera.filmSize": { source: "value * 1.5" },
    }),
    signals: [
      {
        id: "focal",
        keys: [
          { frame: 0, value: 72 },
          { frame: 31, value: 72 },
        ],
      },
    ],
    drivers: [
      { target: "camera.focalLength", signal: "focal", blend: "replace" },
    ],
  });
  expect(evaluateComp(doc, 5).layers[1]!.transform.position[0]).toBeCloseTo(
    (72 * 128) / 54,
    12,
  );
});

it.each(["root", "precomp"] as const)(
  "validates derived zoom after optical expression writers settle in a %s scope",
  (scope) => {
    for (const reverse of [false, true])
      for (const readerFirst of [false, true]) {
        const prefix = scope === "precomp" ? "instance/" : "";
        const entries: [string, { source: string }][] = [
          [`${prefix}camera.filmSize`, { source: "0.001" }],
          [`${prefix}camera.focalLength`, { source: "1" }],
          [
            `${prefix}reader.transform.position.x`,
            { source: `ref('${prefix}camera.zoom')` },
          ],
        ];
        const doc = scene(
          Object.fromEntries(reverse ? entries.reverse() : entries),
        );
        doc.width = doc.height = 100;
        if (readerFirst) doc.layers.reverse();
        if (scope === "precomp") {
          doc.precomps = [
            {
              id: "inner",
              width: 100,
              height: 100,
              frameCount: 32,
              layers: doc.layers,
            },
          ];
          doc.layers = [{ id: "instance", type: "precomp", comp: "inner" }];
        }
        const parsed = CompositionSchema.parse(doc);
        for (const frame of [5.5, 31, 0]) {
          const root = evaluateComp(parsed, frame);
          const tree = scope === "precomp" ? root.layers[0]!.precomp! : root;
          expect(tree.camera!.zoom).toBe(100_000);
          expect(
            tree.layers.find((state) => state.id === "reader")!.transform
              .position[0],
          ).toBe(100_000);
          expect(evaluateProperty(parsed, `${prefix}camera.zoom`, frame)).toBe(
            100_000,
          );
        }
      }
  },
);

it.each(["expression", "driver"] as const)(
  "allows a %s to settle optics after keyed sampling",
  (writer) => {
    const doc = scene({});
    doc.width = 100;
    doc.layers[0] = {
      id: "camera",
      type: "camera",
      filmSize: 0.001,
      ...(writer === "driver" ? { focalLength: 36 } : {}),
    };
    if (writer === "expression")
      doc.expressions = { "camera.focalLength": { source: "1" } };
    else {
      doc.signals = [
        {
          id: "focal",
          keys: [
            { frame: 0, value: 1 },
            { frame: 31, value: 1 },
          ],
        },
      ];
      doc.drivers = [
        { target: "camera.focalLength", signal: "focal", blend: "replace" },
      ];
    }
    const parsed = CompositionSchema.parse(doc);
    expect(evaluateComp(parsed, 5.5).camera!.zoom).toBe(100_000);
  },
);

it("rejects invalid final derived optics and invalid independent controls", () => {
  for (const expressions of [
    {
      "camera.filmSize": { source: "0.001" },
      "camera.focalLength": { source: "36" },
    },
    { "camera.zoom": { source: "1000001" } },
    { "camera.filmSize": { source: "0" } },
    { "camera.focalLength": { source: "10001" } },
  ]) {
    const doc = scene(expressions);
    doc.width = 100;
    expect(() => evaluateComp(CompositionSchema.parse(doc), 0)).toThrow(
      /camera (zoom|filmSize|focalLength)/i,
    );
  }
});
