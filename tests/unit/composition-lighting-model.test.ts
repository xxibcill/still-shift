import { expect, it } from "vitest";
import {
  LightLayerSchema,
  SolidLayerSchema,
} from "../../packages/scene-contract/src/composition/layers.ts";
import { checkSpatialLayer } from "../../packages/scene-contract/src/composition/validate-spatial.ts";
import { resolvePropertyPath } from "@still-shift/scene-contract";
import type { Composition } from "@still-shift/scene-contract";
import {
  planeNormal,
  sampleLight,
  shadeFlatColor,
  validateLight,
  worldLight,
  type WorldLight,
} from "../../packages/renderer-core/src/composition/evaluate/lighting.ts";
import { affineMatrix4 } from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
const light = (fields: Partial<WorldLight> = {}): WorldLight => ({
  id: "light",
  type: "ambient",
  color: [1, 1, 1, 1],
  intensity: 1,
  range: 100,
  falloffStart: 0,
  innerCone: 30,
  outerCone: 60,
  position: [0, 0, 10],
  direction: [0, 0, -1],
  ...fields,
});
const doc = (): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers: [{ id: "light", type: "light", lightType: "spot" }],
});
it("preserves source JSON and implicit receiving defaults", () => {
  const authored = {
    id: "light",
    type: "light",
    lightType: "spot",
    transform: { position: [0, 0, 20] },
    intensity: {
      keys: [
        { frame: 0, value: 0 },
        { frame: 12, value: 2 },
      ],
    },
  };
  expect(LightLayerSchema.parse(authored)).toEqual(authored);
  const plane = {
    id: "plane",
    type: "solid",
    size: [10, 10],
    color: "#ffffff",
    threeD: true,
  };
  expect(SolidLayerSchema.parse(plane)).toEqual(plane);
});
it.each([
  { intensity: -1 },
  { intensity: 17 },
  { range: 0 },
  { range: 1_000_001 },
  { falloffStart: -1 },
  { innerCone: 181 },
  { outerCone: 0 },
  { color: "pink" },
  { lightType: "sun" },
])("bounds all authored light controls %j", (fields) =>
  expect(
    LightLayerSchema.safeParse({
      id: "light",
      type: "light",
      lightType: "spot",
      ...fields,
    }).success,
  ).toBe(false),
);
it("resolves implicit XYZ, colour components and light type-specific controls", () => {
  for (const path of [
    "transform.position.z",
    "transform.orientation.x",
    "color.r",
    "intensity",
    "range",
    "innerCone",
  ])
    expect(resolvePropertyPath(doc(), "light." + path)).toMatchObject({
      type: "scalar",
    });
  const ambient = doc();
  ambient.layers = [{ id: "light", type: "light", lightType: "ambient" }];
  expect(resolvePropertyPath(ambient, "light.outerCone")).toMatchObject({
    code: "comp-path-property",
  });
});
it("reports unsupported receivers, type fields and static relations", () => {
  const scope = doc(),
    issues: string[] = [];
  const fail = (code: string) => issues.push(code);
  checkSpatialLayer(
    { id: "light", type: "light", lightType: "ambient", range: 20 },
    scope,
    [],
    fail,
  );
  checkSpatialLayer(
    {
      id: "plane",
      type: "solid",
      size: [10, 10],
      color: "#ffffff",
      receivesLight: true,
    },
    scope,
    [],
    fail,
  );
  checkSpatialLayer(
    {
      id: "light",
      type: "light",
      lightType: "spot",
      range: 5,
      falloffStart: 6,
      innerCone: 60,
      outerCone: 30,
    },
    scope,
    [],
    fail,
  );
  expect(issues).toEqual([
    "comp-light-settings",
    "comp-light-receiver",
    "comp-light-settings",
    "comp-light-settings",
  ]);
});
it("samples local keys and delays paired relation validation until writes settle", () => {
  const { controls } = sampleLight(
    {
      id: "light",
      type: "light",
      lightType: "spot",
      intensity: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 12, value: 2 },
        ],
      },
    },
    6,
    24,
  );
  expect(controls.intensity).toBeCloseTo(1);
  controls.range = 100;
  controls.falloffStart = 200;
  expect(() => validateLight(controls, false)).not.toThrow();
  expect(() => validateLight(controls)).toThrow("falloffStart");
  controls.range = 300;
  controls.innerCone = 80;
  controls.outerCone = 60;
  expect(() => validateLight(controls, false)).not.toThrow();
  expect(() => validateLight(controls)).toThrow("innerCone");
  controls.outerCone = 90;
  expect(() => validateLight(controls)).not.toThrow();
});
it("computes normals from mirrored/nonuniform/sheared plane axes and handles degeneracy", () => {
  expect(planeNormal(affineMatrix4([-2, 0, 1, 3, 0, 0]))).toEqual([0, 0, -1]);
  expect(planeNormal(affineMatrix4([0, 0, 1, 3, 0, 0]))).toEqual([0, 0, 0]);
  const world = affineMatrix4([1, 0, 0, 1, 10, 20]);
  expect(worldLight("light", light(), [1, 1, 1, 1], world)).toMatchObject({
    position: [10, 20, 0],
    direction: [0, 0, 1],
  });
});
it("uses linear tint and preserves alpha, with unclamped light sums before source multiplication", () => {
  const source: [number, number, number, number] = [0.25, 0.5, 0.75, 0.125];
  expect(shadeFlatColor(source, [0, 0, 0], [0, 0, 1], [])).toEqual(source);
  shadeFlatColor(source, [0, 0, 0], [0, 0, 1], [light()]).forEach(
    (value, axis) => expect(value).toBeCloseTo(source[axis]!, 14),
  );
  expect(
    shadeFlatColor(source, [0, 0, 0], [0, 0, 1], [light({ intensity: 0 })]),
  ).toEqual([0, 0, 0, 0.125]);
  const shaded = shadeFlatColor(
    source,
    [0, 0, 0],
    [0, 0, 1],
    [light({ intensity: 2 })],
  );
  expect(shaded[0]).toBeGreaterThan(source[0]);
  expect(shaded[3]).toBe(source[3]);
  expect(
    shadeFlatColor(
      [1, 1, 1, 0.5],
      [0, 0, 0],
      [0, 0, 1],
      [light({ color: [1, 0, 0, 1] })],
    ),
  ).toEqual([0.9999999999999999, 0, 0, 0.5]);
});
it("uses symmetric diffuse, finite zero distance, smooth distance edge and degenerate normals", () => {
  const point = light({ type: "point", position: [0, 0, 50] });
  const sample = (
    normal: [number, number, number],
    position: [number, number, number] = [0, 0, 0],
  ) => shadeFlatColor([1, 1, 1, 1], position, normal, [point]);
  expect(sample([0, 0, 1])[0]).toBeCloseTo(0.7353569830524495);
  expect(sample([0, 0, -1])).toEqual(sample([0, 0, 1]));
  expect(sample([0, 0, 0])).toEqual([0, 0, 0, 1]);
  expect(sample([0, 0, 1], [0, 0, 50])[0]).toBeCloseTo(1);
  expect(sample([0, 0, 1], [0, 0, -50])).toEqual([0, 0, 0, 1]);
});
it("uses full-angle spot cones, soft midpoint, hard equal edges and zero-direction safety", () => {
  const spot = light({
    type: "spot",
    position: [0, 0, 0],
    direction: [0, 0, 1],
    range: 1000,
    falloffStart: 900,
    innerCone: 30,
    outerCone: 60,
  });
  const at = (degrees: number) => {
    const a = (degrees * Math.PI) / 180;
    return shadeFlatColor(
      [1, 1, 1, 1],
      [Math.sin(a) * 100, 0, Math.cos(a) * 100],
      [Math.sin(a), 0, Math.cos(a)],
      [spot],
    );
  };
  expect(at(0)[0]).toBeCloseTo(1);
  expect(at(30)[0]).toBeCloseTo(0);
  expect(at(22)[0]).toBeGreaterThan(0);
  expect(at(22)[0]).toBeLessThan(1);
  spot.innerCone = 60;
  expect(at(0)[0]).toBeCloseTo(1);
  expect(at(40)[0]).toBe(0);
  spot.direction = [0, 0, 0];
  expect(at(0)).toEqual([0, 0, 0, 1]);
});
