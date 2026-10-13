import { z } from "zod";
import {
  MechanismHashSchema,
  MECHANISM_LIMITS,
  MechanismIdSchema,
  MechanismVectorSchema,
  mechanismIssue,
} from "./primitives.ts";
import { MechanismUnitAxisV2Schema } from "./rigs.ts";

/** Aggregate changing geometry belongs inside the original scene/GPU budgets. */
export const MECHANISM_TEACHING_SHAPE_LIMITS = Object.freeze({
  meshes: 4,
  streams: 8,
  vertices: 4096,
  triangles: 8192,
  scalarChannels: 8,
  centerlineSamples: 128,
  tubeSides: 8,
});

export const MechanismShapeLandmarkSchema = z
  .object({
    id: z.enum([
      "root",
      "tip",
      "trigger",
      "seat-a",
      "seat-b",
      "coil-a",
      "coil-b",
    ]),
    vertexIndices: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MECHANISM_TEACHING_SHAPE_LIMITS.vertices - 1),
      )
      .min(1)
      .max(16),
  })
  .strict()
  .superRefine((landmark, context) => {
    if (new Set(landmark.vertexIndices).size !== landmark.vertexIndices.length)
      mechanismIssue(
        context,
        "mechanism-shape-landmark",
        "Landmark vertex membership must be unique",
        ["vertexIndices"],
      );
  });

/** Source-clock proof intervals are half-open. An omitted policy requires every draw. */
export const MechanismShapeDrawEvidenceSchema = z
  .object({
    version: z.literal("mechanism-shape-draw-evidence-1"),
    requiredIntervals: z
      .array(
        z
          .object({
            startFrame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
            endFrameExclusive: z
              .number()
              .finite()
              .positive()
              .max(MECHANISM_LIMITS.frames),
          })
          .strict()
          .refine(
            (interval) => interval.endFrameExclusive > interval.startFrame,
            "Draw proof intervals must be nonempty",
          ),
      )
      .min(1)
      .max(32),
    allowedOutsideProof: z
      .array(z.enum(["authored-hidden", "outside-frustum"]))
      .max(2)
      .default([]),
  })
  .strict()
  .superRefine((policy, context) => {
    let end = 0;
    for (const [index, interval] of policy.requiredIntervals.entries()) {
      if (interval.startFrame < end)
        mechanismIssue(
          context,
          "mechanism-shape-draw-evidence",
          "Draw proof intervals must be sorted and nonoverlapping",
          ["requiredIntervals", index],
        );
      end = interval.endFrameExclusive;
    }
    if (
      new Set(policy.allowedOutsideProof).size !==
      policy.allowedOutsideProof.length
    )
      mechanismIssue(
        context,
        "mechanism-shape-draw-evidence",
        "Outside-proof allowances must be unique",
        ["allowedOutsideProof"],
      );
  });

const identity = {
  id: MechanismIdSchema,
  mesh: MechanismIdSchema,
  ownerPart: MechanismIdSchema,
  topologySha256: MechanismHashSchema,
  landmarks: z.array(MechanismShapeLandmarkSchema).min(2).max(4),
  drawEvidence: MechanismShapeDrawEvidenceSchema.optional(),
};
const dimension = z.number().finite().positive().max(1000);
const pawl = z
  .object({
    ...identity,
    generator: z.literal("fixed-root-pawl-curve-1"),
    driver: z
      .object({ rig: MechanismIdSchema, channel: z.literal("pawlDeflection") })
      .strict(),
    parameters: z
      .object({
        length: dimension,
        width: dimension,
        thickness: dimension,
        maxDeflection: z.number().finite().min(0).max(500),
        longitudinalSegments: z.number().int().min(2).max(32),
        trigger: z
          .object({
            length: dimension,
            width: dimension,
            segments: z.number().int().min(2).max(8),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
const spring = z
  .object({
    ...identity,
    generator: z.literal("seated-torsion-spring-1"),
    seats: z.tuple([MechanismIdSchema, MechanismIdSchema]),
    parameters: z
      .object({
        coilCenter: MechanismVectorSchema,
        axis: MechanismUnitAxisV2Schema,
        coilRadius: dimension,
        wireRadius: dimension,
        turns: z.number().finite().min(0.5).max(12),
        pitch: dimension,
        coilSamples: z.number().int().min(8).max(96),
        legSamples: z.number().int().min(2).max(16),
        tubeSides: z
          .number()
          .int()
          .min(3)
          .max(MECHANISM_TEACHING_SHAPE_LIMITS.tubeSides),
        /** Unit directions in the corresponding rigid seat-part coordinates. */
        terminalTangents: z.tuple([
          MechanismUnitAxisV2Schema,
          MechanismUnitAxisV2Schema,
        ]),
      })
      .strict(),
  })
  .strict();

export const MechanismTeachingShapeSchema = z
  .discriminatedUnion("generator", [pawl, spring])
  .superRefine((shape, context) => {
    const expected =
      shape.generator === "fixed-root-pawl-curve-1"
        ? shape.parameters.trigger
          ? ["root", "tip", "trigger"]
          : ["root", "tip"]
        : ["seat-a", "seat-b", "coil-a", "coil-b"];
    const actual = shape.landmarks.map((landmark) => landmark.id);
    if (
      actual.length !== expected.length ||
      new Set(actual).size !== actual.length ||
      expected.some(
        (id) => !actual.includes(id as MechanismShapeLandmark["id"]),
      )
    )
      mechanismIssue(
        context,
        "mechanism-shape-landmark",
        "Generator requires its exact closed landmark inventory",
        ["landmarks"],
      );
    if (shape.generator === "fixed-root-pawl-curve-1") {
      const { length, thickness, maxDeflection } = shape.parameters;
      if (maxDeflection > length / 2)
        mechanismIssue(
          context,
          "mechanism-shape-range",
          "Pawl deflection cannot exceed half its length",
          ["parameters", "maxDeflection"],
        );
      const trigger = shape.parameters.trigger;
      if (
        trigger &&
        maxDeflection * (1 + (3 * trigger.length) / length) >
          (length + trigger.length) / 2
      )
        mechanismIssue(
          context,
          "mechanism-shape-range",
          "Trigger deflection exceeds the declared closed-beam envelope",
          ["parameters", "trigger", "length"],
        );
      if (thickness >= length / 2)
        mechanismIssue(
          context,
          "mechanism-shape-range",
          "Pawl thickness must be below half its length",
          ["parameters", "thickness"],
        );
      return;
    }
    if (shape.seats[0] === shape.seats[1])
      mechanismIssue(
        context,
        "mechanism-spring-seat",
        "Spring requires two distinct seats",
        ["seats", 1],
      );
    const parameters = shape.parameters;
    if (parameters.wireRadius >= parameters.coilRadius / 2)
      mechanismIssue(
        context,
        "mechanism-spring-wire",
        "Wire radius must be below half the coil radius",
        ["parameters", "wireRadius"],
      );
    if (
      parameters.coilSamples + 2 * parameters.legSamples >
      MECHANISM_TEACHING_SHAPE_LIMITS.centerlineSamples
    )
      mechanismIssue(
        context,
        "mechanism-shape-limit",
        "Spring exceeds the bounded centerline sample budget",
        ["parameters", "coilSamples"],
      );
    if (
      shape.landmarks.some(
        (landmark) => landmark.vertexIndices.length !== parameters.tubeSides,
      )
    )
      mechanismIssue(
        context,
        "mechanism-shape-landmark",
        "Spring landmarks identify complete tube rings",
        ["landmarks"],
      );
  });

export type MechanismShapeLandmark = z.infer<
  typeof MechanismShapeLandmarkSchema
>;
export type MechanismTeachingShape = z.infer<
  typeof MechanismTeachingShapeSchema
>;
