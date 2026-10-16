import { z } from "zod";
import { MechanismSceneV2Schema } from "../mechanism/scene-v2.ts";
import { validateMechanismSceneV2 } from "../mechanism/scene-validation-v2.ts";
import { MechanismRigidRigV2Schema } from "../mechanism/rigs.ts";
import {
  MECHANISM_LIMITS,
  MechanismIdSchema,
  MechanismHashSchema,
  mechanismIssue,
} from "../mechanism/primitives.ts";
import { SolidGeometryV2Schema, NATIVE_PBR_LIMITS } from "./pbr-geometry.ts";
export const NativePbrResourceReferenceSchema = z
  .object({
    image: MechanismIdSchema,
    path: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (path) =>
          !/[\\:\0?#%]/.test(path) &&
          path
            .split("/")
            .every((part) => part && part !== "." && part !== ".."),
        {
          message:
            "Resource path must be a local relative file without traversal or URI syntax",
        },
      ),
    bytes: z.number().int().positive().max(NATIVE_PBR_LIMITS.rgbaBytes),
    sha256: MechanismHashSchema,
  })
  .strict();
/** Explicit rigid PBR source. Original source1/2 parsers are intentionally unchanged. */
export const MechanismSceneV3Schema = z
  .object({
    ...MechanismSceneV2Schema.shape,
    schemaVersion: z.literal("mechanism-scene-3"),
    geometry: SolidGeometryV2Schema,
    rigs: z.array(MechanismRigidRigV2Schema).max(MECHANISM_LIMITS.rigs),
    teachingShapes: MechanismSceneV2Schema.shape.teachingShapes
      .unwrap()
      .max(0)
      .default([]),
    resources: z
      .array(NativePbrResourceReferenceSchema)
      .max(NATIVE_PBR_LIMITS.images),
  })
  .strict()
  .superRefine((scene, context) => {
    validateMechanismSceneV2(scene, context);
    const images = new Map(
        scene.geometry.images.map((image) => [image.id, image]),
      ),
      seen = new Set<string>();
    if (scene.resources.length !== images.size)
      mechanismIssue(
        context,
        "comp-native3d-resource",
        "Exactly one binary reference is required per PBR image",
        ["resources"],
      );
    scene.resources.forEach((resource, index) => {
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
          "Binary resource identity must match one image manifest",
          ["resources", index],
        );
      seen.add(resource.image);
    });
  });
export type MechanismSceneV3 = z.infer<typeof MechanismSceneV3Schema>;
export type MechanismSceneV3Input = z.input<typeof MechanismSceneV3Schema>;
export type NativePbrResourceReference = z.infer<
  typeof NativePbrResourceReferenceSchema
>;
