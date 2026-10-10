import { z } from "zod";
import { SolidGeometrySchema } from "../native3d/geometry.ts";
import {
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismIdSchema,
  MechanismNumberSchema,
  MechanismVectorSchema,
  mechanismIssue,
} from "./primitives.ts";
import {
  MechanismCameraSchema,
  MechanismLightSchema,
  MechanismPartSchema,
  MechanismRenderProfileSchema,
} from "./scene.ts";
import { MechanismRigV2Schema, MechanismUnitAxisV2Schema } from "./rigs.ts";
import {
  MechanismTeachingShapeSchema,
  MECHANISM_TEACHING_SHAPE_LIMITS,
} from "./teaching-shapes.ts";
import { MechanismPackReferenceSchema } from "./packs.ts";
import { validateMechanismSceneV2 } from "./scene-validation-v2.ts";

export const MechanismAnchorSourceV2Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("part-local"),
      part: MechanismIdSchema,
      position: MechanismVectorSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("shape-landmark"),
      shape: MechanismIdSchema,
      landmark: MechanismIdSchema,
    })
    .strict(),
]);
export const MechanismAnchorV2Schema = z
  .object({
    id: MechanismIdSchema,
    role: z.enum([
      "contact",
      "seat",
      "proof-target",
      "camera-target",
      "annotation",
    ]),
    source: MechanismAnchorSourceV2Schema,
  })
  .strict();

const anchorPair = z.tuple([MechanismIdSchema, MechanismIdSchema]);
const tolerance = z.number().finite().min(0).max(0.001);
const range = z.tuple([MechanismNumberSchema, MechanismNumberSchema]);
export const MechanismRelationshipV2Schema = z
  .discriminatedUnion("type", [
    z
      .object({
        id: MechanismIdSchema,
        type: z.literal("coincident"),
        anchors: anchorPair,
        tolerance,
      })
      .strict(),
    z
      .object({
        id: MechanismIdSchema,
        type: z.literal("signed-gap"),
        anchors: anchorPair,
        axisPart: MechanismIdSchema,
        axis: MechanismUnitAxisV2Schema,
        range,
        tolerance,
      })
      .strict(),
    z
      .object({
        id: MechanismIdSchema,
        type: z.literal("fixed-offset"),
        anchors: anchorPair,
        referencePart: MechanismIdSchema,
        offset: MechanismVectorSchema,
        tolerance,
      })
      .strict(),
    z
      .object({
        id: MechanismIdSchema,
        type: z.literal("engagement"),
        rig: MechanismIdSchema,
        pawlTip: MechanismIdSchema,
        toothDatum: MechanismIdSchema,
        clearance: range,
        tolerance,
      })
      .strict(),
  ])
  .superRefine((relationship, context) => {
    const pair =
      relationship.type === "engagement"
        ? [relationship.pawlTip, relationship.toothDatum]
        : relationship.anchors;
    if (pair[0] === pair[1])
      mechanismIssue(
        context,
        "mechanism-relationship-anchor",
        "A relationship requires two distinct anchors",
      );
    if (
      relationship.type === "signed-gap" ||
      relationship.type === "engagement"
    ) {
      const field = relationship.type === "signed-gap" ? "range" : "clearance";
      const values =
        relationship.type === "signed-gap"
          ? relationship.range
          : relationship.clearance;
      if (values[1] < values[0])
        mechanismIssue(
          context,
          "mechanism-relationship-range",
          "Relationship range must be ordered",
          [field],
        );
    }
  });

const sceneFieldsSchema = z
  .object({
    schemaVersion: z.literal("mechanism-scene-2"),
    id: MechanismIdSchema,
    coordinateSystem: z.literal("right-handed-y-up"),
    units: z
      .object({
        kind: z.enum(["illustrative", "meter", "millimeter"]),
        scaleToMeters: z.number().finite().positive().max(1000),
      })
      .strict(),
    seed: z.number().int().min(0).max(2_147_483_647).default(0),
    geometrySha256: MechanismHashSchema,
    geometry: SolidGeometrySchema,
    parts: z.array(MechanismPartSchema).min(1).max(MECHANISM_LIMITS.parts),
    rigs: z.array(MechanismRigV2Schema).min(1).max(MECHANISM_LIMITS.rigs),
    teachingShapes: z
      .array(MechanismTeachingShapeSchema)
      .max(MECHANISM_TEACHING_SHAPE_LIMITS.meshes)
      .default([]),
    anchors: z
      .array(MechanismAnchorV2Schema)
      .max(MECHANISM_LIMITS.anchors)
      .default([]),
    relationships: z.array(MechanismRelationshipV2Schema).max(128).default([]),
    camera: MechanismCameraSchema,
    profile: MechanismRenderProfileSchema,
    lights: z.array(MechanismLightSchema).max(8).default([]),
    pack: MechanismPackReferenceSchema.optional(),
  })
  .strict();

export type MechanismSceneV2Fields = z.infer<typeof sceneFieldsSchema>;
export const MechanismSceneV2Schema = sceneFieldsSchema.superRefine(
  validateMechanismSceneV2,
);
export type MechanismSceneV2 = z.infer<typeof MechanismSceneV2Schema>;
export type MechanismSceneV2Input = z.input<typeof MechanismSceneV2Schema>;
export type MechanismAnchorV2 = z.infer<typeof MechanismAnchorV2Schema>;
export type MechanismAnchorSourceV2 = z.infer<
  typeof MechanismAnchorSourceV2Schema
>;
export type MechanismRelationshipV2 = z.infer<
  typeof MechanismRelationshipV2Schema
>;
