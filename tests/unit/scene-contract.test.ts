import {
  AnimationRequestSchema,
  AnimationWarningSchema,
  SceneManifestSchema,
} from "@still-shift/scene-contract";
import { describe, expect, it } from "vitest";

const validRequest = {
  inputPath: "input.png",
  outputPath: "output.noop.json",
  durationMs: 5000,
  fps: 30,
  width: 1920,
  height: 1080,
  preset: "auto",
  intensity: "standard",
  seed: 1842,
} as const;

const validScene = {
  schemaVersion: "0.1",
  sourceHash: `sha256:${"a".repeat(64)}`,
  pipelineVersion: "noop-prep-0.1.0",
  rendererVersion: "noop-render-0.1.0",
  timeline: { durationMs: 5000, fps: 30, frameCount: 150 },
  canvas: { width: 1920, height: 1080 },
  depth: null,
  motion: {
    preset: "slow_push",
    intensity: "standard",
    seed: 1842,
    safeCrop: 0,
  },
  quality: { riskScore: 0, fallback: false, warnings: [] },
  execution: { adapter: "noop", producesVideo: false },
} as const;

const validRenderScene = {
  rendererVersion: "preview-render-0.5.0",
  presetVersion: "slow_push@0.3.0",
  timeline: validScene.timeline,
  source: { width: 640, height: 360 },
  canvas: validScene.canvas,
  motion: {
    mode: "depth",
    preset: "slow_push",
    intensity: "standard",
    seed: 1842,
    travel: 0.02,
    depthStrength: 0.02,
    lateralTravel: 0,
    rollDegrees: 0,
    overscan: 0.1,
    maximumCrop: 0.02,
  },
  quality: {
    analysisVersion: "risk-0.5.0",
    riskScore: 0.1,
    fallback: false,
    fallbackReason: null,
    signals: { overscanShortfall: 0 },
  },
  warnings: [],
} as const;

const validWebglScene = {
  ...validScene,
  rendererVersion: validRenderScene.rendererVersion,
  depth: {
    asset: `sha256:${"b".repeat(64)}`,
    strength: validRenderScene.motion.depthStrength,
    near: 0,
    far: 1,
  },
  motion: {
    ...validScene.motion,
    safeCrop: validRenderScene.motion.maximumCrop,
  },
  quality: { riskScore: 0.1, fallback: false, warnings: [] },
  renderScene: validRenderScene,
  execution: { adapter: "webgl", producesVideo: true },
} as const;

describe("AnimationRequestSchema", () => {
  it("accepts the fixed Phase 0 output contract", () => {
    expect(AnimationRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("rejects durations that do not map to a whole frame", () => {
    const result = AnimationRequestSchema.safeParse({
      ...validRequest,
      durationMs: 3033,
    });

    expect(result.success).toBe(false);
  });
});

describe("SceneManifestSchema", () => {
  it("reports schema version 0.1 and ignores unknown fields", () => {
    const parsed = SceneManifestSchema.parse({
      ...validScene,
      futureField: true,
    });

    expect(parsed.schemaVersion).toBe("0.1");
    expect(parsed).not.toHaveProperty("futureField");
  });

  it("rejects unknown presets", () => {
    const result = SceneManifestSchema.safeParse({
      ...validScene,
      motion: { ...validScene.motion, preset: "orbit" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-finite scene values", () => {
    const result = SceneManifestSchema.safeParse({
      ...validScene,
      quality: { ...validScene.quality, riskScore: Number.NaN },
    });

    expect(result.success).toBe(false);
  });

  it("accepts a complete WebGL renderer scene", () => {
    expect(SceneManifestSchema.safeParse(validWebglScene).success).toBe(true);
  });

  it("rejects invalid values inside the renderer scene", () => {
    const unknownPreset = SceneManifestSchema.safeParse({
      ...validWebglScene,
      renderScene: {
        ...validRenderScene,
        motion: { ...validRenderScene.motion, preset: "orbit" },
      },
    });
    const nonFiniteMotion = SceneManifestSchema.safeParse({
      ...validWebglScene,
      renderScene: {
        ...validRenderScene,
        motion: { ...validRenderScene.motion, travel: Number.NaN },
      },
    });

    expect(unknownPreset.success).toBe(false);
    expect(nonFiniteMotion.success).toBe(false);
  });

  it("rejects renderer scene fields that disagree with the manifest", () => {
    const mismatch = SceneManifestSchema.safeParse({
      ...validWebglScene,
      renderScene: {
        ...validRenderScene,
        motion: { ...validRenderScene.motion, seed: 42 },
      },
    });

    expect(mismatch.success).toBe(false);
  });
});

describe("AnimationWarningSchema", () => {
  it("accepts warnings from the frozen taxonomy", () => {
    expect(
      AnimationWarningSchema.parse({
        code: "MOTION_CLAMPED",
        message: "Requested motion exceeded the safe envelope.",
      }).code,
    ).toBe("MOTION_CLAMPED");
  });

  it("rejects warning codes outside the taxonomy", () => {
    expect(
      AnimationWarningSchema.safeParse({
        code: "UNKNOWN_WARNING",
        message: "Unknown",
      }).success,
    ).toBe(false);
  });
});
