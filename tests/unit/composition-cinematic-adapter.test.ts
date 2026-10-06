import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  CinematicSceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import {
  cinematicToComposition,
  inspectCinematicCompositionCamera,
} from "../../packages/renderer-core/src/composition/adapters/cinematic.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
  sampleCinematicBlur,
} from "../../packages/renderer-core/src/cinematic-scene.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { projectLocalPoint } from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";

const inventory = JSON.parse(
  readFileSync("tests/visual/composition-baselines/fixtures.json", "utf8"),
) as { fixtures: { id: string; family: string; path: string }[] };
const fixtures = inventory.fixtures.filter(
  (fixture) => fixture.family === "cinematic",
);
const source = (path: string) =>
  CinematicSceneSchema.parse(JSON.parse(readFileSync(path, "utf8")));

it.each(fixtures)(
  "reproduces every native camera plane/focus state for $id",
  ({ path }) => {
    const input = source(path),
      original = structuredClone(input),
      legacy = compileCinematicScene(input);
    const composition = cinematicToComposition(input);
    expect(validateComposition(composition).ok).toBe(true);
    expect(
      composition.layers.every(
        (layer) => layer.type === "image" || layer.type === "camera",
      ),
    ).toBe(true);
    expect(composition.camera2d).toBeUndefined();
    let maximumDelta = 0;
    for (let frame = 0; frame < composition.frameCount; frame++) {
      const tree = evaluateComp(composition, frame);
      for (const node of legacy.nodes) {
        const state = tree.layers.find((layer) => layer.id === node.id)!,
          plane = state.projection!;
        const expected = projectCinematicNode(legacy, node, frame);
        const origin = projectLocalPoint(plane, [0, 0])!,
          end = projectLocalPoint(plane, [node.width, node.height])!;
        const actual = [
          origin[0],
          origin[1],
          end[0] - origin[0],
          end[1] - origin[1],
          plane.affineMatrix![0],
          state.focusBlur ?? 0,
        ];
        const values = [
          expected.left,
          expected.top,
          expected.width,
          expected.height,
          expected.scale,
          sampleCinematicBlur(legacy, node.id, frame),
        ];
        maximumDelta = Math.max(
          maximumDelta,
          ...actual.map((value, index) => Math.abs(value - values[index]!)),
        );
      }
    }
    expect(maximumDelta).toBeLessThanOrEqual(0.001);
    expect(input).toEqual(original);
    expect(composition.metadata!.nativeCameraValidation).toMatchObject({
      checkedFrames: composition.frameCount,
    });
  },
);

it("validates native framing after an authored camera edit", () => {
  const input = source(
    fixtures.find((fixture) => fixture.id.includes("threshold-push"))!.path,
  );
  const composition = cinematicToComposition(input),
    camera = composition.layers.find((layer) => layer.type === "camera")!;
  if (camera.type !== "camera") throw Error("fixture camera missing");
  camera.viewOffset = [1000, 0];
  expect(() =>
    inspectCinematicCompositionCamera(
      compileCinematicScene(input),
      composition,
    ),
  ).toThrow();
});

it("preserves fractional shutter clocks and supported shared effects", () => {
  const input = source(
    fixtures.find((fixture) => fixture.id.includes("threshold-push"))!.path,
  );
  input.effectsVersion = "effects-1";
  input.effects = [
    { type: "motion-blur", shutterAngle: 180, samples: 4 },
    { type: "grain", amount: 0.03, seed: 4 },
  ];
  const legacy = compileCinematicScene(input),
    composition = cinematicToComposition(input);
  expect(composition.motionBlur).toMatchObject({ enabled: true, samples: 4 });
  expect(
    composition.layers.some((layer) =>
      layer.effects?.some((effect) => effect.effect === "stylize.grain"),
    ),
  ).toBe(true);
  const camera = composition.layers.find((layer) => layer.type === "camera")!;
  expect(camera.sampleTimes!.some((time) => !Number.isInteger(time))).toBe(
    true,
  );
  for (const frame of camera.sampleTimes!) {
    const tree = evaluateComp(composition, frame);
    const node = legacy.nodes[0]!,
      state = tree.layers.find((layer) => layer.id === node.id)!;
    const actual = projectLocalPoint(state.projection!, [0, 0])!,
      expected = projectCinematicNode(legacy, node, frame);
    expect(actual[0]).toBeCloseTo(expected.left, 8);
    expect(actual[1]).toBeCloseTo(expected.top, 8);
  }
});
