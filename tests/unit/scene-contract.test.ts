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
