import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  linearBlendPixel,
  linearLerpPixel,
  decodeSrgb,
  encodeSrgb,
} from "../../packages/renderer-core/src/composition/render/linear-color.ts";
const mix = (
  source: number[],
  backdrop: number[],
  mode: "normal" | "add" | "multiply" = "normal",
) => Array.from(linearBlendPixel(source, backdrop, mode));
describe("optional linear-light composition", () => {
  it("accepts the opt-in contract", () => {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "linear",
      width: 16,
      height: 16,
      fps: 24,
      frameCount: 1,
      assets: [],
      layers: [],
      colorSpace: "linear-srgb",
    };
    expect(validateComposition(comp).ok).toBe(true);
  });
  it("round-trips byte transfer values", () => {
    for (let byte = 0; byte < 256; byte++)
      expect(encodeSrgb(decodeSrgb(byte))).toBe(byte);
  });
  it("composites half-covered white over black in linear light", () => {
    expect(mix([128, 128, 128, 128], [0, 0, 0, 255])).toEqual([
      188, 188, 188, 255,
    ]);
  });
  it("preserves neutral transparent and opaque inputs", () => {
    expect(mix([0, 0, 0, 0], [20, 80, 120, 255])).toEqual([20, 80, 120, 255]);
    expect(mix([255, 40, 80, 255], [20, 80, 120, 255])).toEqual([
      255, 40, 80, 255,
    ]);
    expect(mix([128, 128, 128, 128], [0, 0, 0, 0])).toEqual([
      128, 128, 128, 128,
    ]);
  });
  it("retains premultiplied alpha in additive blending and adjustment interpolation", () => {
    expect(mix([128, 0, 0, 128], [0, 128, 0, 128], "add")).toEqual([
      188, 188, 0, 255,
    ]);
    expect(
      Array.from(linearLerpPixel([255, 255, 255, 255], [0, 0, 0, 255], 128)),
    ).toEqual([188, 188, 188, 255]);
    expect(mix([128, 128, 128, 128], [255, 255, 255, 255], "multiply")).toEqual(
      [255, 255, 255, 255],
    );
  });
});
