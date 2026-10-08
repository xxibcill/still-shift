import { expect, it } from "vitest";
import {
  inspectCompositionPng,
  tagCompositionSrgbPng,
} from "../../packages/animation-engine/src/composition-media-color.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
  mediaPngPixels,
} from "../helpers/composition-media-png.ts";
const pixels = Buffer.from([255, 0, 0, 128]);
const png = (chunks: Buffer[]) => mediaRgbaPng(1, 1, pixels, chunks);
it("honors PNG color priority and rejects unsupported authoritative ICC/HDR metadata", () => {
  const icc = mediaPngChunk("iCCP", Buffer.from("unsupported profile"));
  const srgb = mediaPngChunk("sRGB", Buffer.from([0]));
  const cicp = mediaPngChunk("cICP", Buffer.from([1, 13, 0, 1]));
  expect(inspectCompositionPng(png([cicp, icc, srgb])).colorAuthority).toBe(
    "cICP",
  );
  expect(() => inspectCompositionPng(png([icc, srgb]))).toThrow(/ICC/);
  expect(() =>
    inspectCompositionPng(
      png([mediaPngChunk("cICP", Buffer.from([9, 16, 0, 1])), srgb]),
    ),
  ).toThrow(/cICP/);
  expect(inspectCompositionPng(png([srgb])).colorAuthority).toBe("sRGB");
  expect(inspectCompositionPng(png([])).colorAuthority).toBe(
    "authored-untagged-srgb",
  );
  expect(() =>
    inspectCompositionPng(
      png([mediaPngChunk("gAMA", Buffer.from([0, 0, 177, 143]))]),
    ),
  ).toThrow(/Legacy/);
});
it("tags already-converted samples with only sRGB without changing alpha or picture bytes", () => {
  const original = png([mediaPngChunk("cICP", Buffer.from([9, 16, 0, 1]))]);
  const canonical = tagCompositionSrgbPng(original);
  expect(inspectCompositionPng(canonical)).toMatchObject({
    width: 1,
    height: 1,
    bitDepth: 8,
    colorType: 6,
    colorAuthority: "sRGB",
  });
  expect(mediaPngPixels(canonical)).toEqual(pixels);
});
it("rejects corrupted chunks, duplicate headers and animated PNG sources", () => {
  const corrupt = png([]);
  corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1;
  expect(() => inspectCompositionPng(corrupt)).toThrow(/PNG/);
  expect(() =>
    inspectCompositionPng(png([mediaPngChunk("acTL", Buffer.alloc(8))])),
  ).toThrow(/PNG/);
  expect(() =>
    inspectCompositionPng(
      png([
        mediaPngChunk("sRGB", Buffer.from([0])),
        mediaPngChunk("sRGB", Buffer.from([0])),
      ]),
    ),
  ).toThrow(/PNG/);
});
