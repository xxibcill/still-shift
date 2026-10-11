import { MechanismCueCompilationSchema } from "./cue-lifecycle.ts";
import { MechanismCuePatchSchema } from "./cue-authoring.ts";
import {
  MechanismFamilyAuthoringSchema,
  MechanismFamilyPatchSchema,
} from "./family-authoring.ts";
import { z } from "zod";
import {
  MechanismPackDocumentSchema,
  MechanismPackTimelineSchema,
  MechanismNarratedCycleSchema,
  MechanismSceneV2Schema,
  MechanismSceneV3Schema,
  MechanismFrameResultV2Schema,
  MechanismRigV2Schema,
  MechanismTeachingShapeSchema,
  SolidGeometryV2Schema,
  NativeFrameSnapshotV3Schema,
  CompositionPreparedNative3DV3Schema,
} from "@still-shift/scene-contract";
import {
  inspectTapeHookPack,
  TapeHookPackInputSchema,
  TapeHookPackParametersSchema,
} from "./tape-hook-pack.ts";
import {
  inspectCableTiePack,
  CableTiePackInputSchema,
  CableTiePackParametersSchema,
} from "./cable-tie-pack.ts";
import {
  inspectClothespegPack,
  ClothespegPackInputSchema,
  ClothespegPackParametersSchema,
} from "./clothespeg-pack.ts";
import { freezeMechanismPack, mechanismPackHash } from "./pack-support.ts";
import {
  MechanismPrimitiveInputSchema,
  MechanismPrimitiveGeometryInputSchema,
} from "./primitive-contract.ts";

export const MECHANISM_FAMILY_REGISTRY_VERSION =
  "mechanism-family-registry-1" as const;
export const MechanismFamilyIdSchema = z.enum([
  "tape-hook",
  "cable-tie",
  "clothespeg",
]);
export type MechanismFamilyId = z.infer<typeof MechanismFamilyIdSchema>;
/** Generators and their exact schemas are the source of discovery, never a parallel catalogue. */
const families = {
  "tape-hook": {
    input: TapeHookPackInputSchema,
    parameters: TapeHookPackParametersSchema,
    inspect: inspectTapeHookPack,
  },
  "cable-tie": {
    input: CableTiePackInputSchema,
    parameters: CableTiePackParametersSchema,
    inspect: inspectCableTiePack,
  },
  clothespeg: {
    input: ClothespegPackInputSchema,
    parameters: ClothespegPackParametersSchema,
    inspect: inspectClothespegPack,
  },
} as const;
export const MechanismFamilyRegistrySelectionSchema = z
  .object({
    schemaVersion: z.literal(MECHANISM_FAMILY_REGISTRY_VERSION),
    family: z.union([MechanismFamilyIdSchema, z.literal("all")]).default("all"),
  })
  .strict();
/** Used by both generated schema files and CLI schema export. */
export const mechanismFamilySchemas = {
  "cue-compilation": MechanismCueCompilationSchema,
  "cue-patch": MechanismCuePatchSchema,
  "family-authoring": MechanismFamilyAuthoringSchema,
  "family-patch": MechanismFamilyPatchSchema,
  "family-registry-selection": MechanismFamilyRegistrySelectionSchema,
  "tape-hook-input": TapeHookPackInputSchema,
  "tape-hook-parameters": TapeHookPackParametersSchema,
  "cable-tie-input": CableTiePackInputSchema,
  "cable-tie-parameters": CableTiePackParametersSchema,
  "clothespeg-input": ClothespegPackInputSchema,
  "clothespeg-parameters": ClothespegPackParametersSchema,
  pack: MechanismPackDocumentSchema,
  "pack-timeline": MechanismPackTimelineSchema,
  "narrated-cycle": MechanismNarratedCycleSchema,
  "scene-2": MechanismSceneV2Schema,
  "scene-3": MechanismSceneV3Schema,
  "frame-2": MechanismFrameResultV2Schema,
  "rig-2": MechanismRigV2Schema,
  "teaching-shape": MechanismTeachingShapeSchema,
  primitive: MechanismPrimitiveInputSchema,
  "primitive-catalogue": MechanismPrimitiveGeometryInputSchema,
  "solid-geometry-2": SolidGeometryV2Schema,
  "native-frame-3": NativeFrameSnapshotV3Schema,
  "prepared-native3d-3": CompositionPreparedNative3DV3Schema,
} as const;

export function inspectMechanismFamilyRegistry(
  input: unknown = { schemaVersion: MECHANISM_FAMILY_REGISTRY_VERSION },
) {
  const selection = MechanismFamilyRegistrySelectionSchema.parse(input);
  const ids =
    selection.family === "all"
      ? MechanismFamilyIdSchema.options
      : [selection.family];
  const entries = ids.map((id) => {
    const entry = families[id],
      metadata = entry.inspect();
    const parameterSchema = z.toJSONSchema(entry.parameters);
    if (
      mechanismPackHash(parameterSchema) !==
      metadata.pack.generator.parameterSchemaSha256
    )
      throw new Error(
        `Family parameter schema does not match immutable metadata: ${id}`,
      );
    return {
      id,
      status: metadata.pack.status,
      reference: {
        id: metadata.pack.id,
        version: metadata.pack.version,
        sha256: metadata.sha256,
        variant: metadata.pack.factualVariant.id,
        detail: "teaching",
      },
      inputSchema: `${id}-input`,
      parameterSchema: `${id}-parameters`,
      parameterSchemaSha256: metadata.pack.generator.parameterSchemaSha256,
      parameters: metadata.pack.parameters,
      examples: [{ id: "default", input: entry.input.parse({}) }],
      metadata,
      controls: metadata.pack.rigs.map((rig) => ({
        id: rig.id,
        type: rig.type,
        schema: "rig-2",
      })),
      contracts: [
        "family-authoring",
        "family-patch",
        "pack",
        "pack-timeline",
        "narrated-cycle",
        "scene-2",
        "teaching-shape",
      ],
    };
  });
  return freezeMechanismPack({
    schemaVersion: MECHANISM_FAMILY_REGISTRY_VERSION,
    selection,
    entries,
  });
}
