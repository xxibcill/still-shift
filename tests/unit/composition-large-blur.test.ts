import { describe, expect, it } from "vitest";
import {
  blurRescaleSteps,
  rescaledGaussianBlur,
} from "../../packages/renderer-core/src/composition/render/webgl-blur-rescale.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import {
  blurKernelLength,
  gaussianBoxWidth,
} from "../../packages/renderer-core/src/composition/render/webgl-blur-kernel.ts";
describe("bounded raster Gaussian plans", () => {
  it("preserves the existing Gaussian domain", () => {
    expect(blurRescaleSteps(0)).toEqual([]);
    expect(blurRescaleSteps(128)).toEqual([]);
    expect(blurRescaleSteps(135)).toEqual([]);
  });
  it("progressively halves before the final centered scale", () => {
    expect(blurRescaleSteps(270)).toEqual([0.5]);
    const steps = blurRescaleSteps(532);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toBe(0.5);
    expect(steps.reduce((a, b) => a * b, 1) * 532).toBeCloseTo(135, 4);
  });
  it("clamps mapped sigma before allocating kernel storage", () => {
    for (const sigma of [533, 1000, 1500, 500000]) {
      expect(gaussianBoxWidth(sigma)).toBe(gaussianBoxWidth(532));
      expect(blurKernelLength(sigma)).toBe(2999);
      expect(blurRescaleSteps(sigma)).toEqual(blurRescaleSteps(532));
    }
  });
  it("rejects invalid sigmas", () => {
    for (const sigma of [NaN, Infinity, -1])
      expect(() => blurRescaleSteps(sigma)).toThrow("comp-effect-params");
  });
  it("releases intermediate textures without publishing a failed pass", () => {
    const owned: object[] = [],
      released: object[] = [];
    const device = {
      surface(width: number, height: number) {
        const surface = { width, height };
        owned.push(surface);
        return surface;
      },
      pass() {
        throw new Error("injected shader failure");
      },
      release(surface: object) {
        released.push(surface);
      },
      swap() {
        throw new Error("must not publish failed output");
      },
    } as unknown as WebglDevice;
    expect(() =>
      rescaledGaussianBlur(
        device,
        { width: 512, height: 512 } as WebglSurface,
        532,
        () => {},
      ),
    ).toThrow("injected shader failure");
    expect(owned).toHaveLength(1);
    expect(released).toEqual(owned);
  });
});
