import { z } from "zod";
import { animatableScalar, animatableVector2 } from "./keys.ts";
import { compositionId, finite, unit } from "./primitives.ts";

/** Local image displacement, independent of scene cameras and world depth. */
export const DepthMotionSchema = z
  .object({
    scale: animatableScalar(finite.min(1).max(1.035)).optional(),
    strength: animatableScalar(finite.min(0).max(0.035)).optional(),
    offset: animatableVector2(finite.min(-0.07).max(0.07)).optional(),
    roll: animatableScalar(finite.min(-0.3).max(0.3)).optional(),
  })
  .strict();

/** Image-local pan/zoom/roll, before its layer transform and camera. */
export const ImagePlaneMotionSchema = z
  .object({
    scale: animatableScalar(finite.min(0.5).max(4)).optional(),
    offset: animatableVector2(finite.min(-2).max(2)).optional(),
    roll: animatableScalar(finite.min(-360).max(360)).optional(),
  })
  .strict();

export const ImagePlaneSchema = z
  .object({
    overscan: finite.min(0).max(0.14).optional(),
    framing: z
      .object({
        x: unit,
        y: unit,
        width: finite.positive().max(1),
        height: finite.positive().max(1),
      })
      .strict()
      .refine(
        (value) =>
          value.x + value.width <= 1.000000001 &&
          value.y + value.height <= 1.000000001,
        "Framing crop must stay inside the source",
      )
      .optional(),
    motion: ImagePlaneMotionSchema.optional(),
    reveal: z
      .object({
        mode: z.enum(["wipe", "half-wipe"]),
        progress: animatableScalar(unit),
      })
      .strict()
      .optional(),
  })
  .strict();

export const depthImageFields = {
  alphaMode: z.enum(["preserve", "opaque"]).optional(),
  sourceAsset: compositionId,
  /** Prepared red-channel normalized depth. Both dimensions must match its asset. */
  depth: z
    .object({
      asset: compositionId,
      encoding: z.literal("r8-unorm"),
      width: finite.int().min(2).max(16384),
      height: finite.int().min(2).max(16384),
    })
    .strict(),
  overscan: finite.min(0).max(0.14),
  edgeDamping: unit.optional(),
  /** Source-normalized crop, resolved by preparation; no inference occurs in draw. */
  framing: z
    .object({
      x: unit,
      y: unit,
      width: finite.positive().max(1),
      height: finite.positive().max(1),
    })
    .strict()
    .refine(
      (value) =>
        value.x + value.width <= 1.000000001 &&
        value.y + value.height <= 1.000000001,
      "Framing crop must stay inside the source",
    )
    .optional(),
  motion: DepthMotionSchema.optional(),
};

export type DepthMotion = z.infer<typeof DepthMotionSchema>;
