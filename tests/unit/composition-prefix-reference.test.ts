import { expect, it } from "vitest";
import { compileExpressions } from "@still-shift/scene-contract";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { compositionPrefixLayers } from "../../packages/renderer-core/src/composition/render/prefix.ts";

const changing = {
  keys: [
    { frame: 0, value: 2 },
    { frame: 7, value: 9 },
  ],
};
function document(source = "ref('control.transform.rotation')"): Composition {
  return {
    schemaVersion: "composition-1",
    id: "references",
    width: 32,
    height: 24,
    fps: 60,
    frameCount: 8,
    background: null,
    assets: [],
    layers: [
      {
        id: "moving",
        type: "solid",
        size: [9, 11],
        color: "#fff",
        transform: { rotation: changing },
      },
      { id: "floor", type: "solid", size: [9, 11], color: "#3377bb80" },
      {
        id: "control",
        type: "null",
        transform: { rotation: 17.3, position: { x: 2, y: changing } },
      },
    ],
    expressions: { "floor.transform.rotation": { source } },
  };
}
const includesFloor = (composition: Composition) => {
  compileExpressions(composition, (code, _path, message) => {
    throw new Error(`${code}: ${message}`);
  });
  return compositionPrefixLayers(composition).has("floor");
};
it("reuses constant property reads on an otherwise animated layer", () => {
  expect(includesFloor(document())).toBe(true);
  expect(includesFloor(document("ref('control.transform.position.x')"))).toBe(
    true,
  );
  expect(includesFloor(document("ref('control.transform.position.y')"))).toBe(
    false,
  );
});
it("follows chains of constant and changing expression writers", () => {
  const comp = document();
  comp.expressions!["control.transform.rotation"] = {
    source: "ref('control.transform.position.x') + 3",
  };
  expect(includesFloor(comp)).toBe(true);
  comp.expressions!["control.transform.rotation"] = {
    source: "ref('control.transform.position.y') + 3",
  };
  expect(includesFloor(comp)).toBe(false);
  comp.expressions!["control.transform.rotation"] = { source: "time * 10" };
  expect(includesFloor(comp)).toBe(false);
});
it("recognizes constant projected joint keys but preserves spatial handles", () => {
  const comp = document("ref('control.transform.position.x')");
  comp.layers[2]!.transform!.position = {
    keys: [
      { frame: 0, value: [2, 3] },
      { frame: 7, value: [2, 9] },
    ],
  };
  expect(includesFloor(comp)).toBe(true);
  comp.layers[2]!.transform!.position = {
    keys: [
      { frame: 0, value: [2, 3], spatialOut: [4, 2] },
      { frame: 7, value: [2, 9] },
    ],
  };
  expect(includesFloor(comp)).toBe(false);
});
it("canonicalizes motion aliases and distinguishes nonoverlapping properties", () => {
  const comp = document();
  comp.periodic = [
    {
      node: "control",
      property: "y",
      start: 0,
      end: 8,
      oscillate: { amplitude: 2, period: 8 },
    },
  ] as Composition["periodic"];
  expect(includesFloor(comp)).toBe(true);
  comp.periodic = [
    {
      node: "control",
      property: "rotation",
      start: 0,
      end: 8,
      oscillate: { amplitude: 2, period: 8 },
    },
  ] as Composition["periodic"];
  expect(includesFloor(comp)).toBe(false);
});
it("follows implicit anchor axes without reading unrelated final parent state", () => {
  const comp = document("ref('control.constraintReference.x')");
  comp.layers[2]!.transform!.anchor = { x: changing, y: 0 };
  expect(includesFloor(comp)).toBe(false);
  comp.expressions!["control.constraintReference.x"] = { source: "2" };
  expect(includesFloor(comp)).toBe(true);
  comp.layers[2]!.parent = "moving";
  expect(includesFloor(comp)).toBe(true);
});
it("follows path auto-orientation and implicit media clocks", () => {
  const comp = document();
  comp.layers[2]!.transform!.autoOrient = "path";
  expect(includesFloor(comp)).toBe(false);
  comp.layers[2] = { id: "control", type: "precomp", comp: "art" };
  comp.precomps = [
    { id: "art", width: 32, height: 24, frameCount: 8, layers: [] },
  ];
  comp.expressions!["floor.transform.rotation"] = {
    source: "ref('control.timeRemap')",
  };
  expect(includesFloor(comp)).toBe(false);
  (comp.layers[2] as CompositionLayer & { timeRemap: number }).timeRemap = 3;
  expect(includesFloor(comp)).toBe(true);
});
it("follows derived camera optics and composition camera reads", () => {
  const comp = document("ref('control.zoom')");
  comp.layers[2] = {
    id: "control",
    type: "camera",
    focalLength: changing,
    filmSize: 36,
  } as CompositionLayer;
  expect(includesFloor(comp)).toBe(false);
  comp.layers[2] = {
    id: "control",
    type: "camera",
    focalLength: 50,
    filmSize: 36,
  } as CompositionLayer;
  expect(includesFloor(comp)).toBe(true);
  comp.camera2d = {
    keys: [
      { frame: 0, x: 0, y: 0, zoom: 1 },
      { frame: 7, x: 2, y: 0, zoom: 1 },
    ],
  };
  comp.expressions!["floor.transform.rotation"] = {
    source: "ref('comp.camera.x')",
  };
  expect(includesFloor(comp)).toBe(false);
  comp.camera2d.jolts = [{ frame: 2, dx: 3, dy: 0, decayFrames: 4 }];
  comp.expressions!["floor.transform.rotation"] = {
    source: "ref('comp.camera.zoom')",
  };
  expect(includesFloor(comp)).toBe(true);
});

it("recognizes constant expression overrides without losing value dependencies", () => {
  const comp = document();
  comp.layers[2]!.transform!.rotation = changing;
  comp.expressions!["control.transform.rotation"] = { source: "17.3" };
  expect(includesFloor(comp)).toBe(true);
  comp.expressions!["control.transform.rotation"] = { source: "value + 3" };
  expect(includesFloor(comp)).toBe(false);
  comp.layers[2] = { id: "control", type: "precomp", comp: "art" };
  comp.precomps = [
    { id: "art", width: 32, height: 24, frameCount: 8, layers: [] },
  ];
  comp.expressions = {
    "floor.transform.rotation": { source: "ref('control.timeRemap')" },
    "control.timeRemap": { source: "3" },
  };
  expect(includesFloor(comp)).toBe(true);
  comp.expressions["control.timeRemap"] = { source: "value" };
  expect(includesFloor(comp)).toBe(false);
});
it("lets a constant expression replace a rendered layer's keyed track", () => {
  const comp = document();
  comp.layers[1]!.transform = { rotation: changing };
  comp.expressions = { "floor.transform.rotation": { source: "17.3" } };
  expect(includesFloor(comp)).toBe(true);
  comp.expressions["floor.transform.rotation"] = { source: "value + 3" };
  expect(includesFloor(comp)).toBe(false);
});
it("retains the inherited anchor when a reference expression reads value", () => {
  const comp = document("ref('control.constraintReference.x')");
  comp.layers[2]!.transform!.anchor = { x: changing, y: 0 };
  comp.expressions!["control.constraintReference.x"] = { source: "value" };
  expect(includesFloor(comp)).toBe(false);
});
it("reuses completed dependency results across a long reference chain", () => {
  const comp = document("ref('control0.transform.rotation')");
  for (let i = 0; i < 500; i++) {
    comp.layers.push({ id: `control${i}`, type: "null" });
    comp.expressions![`control${i}.transform.rotation`] = {
      source: i === 499 ? "17.3" : `ref('control${i + 1}.transform.rotation')`,
    };
  }
  expect(includesFloor(comp)).toBe(true);
  comp.expressions!["control499.transform.rotation"] = { source: "time" };
  expect(includesFloor(comp)).toBe(false);
});

it("does not hide an unoverridden alias of a keyed track", () => {
  const comp = document();
  const shared = {
    keys: [
      { frame: 0, value: 0 },
      { frame: 7, value: 1 },
    ],
  };
  comp.layers[1]!.transform = { rotation: shared, opacity: shared };
  comp.expressions = { "floor.transform.rotation": { source: "0" } };
  expect(includesFloor(comp)).toBe(false);
  comp.expressions["floor.transform.opacity"] = { source: "1" };
  expect(includesFloor(comp)).toBe(true);
});
