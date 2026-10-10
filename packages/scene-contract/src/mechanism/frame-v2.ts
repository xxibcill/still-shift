import { z } from "zod";
import {
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismIdSchema,
  MechanismPixelSchema,
  MechanismVectorSchema,
  mechanismIssue,
} from "./primitives.ts";
import { MechanismCameraKeysSchema, MechanismCameraSchema } from "./scene.ts";
import {
  MechanismPartFramesSchema,
  MechanismProjectionVisibilitySchema,
} from "./frame.ts";
import { MechanismRigControlsV2Schema } from "./rigs.ts";
import { MechanismAnchorSourceV2Schema } from "./scene-v2.ts";
import { MECHANISM_TEACHING_SHAPE_LIMITS } from "./teaching-shapes.ts";

const frame = z.number().finite().min(0).max(MECHANISM_LIMITS.frames);
const scalar = z.number().finite().min(-1_000_000).max(1_000_000);
export const MechanismFrameRequestV2Schema = z
  .object({
    frame,
    width: z.number().int().min(16).max(8192),
    height: z.number().int().min(16).max(8192),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
    camera: MechanismCameraSchema.optional(),
    cameraKeys: MechanismCameraKeysSchema.optional(),
    rigControls: MechanismRigControlsV2Schema.default({}),
    hiddenParts: z
      .array(MechanismIdSchema)
      .max(MECHANISM_LIMITS.parts)
      .default([]),
  })
  .strict();

export const MechanismRigFrameV2Schema = z.discriminatedUnion("type", [
  z
    .object({
      id: MechanismIdSchema,
      type: z.literal("slider"),
      position: scalar,
    })
    .strict(),
  z
    .object({
      id: MechanismIdSchema,
      type: z.literal("hinge"),
      angleRadians: scalar,
    })
    .strict(),
  z
    .object({
      id: MechanismIdSchema,
      type: z.literal("spring-return"),
      targetRig: MechanismIdSchema,
      value: scalar,
      phase: z.enum(["held", "returning", "contact", "rest"]),
    })
    .strict(),
  z
    .object({
      id: MechanismIdSchema,
      type: z.literal("ratchet"),
      position: scalar,
      toothIndex: z.number().int().min(0).max(4095),
      phase: z.enum(["advancing", "seated", "released"]),
      pawlDeflection: z.number().finite().min(0).max(1),
    })
    .strict(),
]);

export const MechanismShapeFrameSchema = z
  .object({
    shape: MechanismIdSchema,
    mesh: MechanismIdSchema,
    ownerPart: MechanismIdSchema,
    topologySha256: MechanismHashSchema,
    stateKey: z.string().min(1).max(1024),
    positions: z
      .array(scalar)
      .min(9)
      .max(MECHANISM_TEACHING_SHAPE_LIMITS.vertices * 3),
    normals: z
      .array(z.number().finite().min(-1).max(1))
      .min(9)
      .max(MECHANISM_TEACHING_SHAPE_LIMITS.vertices * 3),
    bounds: z
      .object({ min: MechanismVectorSchema, max: MechanismVectorSchema })
      .strict(),
    landmarks: z
      .record(
        z.string().regex(/^(root|tip|seat-a|seat-b|coil-a|coil-b)$/),
        MechanismVectorSchema,
      )
      .refine(
        (landmarks) =>
          Object.keys(landmarks).length >= 2 &&
          Object.keys(landmarks).length <= 4,
        "A shape requires its bounded landmark inventory",
      ),
  })
  .strict()
  .superRefine((shape, context) => {
    if (
      shape.positions.length % 3 ||
      shape.normals.length !== shape.positions.length
    )
      mechanismIssue(
        context,
        "mechanism-shape-layout",
        "Position and normal streams must contain matching complete vertices",
        ["normals"],
      );
    for (let offset = 0; offset + 2 < shape.normals.length; offset += 3) {
      if (
        Math.abs(
          Math.hypot(
            shape.normals[offset]!,
            shape.normals[offset + 1]!,
            shape.normals[offset + 2]!,
          ) - 1,
        ) > 0.001
      ) {
        mechanismIssue(
          context,
          "mechanism-shape-normal",
          "Changing normals must be normalized",
          ["normals", offset],
        );
        break;
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      let min = Infinity,
        max = -Infinity;
      for (let offset = axis; offset < shape.positions.length; offset += 3) {
        min = Math.min(min, shape.positions[offset]!);
        max = Math.max(max, shape.positions[offset]!);
      }
      if (shape.bounds.min[axis] !== min || shape.bounds.max[axis] !== max)
        mechanismIssue(
          context,
          "mechanism-shape-bounds",
          "Bounds must equal the current positions",
          ["bounds", axis],
        );
    }
  });

export const MechanismProjectedAnchorV2Schema = z
  .object({
    anchor: MechanismIdSchema,
    source: MechanismAnchorSourceV2Schema,
    part: MechanismIdSchema,
    world: MechanismVectorSchema,
    pixel: MechanismPixelSchema.nullable(),
    depth: z.number().finite(),
    projectionVisibility: MechanismProjectionVisibilitySchema,
  })
  .strict();

/** Pure relationship residuals are expected-state evidence, not draw observations. */
export const MechanismRelationshipFrameV2Schema = z
  .object({
    id: MechanismIdSchema,
    type: z.enum(["coincident", "signed-gap", "fixed-offset", "engagement"]),
    measured: z.array(scalar).min(1).max(3),
    residual: z.number().finite().min(0).max(10_000_000),
    tolerance: z.number().finite().min(0).max(0.001),
  })
  .strict();

export const MechanismFrameResultV2Schema = z
  .object({
    version: z.literal("mechanism-evaluator-2"),
    frame,
    seed: z.number().int().min(0).max(2_147_483_647),
    camera: MechanismCameraSchema,
    parts: MechanismPartFramesSchema,
    rigs: z
      .record(MechanismIdSchema, MechanismRigFrameV2Schema)
      .refine(
        (rigs) => Object.keys(rigs).length <= MECHANISM_LIMITS.rigs,
        "Rig frame budget exceeded",
      ),
    shapeStates: z
      .record(MechanismIdSchema, MechanismShapeFrameSchema)
      .refine(
        (shapes) =>
          Object.keys(shapes).length <= MECHANISM_TEACHING_SHAPE_LIMITS.meshes,
        "Changing mesh budget exceeded",
      ),
    anchors: z
      .record(MechanismIdSchema, MechanismProjectedAnchorV2Schema)
      .refine(
        (anchors) => Object.keys(anchors).length <= MECHANISM_LIMITS.anchors,
        "Anchor frame budget exceeded",
      ),
    relationships: z
      .record(MechanismIdSchema, MechanismRelationshipFrameV2Schema)
      .refine(
        (relationships) => Object.keys(relationships).length <= 128,
        "Relationship frame budget exceeded",
      ),
  })
  .strict()
  .superRefine((result, context) => {
    for (const [id, part] of Object.entries(result.parts)) {
      if (
        id !== part.id ||
        (part.parent !== undefined && !Object.hasOwn(result.parts, part.parent))
      )
        mechanismIssue(
          context,
          "mechanism-frame-reference",
          "Part identity and parent references must agree",
          ["parts", id],
        );
    }
    for (const [id, rig] of Object.entries(result.rigs)) {
      if (
        id !== rig.id ||
        (rig.type === "spring-return" &&
          !Object.hasOwn(result.rigs, rig.targetRig))
      )
        mechanismIssue(
          context,
          "mechanism-frame-reference",
          "Rig identity and target references must agree",
          ["rigs", id],
        );
    }
    let vertices = 0;
    const meshes = new Set<string>();
    for (const [id, shape] of Object.entries(result.shapeStates)) {
      if (
        id !== shape.shape ||
        !Object.hasOwn(result.parts, shape.ownerPart) ||
        meshes.has(shape.mesh)
      )
        mechanismIssue(
          context,
          "mechanism-frame-reference",
          "Shape identity, owner and unique mesh must agree",
          ["shapeStates", id],
        );
      meshes.add(shape.mesh);
      vertices += shape.positions.length / 3;
    }
    if (vertices > MECHANISM_TEACHING_SHAPE_LIMITS.vertices)
      mechanismIssue(
        context,
        "mechanism-shape-limit",
        "Aggregate changing vertices exceed the frozen budget",
        ["shapeStates"],
      );
    for (const [id, anchor] of Object.entries(result.anchors)) {
      const source = anchor.source;
      const shape =
        source.kind === "shape-landmark"
          ? result.shapeStates[source.shape]
          : undefined;
      if (
        id !== anchor.anchor ||
        !Object.hasOwn(result.parts, anchor.part) ||
        (source.kind === "part-local"
          ? source.part !== anchor.part
          : !shape ||
            shape.ownerPart !== anchor.part ||
            !Object.hasOwn(shape.landmarks, source.landmark))
      )
        mechanismIssue(
          context,
          "mechanism-frame-reference",
          "Anchor source, owner and generated landmark references must agree",
          ["anchors", id],
        );
      if (
        (anchor.pixel === null &&
          (anchor.projectionVisibility === "in-frame" ||
            anchor.projectionVisibility === "outside-frame")) ||
        (anchor.projectionVisibility === "behind-camera" &&
          anchor.pixel !== null)
      )
        mechanismIssue(
          context,
          "mechanism-frame-projection",
          "In-frame and outside-frame anchors require pixels; behind-camera anchors cannot project",
          ["anchors", id, "pixel"],
        );
    }
    for (const [id, relationship] of Object.entries(result.relationships))
      if (id !== relationship.id)
        mechanismIssue(
          context,
          "mechanism-frame-reference",
          "Relationship record identity must agree",
          ["relationships", id],
        );
  });

export type MechanismFrameRequestV2 = z.input<
  typeof MechanismFrameRequestV2Schema
>;
export type MechanismRigFrameV2 = z.infer<typeof MechanismRigFrameV2Schema>;
export type MechanismShapeFrame = z.infer<typeof MechanismShapeFrameSchema>;
export type MechanismProjectedAnchorV2 = z.infer<
  typeof MechanismProjectedAnchorV2Schema
>;
export type MechanismRelationshipFrameV2 = z.infer<
  typeof MechanismRelationshipFrameV2Schema
>;
export type MechanismFrameResultV2 = z.infer<
  typeof MechanismFrameResultV2Schema
>;
