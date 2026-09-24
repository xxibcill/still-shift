import { describe, expect, it } from "vitest";

import {
  analyzeDepthSafety,
  applySafetyToScene,
  fallback2DScene,
} from "../../packages/renderer-core/src/safety.ts";
import {
  evaluateFrame,
  resolvePreviewScene,
} from "../../packages/renderer-core/src/scene.ts";

const scene = (intensity: "subtle" | "standard" | "strong" = "standard") =>
  resolvePreviewScene({
    sourceWidth: 32,
    sourceHeight: 16,
    depthWidth: 32,
    depthHeight: 16,
    durationMs: 5000,
    fps: 30,
    canvasWidth: 1920,
    canvasHeight: 1080,
    preset: "horizontal_drift",
    intensity,
    seed: 1842,
  });

const pixels = (
  depthAt: (x: number, y: number) => number,
  sourceAt: (x: number, y: number) => number = () => 128,
  width = 32,
  height = 16,
) => {
  const source = new Uint8ClampedArray(width * height * 4);
  const depth = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const rgb = sourceAt(x, y);
      const value = depthAt(x, y);
      source.set([rgb, rgb, rgb, 255], offset);
      depth.set([value, value, value, 255], offset);
    }
  }
  return { width, height, source, depth };
};

describe("v0.5 safety analysis and 2D fallback", () => {
  it("keeps a smooth safe scene unchanged", () => {
    const assessment = analyzeDepthSafety(pixels((x) => 64 + x * 4));
    const original = scene();
    const resolved = applySafetyToScene(original, assessment);
    expect(assessment.version).toBe("risk-0.5.0");
    expect(assessment.riskScore).toBeLessThan(0.45);
    expect(resolved.motion).toEqual(original.motion);
    expect(resolved.warnings).toEqual(original.warnings);
    expect(resolved.quality?.fallback).toBe(false);
  });

  it("reduces lateral and depth motion at a central unsupported edge", () => {
    const assessment = analyzeDepthSafety(pixels((x) => (x < 16 ? 64 : 192)));
    const original = scene();
    const resolved = applySafetyToScene(original, assessment);
    expect(assessment.signals.centralDiscontinuityDensity).toBeGreaterThan(0);
    expect(assessment.signals.rgbDepthEdgeDisagreement).toBe(1);
    expect(resolved.quality?.fallback).toBe(false);
    expect(resolved.motion.lateralTravel).toBeLessThan(
      original.motion.lateralTravel,
    );
    expect(resolved.motion.depthStrength).toBeLessThan(
      original.motion.depthStrength,
    );
    expect(resolved.warnings.map((warning) => warning.code)).toContain(
      "LATERAL_MOTION_REDUCED",
    );
  });

  it("measures RGB boundaries without matching depth edges", () => {
    const assessment = analyzeDepthSafety(
      pixels(
        (x) => 64 + Math.round(x / 2),
        (x) => (x < 128 ? 32 : 224),
        256,
        256,
      ),
    );
    expect(assessment.signals.discontinuityDensity).toBe(0);
    expect(assessment.signals.rgbDepthEdgeDisagreement).toBe(1);
    expect(assessment.riskScore).toBeGreaterThanOrEqual(0.4);
    expect(
      applySafetyToScene(scene(), assessment).motion.depthStrength,
    ).toBeLessThan(scene().motion.depthStrength);
  });

  it("downgrades a risky strong request and repairs an insufficient crop envelope", () => {
    const assessment = analyzeDepthSafety(pixels((x) => (x < 16 ? 64 : 192)));
    const original = scene("strong");
    const underscanned = {
      ...original,
      motion: { ...original.motion, overscan: 0.01 },
    };
    const resolved = applySafetyToScene(underscanned, assessment);
    expect(resolved.motion.intensity).toBe("standard");
    expect(resolved.motion.travel).toBeLessThan(original.motion.travel);
    expect(resolved.motion.maximumCrop).toBeLessThan(
      original.motion.maximumCrop,
    );
    expect(resolved.motion.overscan).toBeGreaterThanOrEqual(
      resolved.motion.maximumCrop,
    );
    expect(resolved.quality?.signals.overscanShortfall).toBeGreaterThan(0);
    expect(resolved.warnings.map((warning) => warning.code)).toContain(
      "INTENSITY_DOWNGRADED",
    );
  });

  it("falls back on flat depth with a stable reason and valid 2D frames", () => {
    const assessment = analyzeDepthSafety(pixels(() => 128));
    const resolved = applySafetyToScene(scene(), assessment);
    expect(assessment.flatDepth).toBe(true);
    expect(resolved.motion.mode).toBe("fallback_2d");
    expect(resolved.quality?.fallbackReason).toBe("DEPTH_RANGE_FLAT");
    expect(resolved.warnings.map((warning) => warning.code)).toEqual([
      "DEPTH_RANGE_FLAT",
      "FALLBACK_2D_USED",
    ]);
    const first = evaluateFrame(resolved, 0);
    const last = evaluateFrame(resolved, 149);
    expect(first.depthStrength).toBe(0);
    expect(last.depthStrength).toBe(0);
    expect(first.translationX).toBeLessThan(last.translationX);
    expect(last.scale).toBeGreaterThan(first.scale);
  });

  it("falls back on extreme saturation and dense depth edges", () => {
    const extreme = applySafetyToScene(
      scene(),
      analyzeDepthSafety(pixels((x) => (x % 2 ? 0 : 255))),
    );
    expect(extreme.quality?.fallbackReason).toBe("DEPTH_RANGE_EXTREME");

    const dense = applySafetyToScene(
      scene(),
      analyzeDepthSafety(pixels((x) => (x % 2 ? 64 : 192))),
    );
    expect(dense.quality?.fallbackReason).toBe("DEPTH_EDGE_RISK_HIGH");
  });

  it("rejects near-endpoint plateaus but keeps a full-range gradient", () => {
    const extreme = analyzeDepthSafety(
      pixels(
        (x) => (x < 16 ? 4 : 251),
        (x) => (x < 16 ? 4 : 251),
      ),
    );
    expect(extreme.signals.depthSaturationFraction).toBe(0);
    expect(extreme.signals.depthRange).toBeGreaterThan(0.85);
    expect(extreme.extremeDepth).toBe(true);
    expect(applySafetyToScene(scene(), extreme).quality?.fallbackReason).toBe(
      "DEPTH_RANGE_EXTREME",
    );

    const gradient = analyzeDepthSafety(
      pixels((x) => 8 + Math.round((x * 239) / 31)),
    );
    expect(gradient.signals.depthRange).toBeGreaterThan(0.85);
    expect(gradient.extremeDepth).toBe(false);
  });

  it("provides a 2D scene when depth preparation fails", () => {
    const resolved = fallback2DScene(scene(), "DEPTH_PREPARATION_FAILED");
    expect(resolved.motion.mode).toBe("fallback_2d");
    expect(resolved.quality?.fallbackReason).toBe("DEPTH_PREPARATION_FAILED");
    expect(resolved.warnings.map((warning) => warning.code)).toContain(
      "FALLBACK_2D_USED",
    );
  });

  it("rejects malformed pixel buffers", () => {
    expect(() =>
      analyzeDepthSafety({
        width: 32,
        height: 16,
        source: new Uint8Array(4),
        depth: new Uint8Array(4),
      }),
    ).toThrow("pixel buffers");
  });
});
