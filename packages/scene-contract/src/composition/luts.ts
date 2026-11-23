import { z } from "zod";
import { COMPOSITION_CONVERSION_SPACES } from "./color-management.ts";
import { compositionId, sha256 } from "./primitives.ts";

/**
 * Color spaces a LUT asset can declare for its input and output. CG5's
 * `legacy-srgb` is the legacy working space (encoded sRGB, BT.709 primaries;
 * BT.709 video is display-equivalent on decode, D-colour). CG7 adds the
 * conversion spaces: `grade.lut` converts the working space to `inputSpace`
 * before the table and `outputSpace` back after it; a space equal to the
 * working space (`legacy-srgb` and `srgb` are the legacy one) converts
 * nothing, so CG5 renders are unchanged.
 */
export const LUT_COLOR_SPACES = [
  "legacy-srgb",
  ...COMPOSITION_CONVERSION_SPACES,
] as const;
export type LutColorSpace = (typeof LUT_COLOR_SPACES)[number];

/**
 * CG5: a `.cube` LUT (1D, 3D, or 3D behind a 1D shaper) pinned by SHA-256.
 * Its text is verified and parsed before rendering; 3D tables up to 129³ and
 * 1D tables up to 65,536 entries.
 */
export const CompositionLutAssetSchema = z
  .object({
    id: compositionId,
    type: z.literal("lut"),
    path: z.string().min(1).max(1024),
    sha256,
    format: z.literal("cube"),
    inputSpace: z.enum(LUT_COLOR_SPACES),
    outputSpace: z.enum(LUT_COLOR_SPACES),
  })
  .strict();
export type CompositionLutAsset = z.infer<typeof CompositionLutAssetSchema>;

/** Asset types an effect can bind through its `assets` slots. */
export const EFFECT_ASSET_TYPES = ["lut"] as const;
export type EffectAssetType = (typeof EFFECT_ASSET_TYPES)[number];

/** The largest `.cube` text a composition reads (a 129³ table is ~90 MB). */
export const MAX_LUT_FILE_BYTES = 128 * 1024 * 1024;

export type LutAssetProblem = {
  code: "comp-lut-invalid" | "comp-lut-checksum";
  message: string;
};
/**
 * The one rule for a LUT asset's bytes, checked where they are read (Node
 * before rendering, and again in the page): the size limit, then, once the
 * bytes are hashed, the pinned SHA-256 (`digest` as `sha256:<hex>`).
 */
export function lutAssetProblem(
  asset: Pick<CompositionLutAsset, "id" | "sha256">,
  byteLength: number,
  digest?: string,
): LutAssetProblem | undefined {
  if (byteLength > MAX_LUT_FILE_BYTES)
    return {
      code: "comp-lut-invalid",
      message: `LUT ${asset.id} is ${byteLength} bytes; the limit is ${MAX_LUT_FILE_BYTES}`,
    };
  if (digest !== undefined && digest !== asset.sha256)
    return {
      code: "comp-lut-checksum",
      message: `LUT checksum differs: ${asset.id} is ${digest}, the composition pins ${asset.sha256}`,
    };
  return undefined;
}
