import { z } from "zod";
import {
  MechanismProductionBindingSchema,
  MECHANISM_QA_DIMENSIONS,
} from "./production-report.ts";
import { MechanismProductionOwnedFileSchema } from "./production-queue-contract.ts";
import { MechanismCueCompilationSchema } from "./cue-lifecycle.ts";
export const MECHANISM_PRODUCTION_HANDOFF_LIMITS = { bytes: 32768 } as const;
const status = z.enum(["passed", "failed", "unreviewed"]);
export const MechanismProductionHandoffSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-handoff-1"),
    id: z.string().min(1).max(80),
    question: z.string().min(1).max(512),
    family: z.enum(["tape-hook", "cable-tie", "clothespeg"]),
    designVariant: z.string().min(1).max(256),
    binding: MechanismProductionBindingSchema,
    sourceStatus: z.enum(["generation-snapshot", "current-verified"]),
    compilation: MechanismCueCompilationSchema,
    resume: z
      .object({
        manifestPath: z.string().max(2048).nullable(),
        outputDirectory: z.string().max(2048),
        familyPath: z.string().max(2048),
        cuePath: z.string().max(2048),
      })
      .strict(),
    assets: z
      .object({
        video: MechanismProductionOwnedFileSchema,
        audio: MechanismProductionOwnedFileSchema,
        evidence: MechanismProductionOwnedFileSchema,
        decodedReport: MechanismProductionOwnedFileSchema,
        qualityReport: MechanismProductionOwnedFileSchema.optional(),
      })
      .strict(),
    summary: z
      .object({
        shots: z.number().int().positive().max(64),
        sampledFrames: z.number().int().positive().max(512),
        images: z.number().int().positive().max(1024),
        cropExceptions: z.number().int().nonnegative().max(64),
      })
      .strict(),
    qa: z
      .object(
        Object.fromEntries(
          MECHANISM_QA_DIMENSIONS.map((d) => [d, status]),
        ) as Record<(typeof MECHANISM_QA_DIMENSIONS)[number], typeof status>,
      )
      .strict(),
    reviewedReady: z.boolean(),
    nextAction: z.string().min(1).max(2048),
    qualification: z.string().max(2048),
  })
  .strict()
  .refine((h) => h.sourceStatus !== "generation-snapshot" || !h.reviewedReady, {
    message: "A generation snapshot cannot claim reviewed-ready acceptance",
  });
export type MechanismProductionHandoff = z.infer<
  typeof MechanismProductionHandoffSchema
>;
