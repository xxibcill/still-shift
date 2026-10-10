import { z } from "zod";
import { MechanismCameraSchema } from "./scene.ts";
import {
  MECHANISM_LIMITS,
  MechanismIdSchema,
  MechanismPixelSchema,
  MechanismVectorSchema,
} from "./primitives.ts";

export const MechanismProjectionVisibilitySchema = z.enum([
  "in-frame",
  "outside-frame",
  "behind-camera",
  "clipped",
  "hidden-part",
]);
export const MechanismProjectedAnchorSchema = z
  .object({
    anchor: MechanismIdSchema,
    part: MechanismIdSchema,
    world: MechanismVectorSchema,
    pixel: MechanismPixelSchema.nullable(),
    depth: z.number().finite(),
    projectionVisibility: MechanismProjectionVisibilitySchema,
  })
  .strict();
export const MechanismMatrixSchema = z
  .tuple(
    Array.from({ length: 16 }, () => z.number().finite()) as [
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
      z.ZodNumber,
    ],
  )
  .readonly();
export const MechanismPartFrameSchema = z
  .object({
    id: MechanismIdSchema,
    parent: MechanismIdSchema.optional(),
    localMatrix: MechanismMatrixSchema,
    worldMatrix: MechanismMatrixSchema,
    visible: z.boolean(),
  })
  .strict();
export const MechanismRigFrameSchema = z
  .object({
    id: MechanismIdSchema,
    q: z.number().finite().min(0).max(1000),
    thickness: z.number().finite().positive().max(1000),
    travel: z.number().finite().min(0).max(1),
    contactMode: z.enum(["free", "pull", "push"]),
    measurementMode: z.enum(["free", "outside", "inside"]),
    selectedContactFace: MechanismIdSchema.nullable(),
  })
  .strict()
  .superRefine((rig, context) => {
    if (rig.q !== rig.thickness * rig.travel)
      context.addIssue({
        code: "custom",
        message: "q must equal thickness times normalized travel",
        path: ["q"],
      });
    const measurementMode =
      rig.contactMode === "pull"
        ? "outside"
        : rig.contactMode === "push"
          ? "inside"
          : "free";
    if (
      rig.measurementMode !== measurementMode ||
      (rig.selectedContactFace === null) !== (rig.contactMode === "free")
    )
      context.addIssue({
        code: "custom",
        message:
          "Contact, measurement mode and selected physical face must agree",
      });
  });
export const MechanismAssertionSchema = z
  .object({
    id: z
      .string()
      .regex(/^[A-Za-z][\w.-]*$/)
      .max(400),
    code: z.enum([
      "mechanism-travel-range",
      "mechanism-travel-thickness",
      "mechanism-contact",
      "mechanism-fixed-rivet",
    ]),
    rigId: MechanismIdSchema,
    partIds: z.array(MechanismIdSchema).min(1).max(3).readonly(),
    property: z.string().min(1).max(128),
    frame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
    passed: z.boolean(),
    measured: z.number().finite(),
    expected: z.number().finite(),
    tolerance: z.number().finite().min(0).max(0.001),
  })
  .strict()
  .refine(
    (assertion) =>
      assertion.passed ===
      Math.abs(assertion.measured - assertion.expected) <= assertion.tolerance,
    { message: "Assertion result must agree with its numeric evidence" },
  );
export const MechanismPartFramesSchema = z
  .record(MechanismIdSchema, MechanismPartFrameSchema)
  .refine((parts) => Object.keys(parts).length <= MECHANISM_LIMITS.parts, {
    message: "Part frame budget exceeded",
  });
export const MechanismRigFramesSchema = z
  .record(MechanismIdSchema, MechanismRigFrameSchema)
  .refine((rigs) => Object.keys(rigs).length <= MECHANISM_LIMITS.rigs, {
    message: "Rig frame budget exceeded",
  });
export const MechanismAssertionsSchema = z
  .array(MechanismAssertionSchema)
  .max(MECHANISM_LIMITS.rigs * 35);
export const MechanismFrameResultSchema = z
  .object({
    version: z.literal("mechanism-evaluator-1"),
    frame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
    seed: z.number().int().min(0).max(2_147_483_647),
    camera: MechanismCameraSchema,
    parts: MechanismPartFramesSchema,
    rigs: MechanismRigFramesSchema,
    anchors: z
      .record(MechanismIdSchema, MechanismProjectedAnchorSchema)
      .refine(
        (anchors) => Object.keys(anchors).length <= MECHANISM_LIMITS.anchors,
        { message: "Anchor frame budget exceeded" },
      ),
    assertions: MechanismAssertionsSchema,
  })
  .strict()
  .superRefine((frame, context) => {
    for (const [id, part] of Object.entries(frame.parts))
      if (
        id !== part.id ||
        (part.parent !== undefined && !Object.hasOwn(frame.parts, part.parent))
      )
        context.addIssue({
          code: "custom",
          message: "Part identity and parent references must agree",
          path: ["parts", id],
        });
    for (const [id, rig] of Object.entries(frame.rigs))
      if (
        id !== rig.id ||
        (rig.selectedContactFace !== null &&
          !Object.hasOwn(frame.anchors, rig.selectedContactFace))
      )
        context.addIssue({
          code: "custom",
          message: "Rig identity and selected face references must agree",
          path: ["rigs", id],
        });
    for (const [id, anchor] of Object.entries(frame.anchors))
      if (id !== anchor.anchor || !Object.hasOwn(frame.parts, anchor.part))
        context.addIssue({
          code: "custom",
          message: "Anchor identity and part references must agree",
          path: ["anchors", id],
        });
    frame.assertions.forEach((assertion, index) => {
      if (
        assertion.frame !== frame.frame ||
        !Object.hasOwn(frame.rigs, assertion.rigId) ||
        assertion.partIds.some((id) => !Object.hasOwn(frame.parts, id))
      )
        context.addIssue({
          code: "custom",
          message: "Assertion references must agree with the evaluated frame",
          path: ["assertions", index],
        });
    });
  });
export type MechanismProjectedAnchor = z.infer<
  typeof MechanismProjectedAnchorSchema
>;
export type MechanismPartFrame = z.infer<typeof MechanismPartFrameSchema>;
export type MechanismRigFrame = z.infer<typeof MechanismRigFrameSchema>;
export type MechanismAssertion = z.infer<typeof MechanismAssertionSchema>;
export type MechanismFrameResult = z.infer<typeof MechanismFrameResultSchema>;
