import { describe, expect, it } from "vitest";
import {
  COMPOSITION_OUTPUT_FORMATS,
  compositionOutputProfile,
  validateCompositionOutput,
} from "../../packages/execution-runtime/src/composition-output.ts";

describe("composition delivery dimensions and transports", () => {
  it.each(COMPOSITION_OUTPUT_FORMATS)(
    "bounds %s dimensions before allocating or starting encoders",
    (format) => {
      const profile = compositionOutputProfile(format);
      for (const [width, height] of [
        [15, 16],
        [16, 15],
        [8193, 16],
        [16, 8193],
        [16.5, 32],
        [32, Number.NaN],
      ])
        expect(() =>
          validateCompositionOutput(profile, width!, height!, "raw_rgba"),
        ).toThrow("integers from 16 through 8192");
      for (const [width, height] of [
        [16, 16],
        [8192, 16],
        [16, 8192],
      ])
        expect(() =>
          validateCompositionOutput(profile, width!, height!, "raw_rgba"),
        ).not.toThrow();
      expect(() =>
        validateCompositionOutput(profile, 32, 32, "jpeg_pipe"),
      ).toThrow("lossless PNG or raw RGBA");
      if (profile.evenDimensions)
        expect(() =>
          validateCompositionOutput(profile, 17, 19, "png_pipe"),
        ).toThrow("requires even width and height");
      else
        expect(() =>
          validateCompositionOutput(profile, 17, 19, "png_pipe"),
        ).not.toThrow();
    },
  );
});
