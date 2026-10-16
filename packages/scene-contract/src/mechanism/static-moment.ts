import { z } from "zod";
import { MechanismIdSchema, MechanismVectorSchema } from "./primitives.ts";
import { MechanismUnitAxisV2Schema } from "./rigs.ts";

export const MECHANISM_STATIC_MOMENT_LIMITS = {
  models: 16,
  minimumArmMeters: 1e-9,
  maximumForceNewtons: 1e12,
} as const;
export const MechanismResistanceTorqueSchema = z
  .object({
    value: z.number().finite().min(-1e6).max(1e6),
    unit: z.enum(["N*m", "N*mm"]),
  })
  .strict();
/** A prescribed signed resistance about the reference axis; no spring/contact solver. */
export const MechanismStaticMomentModelSchema = z
  .object({
    id: MechanismIdSchema,
    pivotAnchor: MechanismIdSchema,
    applicationAnchor: MechanismIdSchema,
    referencePart: MechanismIdSchema,
    axis: MechanismUnitAxisV2Schema,
    forceDirection: MechanismUnitAxisV2Schema,
    resistingTorque: MechanismResistanceTorqueSchema,
  })
  .strict()
  .refine((model) => model.pivotAnchor !== model.applicationAnchor, {
    message: "Pivot and force application anchors must be distinct",
    path: ["applicationAnchor"],
  });
export const MechanismStaticMomentInputSchema = z
  .object({
    pivot: MechanismVectorSchema,
    applicationPoint: MechanismVectorSchema,
    axis: MechanismVectorSchema,
    forceDirection: MechanismVectorSchema,
    scaleToMeters: z.number().finite().positive().max(1000),
    resistingTorque: MechanismResistanceTorqueSchema,
  })
  .strict();
export const MechanismStaticMomentResultSchema = z
  .object({
    method: z.literal("ideal-static-single-axis-moment-balance-1"),
    signedMomentArmMeters: z.number().finite().min(-4e9).max(4e9),
    resistingTorqueNewtonMeters: z.number().finite().min(-1e6).max(1e6),
    requiredForceNewtons: z
      .number()
      .finite()
      .nonnegative()
      .max(MECHANISM_STATIC_MOMENT_LIMITS.maximumForceNewtons),
    assumption: z.literal("fixed-axis-rigid-arm-prescribed-resistance-1"),
  })
  .strict()
  .superRefine((result, context) => {
    const applied = result.requiredForceNewtons * result.signedMomentArmMeters;
    if (
      Math.abs(result.signedMomentArmMeters) <
      MECHANISM_STATIC_MOMENT_LIMITS.minimumArmMeters
    )
      context.addIssue({
        code: "custom",
        message: "Result requires an admitted nonzero moment arm",
        path: ["signedMomentArmMeters"],
      });
    if (
      Math.abs(applied + result.resistingTorqueNewtonMeters) >
      1e-9 *
        Math.max(
          1,
          Math.abs(applied),
          Math.abs(result.resistingTorqueNewtonMeters),
        )
    )
      context.addIssue({
        code: "custom",
        message: "Ideal result must balance the declared signed torque",
        path: ["requiredForceNewtons"],
      });
  });
export type MechanismStaticMomentModel = z.infer<
  typeof MechanismStaticMomentModelSchema
>;
export type MechanismStaticMomentInput = z.infer<
  typeof MechanismStaticMomentInputSchema
>;
export type MechanismStaticMomentResult = z.infer<
  typeof MechanismStaticMomentResultSchema
>;
