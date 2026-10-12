import { z } from "zod";
import { MechanismHashSchema } from "@still-shift/scene-contract";
import { MechanismProductionEpisodeReportSchema } from "./production-report.ts";

export const MECHANISM_PRODUCTION_QUEUE_LIMITS = {
  items: 300,
  inputs: 128,
  attemptsPerRevision: 3,
  attemptsPerItem: 96,
  revisions: 32,
  manifestBytes: 1024 * 1024,
  journalBytes: 8 * 1024 * 1024,
  productBytes: 4 * 1024 * 1024,
  stateCapacityBytes: 64 * 1024 * 1024,
} as const;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
const path = z.string().min(1).max(2048);
const ownedPath = path.refine(
  (p) =>
    !p.startsWith("/") &&
    !p.includes("\\") &&
    p.split("/").every((s) => s && s !== "." && s !== ".."),
  {
    message: "Produced artifacts require owned relative paths",
  },
);
export const MechanismProductionFileSchema = z
  .object({
    path,
    bytes: z
      .number()
      .int()
      .nonnegative()
      .max(512 * 1024 * 1024),
    sha256: MechanismHashSchema,
  })
  .strict();
export const MechanismProductionOwnedFileSchema = z
  .object({
    path: ownedPath,
    bytes: z
      .number()
      .int()
      .nonnegative()
      .max(512 * 1024 * 1024),
    sha256: MechanismHashSchema,
  })
  .strict();
export const MechanismProductionQueueItemSchema = z
  .object({
    id,
    question: z.string().min(1).max(512),
    family: z.enum(["tape-hook", "cable-tie", "clothespeg"]),
    designVariant: z.string().min(1).max(256),
    familyPath: path,
    cuePath: path,
    clock: z
      .object({
        outputFrames: z.number().int().positive().max(108000),
        sourceSamples: z.number().int().positive().max(172800000),
      })
      .strict(),
    inputs: z.array(MechanismProductionFileSchema).min(2).max(128),
  })
  .strict()
  .superRefine((item, ctx) => {
    const paths = item.inputs.map((f) => f.path);
    if (
      new Set(paths).size !== paths.length ||
      !paths.includes(item.familyPath) ||
      !paths.includes(item.cuePath)
    )
      ctx.addIssue({
        code: "custom",
        message: "Unique dependency pins must include family and cue documents",
      });
  });
export type MechanismProductionQueueItem = z.infer<
  typeof MechanismProductionQueueItemSchema
>;
export const MechanismProductionQueueSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-queue-1"),
    id,
    revision: z.number().int().min(0).max(31),
    baseHash: MechanismHashSchema.nullable(),
    codeSha256: MechanismHashSchema,
    profileSha256: MechanismHashSchema,
    maximumAttempts: z.number().int().min(1).max(3),
    items: z.array(MechanismProductionQueueItemSchema).min(1).max(300),
  })
  .strict()
  .superRefine((queue, ctx) => {
    const questions = queue.items.map((i) =>
      i.question.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
    );
    if (
      new Set(queue.items.map((i) => i.id)).size !== queue.items.length ||
      questions.some((q) => !q) ||
      new Set(questions).size !== questions.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Queue requires distinct item IDs and normalized questions",
      });
    if ((queue.revision === 0) !== (queue.baseHash === null))
      ctx.addIssue({
        code: "custom",
        message: "Queue revisions require the previous manifest hash",
      });
  });
export type MechanismProductionQueue = z.infer<
  typeof MechanismProductionQueueSchema
>;
export const MechanismProductionAttemptSchema = z
  .object({
    number: z.number().int().min(1).max(96),
    revision: z.number().int().min(0).max(31),
    requestHash: MechanismHashSchema,
    status: z.enum(["running", "passed", "failed", "cancelled", "interrupted"]),
    stage: z.string().min(1).max(128),
    startedUtc: z.string().datetime({ offset: true }),
    endedUtc: z.string().datetime({ offset: true }).nullable(),
    seconds: z.number().finite().nonnegative().max(86400).nullable(),
    diagnostic: z.string().max(2048).nullable(),
    retryable: z.boolean(),
  })
  .strict();
export type MechanismProductionAttempt = z.infer<
  typeof MechanismProductionAttemptSchema
>;
export const MechanismProductionQueueProductSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-queue-product-1"),
    requestHash: MechanismHashSchema,
    report: MechanismProductionEpisodeReportSchema,
    artifacts: z.array(MechanismProductionOwnedFileSchema).min(1).max(128),
    work: z
      .object({
        freshNativeSubmissions: z.number().int().nonnegative().max(10800000),
        reusedNativePlates: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type MechanismProductionQueueProduct = z.infer<
  typeof MechanismProductionQueueProductSchema
>;
export const MechanismProductionQueueCheckpointSchema =
  MechanismProductionQueueProductSchema.extend({
    completion: MechanismProductionAttemptSchema,
  }).superRefine((checkpoint, ctx) => {
    if (
      checkpoint.completion.status !== "passed" ||
      checkpoint.completion.endedUtc === null ||
      checkpoint.completion.seconds === null ||
      checkpoint.completion.requestHash !== checkpoint.requestHash
    )
      ctx.addIssue({
        code: "custom",
        message: "Sealed completion must bind its finished attempt",
      });
  });
export type MechanismProductionQueueCheckpoint = z.infer<
  typeof MechanismProductionQueueCheckpointSchema
>;
export const MechanismProductionQueueRowSchema = z
  .object({
    id,
    identityHash: MechanismHashSchema,
    requestHash: MechanismHashSchema,
    status: z.enum(["pending", "running", "passed", "failed", "cancelled"]),
    attempts: z.array(MechanismProductionAttemptSchema).max(96),
    product: MechanismProductionOwnedFileSchema.nullable(),
    priorProducts: z.array(MechanismProductionOwnedFileSchema).max(32),
    cacheFailures: z
      .array(
        z
          .object({
            requestHash: MechanismHashSchema,
            atUtc: z.string().datetime({ offset: true }),
            diagnostic: z.string().max(2048),
          })
          .strict(),
      )
      .max(32),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.attempts.some((a, i) => a.number !== i + 1))
      ctx.addIssue({
        code: "custom",
        message: "Queue must retain contiguous original attempt numbers",
      });
    if ((row.status === "passed") !== (row.product !== null))
      ctx.addIssue({
        code: "custom",
        message: "Passed queue rows require their sealed product",
      });
    if (
      (row.status === "running") !==
      (row.attempts.at(-1)?.status === "running")
    )
      ctx.addIssue({
        code: "custom",
        message: "Running row and attempt must agree",
      });
  });
export type MechanismProductionQueueRow = z.infer<
  typeof MechanismProductionQueueRowSchema
>;
export const MechanismProductionQueueStateSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-queue-state-1"),
    id,
    revision: z.number().int().min(0).max(31),
    manifestHash: MechanismHashSchema,
    codeSha256: MechanismHashSchema,
    profileSha256: MechanismHashSchema,
    updatedUtc: z.string().datetime({ offset: true }),
    rows: z.array(MechanismProductionQueueRowSchema).min(1).max(300),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (new Set(state.rows.map((r) => r.id)).size !== state.rows.length)
      ctx.addIssue({
        code: "custom",
        message: "Queue journal contains duplicate item IDs",
      });
  });
export type MechanismProductionQueueState = z.infer<
  typeof MechanismProductionQueueStateSchema
>;
