import { expect, it } from "vitest";
import {
  CompositionSchema,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { validateCinematicCompositionCoverage } from "../../packages/renderer-core/src/composition/adapters/cinematic-coverage.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const oscillation = "step(0.1, abs(sin(frame * 6.283185307179586)))";
const scene = (): Composition =>
  CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "cinematic-coverage",
    width: 100,
    height: 80,
    fps: 24,
    frameCount: 4,
    assets: [
      {
        id: "painted",
        type: "image",
        path: "painted.png",
        width: 120,
        height: 100,
        sha256: `sha256:${"a".repeat(64)}`,
      },
    ],
    layers: [
      { id: "camera", type: "camera", motionBlur: true },
      {
        id: "background",
        type: "image",
        threeD: true,
        motionBlur: true,
        size: [120, 100],
        sources: [{ asset: "painted" }],
        fit: "stretch",
        transform: { anchor: [0, 0, 0], position: [-10, -10, 0] },
      },
    ],
    motionBlur: {
      enabled: true,
      shutterAngle: 360,
      shutterPhase: 0,
      samples: 2,
    },
    metadata: {
      cinematicCoverage: {
        background: "background",
        paintedBounds: [0, 0, 120, 100],
      },
    },
  });
const opaque = () => {
  const data = new Uint8ClampedArray(120 * 100 * 4);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;
  return { width: 120, height: 100, data };
};
const background = (document: Composition) => document.layers[1]!;
const checkReload = (document: Composition) => {
  const validation = validateComposition(JSON.parse(JSON.stringify(document)));
  expect(validation.ok).toBe(true);
  if (!validation.ok) throw Error("Invalid coverage test fixture");
  return validateCinematicCompositionCoverage(validation.composition, opaque);
};
const projectBackground = (document: Composition, frame: number) =>
  evaluateComp(document, frame).layers[1]!.projection!.bounds!;

it.each([false, true])(
  "rejects uncovered rendered shutter samples after JSON reload (adaptive: %s)",
  (adaptive) => {
    const document = scene();
    document.motionBlur!.adaptive = adaptive;
    document.motionBlur!.samples = adaptive ? 8 : 2;
    document.expressions = {
      "camera.viewOffset.x": { source: `200 * ${oscillation}` },
    };
    for (let frame = 0; frame < document.frameCount; frame++)
      expect(projectBackground(document, frame).left).toBe(-10);
    const samples = [...evaluateCompositionExposure(document, 1)];
    expect(
      samples.some((tree) => tree.layers[1]!.projection!.bounds!.left > 100),
    ).toBe(true);
    try {
      checkReload(document);
      throw Error("Expected shutter coverage rejection");
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({
          code: "comp-camera-coverage",
          node: "background",
          frame: 0,
          path: "metadata.cinematicCoverage",
        }),
      );
    }
  },
);

it("keeps a held background covered while its camera samples a moving shutter", () => {
  const document = scene();
  background(document).motionBlur = false;
  document.expressions = {
    "camera.viewOffset.x": { source: `200 * ${oscillation}` },
  };
  expect(projectBackground(document, 0.25).left).toBe(190);
  const exposures = [...evaluateCompositionExposure(document, 1)];
  expect(
    exposures.every((tree) => tree.layers[1]!.projection!.bounds!.left === -10),
  ).toBe(true);
  expect(() => checkReload(document)).not.toThrow();
});

it("checks indexed camera poses at reachable shutter samples", () => {
  const document = scene();
  const camera = document.layers[0]!;
  if (camera.type !== "camera") throw Error("Fixture camera missing");
  camera.sampleTimes = [0, 0.25, 0.75, 1, 1.25, 2, 3];
  camera.viewOffset = {
    x: {
      keys: [
        { frame: 0, value: 0 },
        { frame: 1, value: 200, interpolation: "hold" },
        { frame: 3, value: 0, interpolation: "hold" },
      ],
    },
    y: 0,
  };
  expect(projectBackground(document, 0).left).toBe(-10);
  expect(projectBackground(document, 1).left).toBe(-10);
  expect(() => checkReload(document)).toThrow(/uncovered background/);
});

it("honors shutter window cuts instead of checking unreachable fractional poses", () => {
  const document = scene();
  document.motionBlur!.inPoint = 1;
  document.expressions = {
    "camera.viewOffset.x": {
      source: "frame > 0 && frame < 1 ? 200 : 0",
    },
  };
  expect(projectBackground(document, 0.75).left).toBe(190);
  expect(compositionExposureFrames(document, 1)).toEqual([1, 1.25]);
  expect(() => checkReload(document)).not.toThrow();
});

it("rejects reduced background opacity at a shutter sample", () => {
  const document = scene();
  document.expressions = {
    "background.transform.opacity": { source: `1 - 0.5 * ${oscillation}` },
  };
  expect(evaluateComp(document, 0).layers[1]!.opacity).toBe(1);
  expect(() => checkReload(document)).toThrow(/uncovered background/);
});

it("retains Gaussian focus padding at the background's sampled clock", () => {
  const document = scene();
  const camera = document.layers[0]!;
  if (camera.type !== "camera") throw Error("Fixture camera missing");
  Object.assign(camera, {
    depthOfField: true,
    focusDistance: 200,
    aperture: 0,
    blurModel: "gaussian",
    maxBlur: 4,
  });
  document.expressions = {
    "camera.aperture": { source: `100 * ${oscillation}` },
  };
  expect(evaluateComp(document, 0).layers[1]!.focusBlur).toBe(0);
  expect(
    [...evaluateCompositionExposure(document, 1)][0]!.layers[1]!.focusBlur,
  ).toBe(4);
  expect(() => checkReload(document)).toThrow(/uncovered background/);
});

it("preserves integer coverage and asset-alpha checks without an adapter tag", () => {
  const document = scene();
  document.motionBlur!.enabled = false;
  document.expressions = { "camera.viewOffset.x": { source: "200" } };
  expect(() => checkReload(document)).toThrow(/uncovered background/);
  const painted = opaque();
  painted.data[(50 * painted.width + 60) * 4 + 3] = 0;
  expect(() =>
    validateCinematicCompositionCoverage(scene(), () => painted),
  ).toThrow(/transparent pixels/);
});

it("preserves persisted declaration restrictions before evaluating exposures", () => {
  const document = scene();
  document.metadata!.cinematicCoverage = { background: "background" };
  expect(() => checkReload(document)).toThrow(/Invalid cinematic coverage/);
  const multiple = scene();
  const layer = background(multiple);
  if (layer.type !== "image") throw Error("Fixture background missing");
  layer.sources.push({ asset: "painted" });
  expect(() => checkReload(multiple)).toThrow(/single-state stretch image/);
});
