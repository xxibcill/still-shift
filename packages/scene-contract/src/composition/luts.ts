import { z } from "zod";
import { compositionId, sha256 } from "./primitives.ts";

/**
 * CG5: color spaces a LUT asset can declare for its input and output. Today
 * the only working space is the legacy display-referred one (encoded sRGB,
 * BT.709 primaries; BT.709 video is display-equivalent on decode, D-colour),
 * so it is the only value: a LUT made for another space (a camera log or
 * ACES input) cannot be applied correctly until CG7 adds working spaces and
 * extends this list.
 */
export const LUT_COLOR_SPACES = ["legacy-srgb"] as const;
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
