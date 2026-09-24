import {
  coverFit,
  evaluateFrame,
  PREVIEW_LIMITS,
  resolvePreviewScene,
} from "../../packages/renderer-core/src/scene.ts";
import { describe, expect, it } from "vitest";

const input = {
  sourceWidth: 1600,
  sourceHeight: 900,
  depthWidth: 1600,
  depthHeight: 900,
  durationMs: 5000,
  fps: 30,
  canvasWidth: 1920,
  canvasHeight: 1080,
  preset: "slow_push",
  intensity: "subtle",
} as const;

describe("v0.3 slow_push", () => {
  it("resolves a versioned scene and reproducible endpoint frames", () => {
    const first = resolvePreviewScene(input);
    const second = resolvePreviewScene(input);
    expect(first).toEqual(second);
    expect(first.presetVersion).toBe("slow_push@0.3.0");
    expect(evaluateFrame(first, 0)).toMatchObject({
      timeSeconds: 0,
      progress: 0,
      scale: 1,
    });
    expect(evaluateFrame(first, 149)).toMatchObject({
      timeSeconds: 149 / 30,
      progress: 1,
      scale: 1.025,
    });
    expect(evaluateFrame(first, 75)).toEqual(evaluateFrame(second, 75));
  });

  it("clamps travel, depth and crop to conservative limits", () => {
    const scene = resolvePreviewScene({
      ...input,
      requestedTravel: 1,
      requestedDepthStrength: 1,
      overscan: 0,
    });
    expect(scene.motion.travel).toBe(PREVIEW_LIMITS.maximumTravel);
    expect(scene.motion.depthStrength).toBe(
      PREVIEW_LIMITS.maximumDepthStrength,
    );
    expect(scene.motion.overscan).toBe(PREVIEW_LIMITS.minimumOverscan);
    expect(scene.motion.maximumCrop).toBeLessThan(scene.motion.overscan);
    expect(scene.warnings).toHaveLength(3);
    for (let index = 0; index < scene.timeline.frameCount; index += 1) {
      const frame = evaluateFrame(scene, index);
      expect(frame.cameraTravel).toBeLessThanOrEqual(
        PREVIEW_LIMITS.maximumTravel,
      );
      expect(frame.depthStrength).toBeLessThanOrEqual(
        PREVIEW_LIMITS.maximumDepthStrength,
      );
    }
  });

  it("covers wide and tall source ratios", () => {
    expect(coverFit(2400, 1000, 1920, 1080)).toEqual({ x: 1.35, y: 1 });
    expect(coverFit(1000, 2400, 1920, 1080)).toEqual({
      x: 1,
      y: 4.266666666666667,
    });
  });

  it("rejects bad timelines or dimensions", () => {
    expect(() => resolvePreviewScene({ ...input, depthWidth: 100 })).toThrow(
      "Depth dimensions",
    );
    expect(() => resolvePreviewScene({ ...input, durationMs: 3033 })).toThrow(
      "Duration",
    );
    expect(() => evaluateFrame(resolvePreviewScene(input), 150)).toThrow(
      "frameIndex",
    );
  });
});
