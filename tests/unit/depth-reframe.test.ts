import { describe, expect, it } from "vitest";
import {
  cropSafetyPixels,
  estimateDepthFocus,
  estimateDepthSubject,
  focusCropWindow,
  subjectCropViolation,
} from "../../packages/renderer-core/src/depth-reframe.ts";
import {
  evaluateFrame,
  resolvePreviewScene,
} from "../../packages/renderer-core/src/scene.ts";

describe("depth image reframing", () => {
  it("anchors a 16:9 source inside a vertical crop and clamps at the edge", () => {
    const center = focusCropWindow(1920, 1080, 1080, 1920, [0.5, 0.5]);
    expect(center.width).toBeCloseTo(0.31640625);
    expect(center.height).toBe(1);
    expect(center.x + center.width / 2).toBeCloseTo(0.5);
    const right = focusCropWindow(1920, 1080, 1080, 1920, [1, 0]);
    expect(right.x + right.width).toBeCloseTo(1);
    expect(right.y).toBe(0);
  });

  it("finds a large near-depth subject and evaluates only visible pixels", () => {
    const width = 32;
    const height = 16;
    const depth = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        depth[index] = x >= 22 && x <= 28 && y >= 4 && y <= 12 ? 240 : 40;
        depth[index + 3] = 255;
      }
    const focus = estimateDepthFocus(width, height, depth);
    expect(focus).not.toBeNull();
    expect(focus![0]).toBeGreaterThan(0.7);
    const subject = estimateDepthSubject(width, height, depth);
    expect(subject?.bounds.width).toBeCloseTo(7 / 32);
    expect(subject?.areaFraction).toBeGreaterThan(0.1);
    const crop = focusCropWindow(width, height, 9, 16, focus!);
    expect(subjectCropViolation(subject!, crop)).toBeNull();
    expect(
      subjectCropViolation(
        subject!,
        focusCropWindow(width, height, 9, 16, [0.2, 0.5]),
      )?.right,
    ).toBeGreaterThan(0.4);
    const visible = cropSafetyPixels(width, height, depth, crop);
    expect(visible.width).toBeLessThan(width);
    expect(visible.pixels.length).toBe(visible.width * visible.height * 4);
    expect(
      estimateDepthFocus(width, height, new Uint8Array(depth.length)),
    ).toBeNull();
  });

  it("does not mistake a depth gradient in two frame edges for a focal subject", () => {
    const width = 32;
    const height = 16;
    const depth = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        depth[(y * width + x) * 4] = Math.round(
          255 * (0.4 * (x / (width - 1)) + 0.4 * (y / (height - 1))),
        );
      }
    expect(estimateDepthSubject(width, height, depth)).toBeNull();
  });

  it("drifts along the source axis with spare pixels", () => {
    const input = {
      sourceWidth: 1920,
      sourceHeight: 1080,
      depthWidth: 1920,
      depthHeight: 1080,
      canvasWidth: 1080,
      canvasHeight: 1920,
      durationMs: 3000,
      fps: 30,
      preset: "horizontal_drift" as const,
      intensity: "standard" as const,
      focus: [0.5, 0.5] as const,
    };
    const wide = resolvePreviewScene(input);
    expect(wide.motion.driftAxis).toBe("x");
    expect(evaluateFrame(wide, 0).translationX).not.toBe(0);
    const tall = resolvePreviewScene({
      ...input,
      sourceWidth: 900,
      sourceHeight: 1920,
      depthWidth: 900,
      depthHeight: 1920,
    });
    expect(tall.motion.driftAxis).toBe("y");
    expect(evaluateFrame(tall, 0).translationY).not.toBe(0);
    expect(evaluateFrame(tall, 0).translationX).toBe(0);
  });
});
