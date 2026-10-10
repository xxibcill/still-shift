import { z } from "zod";
import { Native3DSourceVersionsSchema } from "../native3d/scene-v2.ts";
import { mechanismIdRecordV2 } from "../mechanism/records-v2.ts";
import {
  MECHANISM_LIMITS,
  MechanismHashSchema,
} from "../mechanism/primitives.ts";
import { compositionId } from "./primitives.ts";
import {
  CompositionNative3DAssetSchema,
  CompositionPreparedNative3DSchema,
  NativePartOverrideSchema,
  NativeMaterialOverrideSchema,
  NATIVE3D_VARIANT_LIMIT,
} from "./native3d.ts";

/** A composition declares the source protocol before its bytes are loaded. */
export const CompositionNative3DAssetVersionsSchema =
  CompositionNative3DAssetSchema.extend({
    format: z.enum(["mechanism-scene-1", "solid-scene-1", "mechanism-scene-2"]),
  });
const entry = z
  .object({
    sourceSha256: MechanismHashSchema,
    source: Native3DSourceVersionsSchema,
  })
  .strict();
const propertyNames = z.toJSONSchema(compositionId);
delete propertyNames.$schema;
export const CompositionPreparedNative3DV2Schema = z
  .object({
    version: z.literal("composition-prepared-native3d-2"),
    assets: z
      .object({})
      .catchall(entry)
      .superRefine((assets, context) => {
        if (Object.keys(assets).length > NATIVE3D_VARIANT_LIMIT)
          context.addIssue({
            code: "custom",
            message: "Native catalogue budget exceeded",
          });
        for (const id of Object.keys(assets))
          if (!compositionId.safeParse(id).success)
            context.addIssue({
              code: "custom",
              message: "Native asset ID must be a bounded composition ID",
              path: [id],
            });
      })
      .meta({ propertyNames, maxProperties: NATIVE3D_VARIANT_LIMIT }),
  })
  .strict();
export const CompositionPreparedNative3DVersionsSchema = z.union([
  CompositionPreparedNative3DSchema,
  CompositionPreparedNative3DV2Schema,
]);
/** New overrides support every declared ID without changing the original v1 parser. */
export const Native3DSourceOverridesV2Schema = z
  .object({
    partOverrides: mechanismIdRecordV2(
      NativePartOverrideSchema,
      MECHANISM_LIMITS.parts,
    ).optional(),
    materialOverrides: mechanismIdRecordV2(
      NativeMaterialOverrideSchema,
      MECHANISM_LIMITS.materials,
    ).optional(),
  })
  .strict();
export type CompositionNative3DAssetVersions = z.infer<
  typeof CompositionNative3DAssetVersionsSchema
>;
export type CompositionPreparedNative3DV2 = z.infer<
  typeof CompositionPreparedNative3DV2Schema
>;
export type CompositionPreparedNative3DVersions = z.infer<
  typeof CompositionPreparedNative3DVersionsSchema
>;
export type Native3DSourceOverridesV2 = z.infer<
  typeof Native3DSourceOverridesV2Schema
>;
