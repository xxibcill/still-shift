import {
  coverFit,
  evaluateFrame,
  PRESET_LIMITS,
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
      depthStrength: 0,
    });
    expect(evaluateFrame(first, 149)).toMatchObject({
      timeSeconds: 149 / 30,
      progress: 1,
      scale: 1.025,
      depthStrength: 0.025,
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

describe("v0.4 preset library", () => {
  it("documents deterministic endpoints for every preset and intensity", () => {
    for (const preset of [
      "slow_push",
      "horizontal_drift",
      "cinematic_float",
    ] as const) {
      for (const intensity of ["subtle", "standard", "strong"] as const) {
        const scene = resolvePreviewScene({
          ...input,
          preset,
          intensity,
          seed: 1842,
        });
        const first = evaluateFrame(scene, 0);
        const last = evaluateFrame(scene, scene.timeline.frameCount - 1);
        expect(first.scale).toBe(1);
        expect(first.depthStrength).toBe(0);
        expect(last.scale).toBeCloseTo(1 + scene.motion.travel);
        expect(last.depthStrength).toBeCloseTo(scene.motion.depthStrength);
        expect(first.translationY).toBeCloseTo(0);
        expect(last.translationY).toBeCloseTo(0);
        expect(first.rollDegrees).toBeCloseTo(0);
        expect(last.rollDegrees).toBeCloseTo(0);
        if (preset === "horizontal_drift") {
          expect(first.translationX).toBeCloseTo(-scene.motion.lateralTravel);
          expect(last.translationX).toBeCloseTo(scene.motion.lateralTravel);
        } else if (preset === "cinematic_float") {
          expect(first.translationX).toBeCloseTo(
            -scene.motion.lateralTravel * 0.2,
          );
          expect(last.translationX).toBeCloseTo(
            scene.motion.lateralTravel * 0.2,
          );
        } else {
          expect(first.translationX).toBe(0);
          expect(last.translationX).toBe(0);
        }
        expect(scene.motion.maximumCrop).toBeLessThanOrEqual(
          scene.motion.overscan,
        );
      }
    }
  });

  it("uses the seed only for repeatable cinematic variation", () => {
    const first = resolvePreviewScene({
      ...input,
      preset: "cinematic_float",
      intensity: "standard",
      seed: 19,
    });
    const same = resolvePreviewScene({
      ...input,
      preset: "cinematic_float",
      intensity: "standard",
      seed: 19,
    });
    const other = resolvePreviewScene({
      ...input,
      preset: "cinematic_float",
      intensity: "standard",
      seed: 20,
    });
    expect(evaluateFrame(first, 67)).toEqual(evaluateFrame(same, 67));
    expect(evaluateFrame(first, 67).translationY).not.toBe(
      evaluateFrame(other, 67).translationY,
    );
  });

  it("keeps every evaluated frame inside hard camera limits", () => {
    for (const preset of [
      "slow_push",
      "horizontal_drift",
      "cinematic_float",
    ] as const) {
      const scene = resolvePreviewScene({
        ...input,
        preset,
        intensity: "strong",
        seed: 4294967295,
      });
      for (let index = 0; index < scene.timeline.frameCount; index += 1) {
        const frame = evaluateFrame(scene, index);
        expect(Math.abs(frame.translationX)).toBeLessThanOrEqual(
          PREVIEW_LIMITS.maximumLateralTravel,
        );
        expect(Math.abs(frame.translationY)).toBeLessThanOrEqual(
          PREVIEW_LIMITS.maximumLateralTravel,
        );
        expect(Math.abs(frame.rollDegrees)).toBeLessThanOrEqual(
          PREVIEW_LIMITS.maximumRollDegrees,
        );
        expect(frame.depthStrength).toBeLessThanOrEqual(
          PREVIEW_LIMITS.maximumDepthStrength,
        );
      }
    }
  });

  it("reports clamps for oversized lateral and roll requests", () => {
    const scene = resolvePreviewScene({
      ...input,
      preset: "cinematic_float",
      intensity: "standard",
      requestedLateralTravel: 1,
      requestedRollDegrees: 1,
      overscan: 0.14,
    });
    expect(scene.motion.lateralTravel).toBe(
      PRESET_LIMITS.cinematic_float.lateralTravel,
    );
    expect(scene.motion.rollDegrees).toBe(PREVIEW_LIMITS.maximumRollDegrees);
    expect(scene.warnings).toEqual([
      "lateral travel clamped to 0.035",
      "roll clamped to 0.3",
    ]);
  });

  it("respects preset-specific axes and raises overscan for a curved float", () => {
    const push = resolvePreviewScene({
      ...input,
      requestedLateralTravel: 0.02,
    });
    expect(push.motion.lateralTravel).toBe(0);
    expect(push.warnings).toContain("lateral travel clamped to 0");

    const floating = resolvePreviewScene({
      ...input,
      preset: "cinematic_float",
      intensity: "strong",
      overscan: 0.1,
    });
    expect(floating.motion.overscan).toBeCloseTo(floating.motion.maximumCrop);
    expect(floating.warnings).toContain(
      "overscan raised to fit resolved motion",
    );
  });
});
