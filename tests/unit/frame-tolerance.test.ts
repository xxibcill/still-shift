import { describe, expect, it } from "vitest";

import {
  compareFrames,
  meetsTier,
  strictestTier,
  worstTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";

const width = 32;
const height = 16;

/** Deterministic RGBA test chart with gradients and hard edges. */
const chart = () => {
  const frame = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      frame[offset] = x * 8;
      frame[offset + 1] = y * 16;
      frame[offset + 2] = x < width / 2 ? 40 : 210;
      frame[offset + 3] = 255;
    }
  return frame;
};

const adjust = (frame: Uint8Array, delta: (index: number) => number) =>
  frame.map((value, index) =>
    index % 4 === 3 ? value : Math.max(0, Math.min(255, value + delta(index))),
  );

describe("frame tolerance", () => {
  it("reports identical frames as exact", () => {
    const frame = chart();
    const result = compareFrames(frame, frame.slice(), width, height);
    expect(result).toEqual({
      maxChannelDelta: 0,
      differingChannels: 0,
      psnr: Infinity,
      ssim: 1,
    });
    expect(strictestTier(result)).toBe("exact");
  });

  it("accepts sparse one-level rounding differences as near", () => {
    const frame = chart();
    const rounded = adjust(frame, (index) => (index % 97 === 0 ? 1 : 0));
    const result = compareFrames(frame, rounded, width, height);
    expect(result.maxChannelDelta).toBe(1);
    expect(result.psnr).toBeGreaterThan(50);
    expect(strictestTier(result)).toBe("near");
  });

  it("classifies a uniform two-level shift as perceptual, not near", () => {
    const frame = chart();
    const shifted = adjust(frame, () => 2);
    const result = compareFrames(frame, shifted, width, height);
    expect(meetsTier(result, "near")).toBe(false);
    expect(strictestTier(result)).toBe("perceptual");
  });

  it("rejects visible changes from every tier", () => {
    const frame = chart();
    const wrong = adjust(frame, (index) => (index % 4 === 0 ? 60 : 0));
    const result = compareFrames(frame, wrong, width, height);
    expect(strictestTier(result)).toBeNull();
  });

  it("compares RGB against RGBA frames and ignores alpha", () => {
    const frame = chart();
    const rgb = new Uint8Array(width * height * 3);
    for (let pixel = 0; pixel < width * height; pixel += 1)
      rgb.set(frame.subarray(pixel * 4, pixel * 4 + 3), pixel * 3);
    const transparent = frame.map((value, index) =>
      index % 4 === 3 ? 0 : value,
    );
    expect(compareFrames(rgb, transparent, width, height).maxChannelDelta).toBe(
      0,
    );
  });

  it("rejects frames whose size does not match the dimensions", () => {
    expect(() =>
      compareFrames(chart(), new Uint8Array(10), width, height),
    ).toThrow("Frame size");
  });

  it.each([0, -1])("rejects invalid height %s", (invalidHeight) => {
    expect(() =>
      compareFrames(new Uint8Array(0), new Uint8Array(0), 1, invalidHeight),
    ).toThrow("Frame dimensions must be positive integers");
  });

  it("reports the strictest tier that every frame satisfies", () => {
    const frame = chart();
    const exact = compareFrames(frame, frame, width, height);
    const near = compareFrames(
      frame,
      adjust(frame, (index) => (index % 97 === 0 ? 1 : 0)),
      width,
      height,
    );
    const perceptual = compareFrames(
      frame,
      adjust(frame, () => 2),
      width,
      height,
    );
    const rejected = compareFrames(
      frame,
      adjust(frame, () => 60),
      width,
      height,
    );
    expect(worstTier([exact, exact])).toBe("exact");
    expect(worstTier([exact, near, perceptual])).toBe("perceptual");
    expect(worstTier([near, rejected])).toBeNull();
  });

  it("does not infer perceptual parity from a near classification", () => {
    const frame = new Uint8Array(8 * 8 * 3).fill(100);
    const rounded = frame.slice();
    for (let pixel = 0; pixel < 40; pixel += 1)
      rounded.fill(pixel % 2 ? 101 : 99, pixel * 3, pixel * 3 + 3);
    const near = compareFrames(frame, rounded, 8, 8);
    const perceptual = compareFrames(frame, frame.slice().fill(102), 8, 8);
    expect(strictestTier(near)).toBe("near");
    expect(meetsTier(near, "perceptual")).toBe(false);
    expect(strictestTier(perceptual)).toBe("perceptual");
    expect(worstTier([near])).toBe("near");
    expect(worstTier([near, perceptual])).toBeNull();
  });
});
