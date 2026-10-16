import { z } from "zod";
import { Native3DSourceVersionsSchema } from "../native3d/scene-v2.ts";
import {
  NativePbrMaterialSchema,
  NATIVE_PBR_LIMITS,
} from "../native3d/pbr-geometry.ts";
import {
  MechanismIdSchema,
  MechanismHashSchema,
  MECHANISM_LIMITS,
  mechanismIssue,
} from "../mechanism/primitives.ts";
import { compositionId } from "./primitives.ts";
import {
  NativePartOverrideSchema,
  NATIVE3D_VARIANT_LIMIT,
} from "./native3d.ts";
import { mechanismIdRecordV2 } from "../mechanism/records-v2.ts";
export const NativePbrMaterialOverrideSchema = NativePbrMaterialSchema.pick({
  baseColorFactor: true,
  metallicFactor: true,
  roughnessFactor: true,
  doubleSided: true,
})
  .partial()
  .strict();
export const Native3DSourceOverridesV3Schema = z
  .object({
    partOverrides: mechanismIdRecordV2(
      NativePartOverrideSchema,
      MECHANISM_LIMITS.parts,
    ).optional(),
    pbrMaterialOverrides: mechanismIdRecordV2(
      NativePbrMaterialOverrideSchema,
      MECHANISM_LIMITS.materials,
    ).optional(),
  })
  .strict();
export const NativePbrBinaryReferenceSchema = z
  .object({
    image: MechanismIdSchema,
    asset: z.string().regex(/^native-pbr\/[a-f0-9]{64}$/),
    bytes: z.number().int().positive().max(NATIVE_PBR_LIMITS.rgbaBytes),
    sha256: MechanismHashSchema,
  })
  .strict();
const entry = z
  .object({
    sourceSha256: MechanismHashSchema,
    source: Native3DSourceVersionsSchema,
    binaryResources: z
      .array(NativePbrBinaryReferenceSchema)
      .max(NATIVE_PBR_LIMITS.images)
      .default([]),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.source.schemaVersion !== "mechanism-scene-3") {
      if (entry.binaryResources.length)
        mechanismIssue(
          context,
          "comp-native3d-resource",
          "Legacy sources cannot carry PBR binary resources",
          ["binaryResources"],
        );
      return;
    }
    const images = new Map(
        entry.source.geometry.images.map((image) => [image.id, image]),
      ),
      seen = new Set<string>();
    if (entry.binaryResources.length !== images.size)
      mechanismIssue(
        context,
        "comp-native3d-resource",
        "Transport must bind exactly one binary resource per image",
        ["binaryResources"],
      );
    entry.binaryResources.forEach((resource, index) => {
      const image = images.get(resource.image);
      if (
        !image ||
        seen.has(resource.image) ||
        resource.bytes !== image.width * image.height * 4 ||
        resource.sha256 !== image.pixelSha256
      )
        mechanismIssue(
          context,
          "comp-native3d-resource",
          "Binary transport must retain its unique image identity",
          ["binaryResources", index],
        );
      seen.add(resource.image);
    });
  });
export const CompositionPreparedNative3DV3Schema = z
  .object({
    version: z.literal("composition-prepared-native3d-3"),
    assets: z.record(compositionId, entry),
  })
  .strict()
  .superRefine((transport, context) => {
    if (Object.keys(transport.assets).length > NATIVE3D_VARIANT_LIMIT)
      mechanismIssue(
        context,
        "comp-native3d-limit",
        "Native catalogue exceeds64 assets",
        ["assets"],
      );
    const resources = Object.values(transport.assets).flatMap(
        (entry) => entry.binaryResources,
      ),
      ids = new Set(resources.map((resource) => resource.asset));
    if (
      ids.size !== resources.length ||
      resources.reduce((n, resource) => n + resource.bytes, 0) >
        NATIVE_PBR_LIMITS.rgbaBytes
    )
      mechanismIssue(
        context,
        "comp-native3d-limit",
        "Composition binary resources require unique routes and an aggregate32MiB bound",
        ["assets"],
      );
  });
export type Native3DSourceOverridesV3 = z.infer<
  typeof Native3DSourceOverridesV3Schema
>;
export type NativePbrBinaryReference = z.infer<
  typeof NativePbrBinaryReferenceSchema
>;
export type CompositionPreparedNative3DV3 = z.infer<
  typeof CompositionPreparedNative3DV3Schema
>;
