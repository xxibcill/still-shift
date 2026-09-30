import { z } from "zod";
import { CommerceProfileSchema } from "./commerce-catalog.ts";

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const reference = z.string().trim().min(1);
const minutes = z.number().finite().nonnegative();

// An operator supplies these observations after the technical export. Null means
// that the field was not measured or reviewed, not that its value was zero.
export const CommerceProofReviewSchema = z
  .object({
    schemaVersion: z.literal("commerce-proof-review-1"),
    recordedBy: reference,
    productAuthorizationReference: reference.nullable(),
    copyApprovalReference: reference.nullable(),
    assetPreparationMinutes: minutes.nullable(),
    repairMinutes: minutes.nullable(),
    repairCount: z.number().int().nonnegative().nullable(),
    defects: z
      .array(
        z
          .object({
            frame: z.number().int().nonnegative(),
            category: z.enum([
              "product-fidelity",
              "copy",
              "layout",
              "timing",
              "encoding",
              "other",
            ]),
            description: reference,
            repaired: z.boolean(),
          })
          .strict(),
      )
      .nullable(),
    creativeReview: z
      .object({
        reviewer: reference,
        decision: z.enum(["pass", "revise"]),
        notes: reference,
      })
      .strict()
      .nullable(),
    nextTechniqueDemand: z
      .object({
        techniqueId: z.string().regex(/^T\d{2}$/),
        requestedBy: reference,
        productionNeed: reference,
      })
      .strict()
      .nullable(),
  })
  .strict();

const artifact = z.object({ path: reference, sha256 }).strict();

export const CommerceProofLedgerSchema = z
  .object({
    schemaVersion: z.literal("commerce-proof-ledger-1"),
    evidenceKind: z.enum(["fictional-technical-fixture", "real-product"]),
    technicalStatus: z.literal("verified"),
    measurementStatus: z.enum(["pending", "recorded"]),
    // Export integrity alone cannot make a production or publication decision.
    releaseDecision: z.null(),
    selection: z
      .object({ kind: z.literal("format"), id: z.literal("H03") })
      .strict(),
    productId: reference,
    profile: CommerceProfileSchema,
    artifacts: z
      .object({
        brief: artifact,
        preparedScene: artifact,
        productImage: artifact,
        reviewRecord: artifact.nullable(),
        renderManifest: artifact,
        resultSidecar: artifact,
        video: artifact,
      })
      .strict(),
    encoded: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fps: z.union([z.literal(24), z.literal(30)]),
        frameCount: z.number().int().positive(),
        durationMs: z.number().positive(),
      })
      .strict(),
    machine: z
      .object({
        source: z.literal("commerce-result-1 sidecar"),
        exportWallMs: minutes,
        encodePathWallMs: minutes,
        validationWallMs: minutes,
        frameRenderAverageMs: minutes,
        ffmpegCpuMs: minutes,
        outputBytes: z.number().int().positive(),
      })
      .strict(),
    operator: CommerceProofReviewSchema.omit({ schemaVersion: true }).extend({
      recordedBy: reference.nullable(),
    }),
  })
  .strict();

export type CommerceProofLedger = z.infer<typeof CommerceProofLedgerSchema>;
