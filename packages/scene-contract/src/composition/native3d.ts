import { z } from "zod";
import { Native3DSourceSchema } from "../native3d/scene.ts";
import {
  MechanismHashSchema,
  MechanismIdSchema,
  MechanismPixelSchema,
  MECHANISM_LIMITS,
} from "../mechanism/primitives.ts";
import { MechanismTransformSchema } from "../mechanism/scene.ts";
import { MechanismMaterialSchema } from "../mechanism/geometry.ts";
import { compositionId, finite, sha256 } from "./primitives.ts";

export const NATIVE3D_VARIANT_LIMIT = 64;
export const CompositionNative3DAssetSchema = z
  .object({
    id: compositionId,
    type: z.literal("native3d"),
    path: z.string().min(1).max(1024),
    sha256,
    format: z.enum(["mechanism-scene-1", "solid-scene-1"]),
    textureFont: compositionId.optional(),
  })
  .strict();
export const CompositionPreparedNative3DSchema = z
  .object({
    version: z.literal("composition-prepared-native3d-1"),
    assets: z
      .record(
        compositionId,
        z
          .object({
            sourceSha256: MechanismHashSchema,
            source: Native3DSourceSchema,
          })
          .strict(),
      )
      .refine(
        (assets) => Object.keys(assets).length <= NATIVE3D_VARIANT_LIMIT,
        "Native catalogue budget exceeded",
      ),
  })
  .strict();
const partOverride = z
  .object({
    transform: MechanismTransformSchema.optional(),
    visible: z.boolean().optional(),
  })
  .strict();
const material = MechanismMaterialSchema.shape;
const materialOverride = z
  .object({
    color: material.color.optional(),
    roughness: material.roughness.optional(),
    metalness: material.metalness.optional(),
    opacity: finite.min(0).max(1).optional(),
    alphaMode: z.enum(["opaque", "mask"]).optional(),
    alphaCutoff: finite.min(0).max(1).optional(),
    side: z.enum(["front", "double"]).optional(),
    emissive: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .optional(),
    emissiveIntensity: finite.min(0).max(10).optional(),
  })
  .strict();
export const Native3DSourceOverridesSchema = z
  .object({
    partOverrides: z
      .record(MechanismIdSchema, partOverride)
      .refine(
        (entries) => Object.keys(entries).length <= MECHANISM_LIMITS.parts,
        "Part override budget exceeded",
      )
      .optional(),
    materialOverrides: z
      .record(MechanismIdSchema, materialOverride)
      .refine(
        (entries) => Object.keys(entries).length <= MECHANISM_LIMITS.materials,
        "Material override budget exceeded",
      )
      .optional(),
  })
  .strict();
export const NativeWorldGraphicBindingSchema = z
  .object({
    role: z.literal("world-graphic"),
    sceneLayer: compositionId,
    part: MechanismIdSchema.optional(),
    transform: MechanismTransformSchema,
    pixelsPerUnit: finite.positive().max(1_000_000),
    originPixels: MechanismPixelSchema.optional(),
    side: z.enum(["front", "double"]).optional(),
    alphaMode: z.enum(["opaque", "mask"]),
    alphaCutoff: finite.min(0).max(1).optional(),
  })
  .strict();
export const NativeScreenBindingSchema = z
  .object({
    role: z.literal("screen-anchor"),
    sceneLayer: compositionId,
    anchor: MechanismIdSchema,
    visibilityPolicy: z.enum(["hide-occluded", "offscreen-indicator"]),
    visibleWhen: z.enum(["shown", "indicator"]).optional(),
    insetPixels: finite.min(0).max(4096).optional(),
    offsetPixels: MechanismPixelSchema.optional(),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("visibility") }).strict(),
      z.object({ kind: z.literal("position") }).strict(),
      z
        .object({
          kind: z.literal("path-endpoint"),
          contentId: compositionId,
          endpoint: z.literal("last"),
        })
        .strict(),
    ]),
  })
  .strict();
export const Native3DBindingSchema = z.discriminatedUnion("role", [
  NativeWorldGraphicBindingSchema,
  NativeScreenBindingSchema,
]);
export type CompositionNative3DAsset = z.infer<
  typeof CompositionNative3DAssetSchema
>;
export type CompositionPreparedNative3D = z.infer<
  typeof CompositionPreparedNative3DSchema
>;
export type Native3DSourceOverrides = z.infer<
  typeof Native3DSourceOverridesSchema
>;
export type NativeWorldGraphicBinding = z.infer<
  typeof NativeWorldGraphicBindingSchema
>;
export type NativeScreenBinding = z.infer<typeof NativeScreenBindingSchema>;
export type Native3DBinding = z.infer<typeof Native3DBindingSchema>;
