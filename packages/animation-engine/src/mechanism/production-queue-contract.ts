import { z } from "zod";
import {
  MechanismProductionAttemptProvenanceSchema,
  MechanismProductionInterventionSchema,
  MechanismProductionRevisionChangeSchema,
} from "./production-attempt-provenance.ts";
import { MechanismProductionFindingSchema } from "./production-failure.ts";
import { MechanismHashSchema } from "@still-shift/scene-contract";
import {
  MechanismProductionEpisodeReportSchema,
  BlenderProductionEpisodeReportSchema,
} from "./production-report.ts";

export const MECHANISM_PRODUCTION_QUEUE_LIMITS = {
  items: 300,
  retryItems: 32,
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
    qaPath: path.optional(),
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
      !paths.includes(item.cuePath) ||
      (item.qaPath !== undefined && !paths.includes(item.qaPath))
    )
      ctx.addIssue({
        code: "custom",
        message: "Unique dependency pins must include family and cue documents",
      });
  });
export type MechanismProductionQueueItem = z.infer<
  typeof MechanismProductionQueueItemSchema
>;
function validateRevisionChanges(
  queue: {
    revision: number;
    items: readonly { id: string }[];
    revisionChanges?: readonly { id: string }[] | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (
    queue.revisionChanges &&
    (queue.revision === 0 ||
      new Set(queue.revisionChanges.map((c) => c.id)).size !==
        queue.revisionChanges.length ||
      queue.revisionChanges.some(
        (c) => !queue.items.some((i) => i.id === c.id),
      ))
  )
    ctx.addIssue({
      code: "custom",
      message:
        "Revision changes require distinct selected IDs in a revised queue",
    });
}

export const MechanismProductionQueueSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-queue-1"),
    id,
    revision: z.number().int().min(0).max(31),
    baseHash: MechanismHashSchema.nullable(),
    codeSha256: MechanismHashSchema,
    profileSha256: MechanismHashSchema,
    maximumAttempts: z.number().int().min(1).max(3),
    retryFailedIds: z.array(id).min(1).max(32).optional(),
    revisionChanges: z
      .array(MechanismProductionRevisionChangeSchema)
      .min(1)
      .max(300)
      .optional(),
    items: z.array(MechanismProductionQueueItemSchema).min(1).max(300),
  })
  .strict()
  .superRefine((queue, ctx) => {
    if (
      queue.retryFailedIds &&
      (queue.revision === 0 ||
        new Set(queue.retryFailedIds).size !== queue.retryFailedIds.length ||
        queue.retryFailedIds.some(
          (id) => !queue.items.some((item) => item.id === id),
        ))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Retry IDs require a revised queue and distinct selected item IDs",
      });
    validateRevisionChanges(queue, ctx);
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
export const BlenderProductionQueueItemSchema = z
  .object({
    ...MechanismProductionQueueItemSchema.shape,
    backend: z.literal("blender-native"),
    family: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,127}$/),
  })
  .strict()
  .superRefine((item, ctx) => {
    const paths = item.inputs.map((f) => f.path);
    if (
      new Set(paths).size !== paths.length ||
      !paths.includes(item.familyPath) ||
      !paths.includes(item.cuePath) ||
      (item.qaPath !== undefined && !paths.includes(item.qaPath))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Unique dependency pins must include native family and cue documents",
      });
  });
export type BlenderProductionQueueItem = z.infer<
  typeof BlenderProductionQueueItemSchema
>;
export const BlenderProductionQueueSchema = z
  .object({
    ...MechanismProductionQueueSchema.shape,
    schemaVersion: z.literal("mechanism-production-queue-2"),
    items: z.array(BlenderProductionQueueItemSchema).min(1).max(300),
  })
  .strict()
  .superRefine((queue, ctx) => {
    validateRevisionChanges(queue, ctx);
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
        message: "Queue revisions require previous manifest hash",
      });
    if (
      queue.retryFailedIds &&
      (queue.revision === 0 ||
        new Set(queue.retryFailedIds).size !== queue.retryFailedIds.length ||
        queue.retryFailedIds.some(
          (id) => !queue.items.some((i) => i.id === id),
        ))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Retry IDs require a revised queue and distinct selected item IDs",
      });
  });
export type BlenderProductionQueue = z.infer<
  typeof BlenderProductionQueueSchema
>;
export const MechanismProductionQueueVersionsSchema = z.union([
  MechanismProductionQueueSchema,
  BlenderProductionQueueSchema,
]);
export type MechanismProductionQueueAny = z.infer<
  typeof MechanismProductionQueueVersionsSchema
>;
export type MechanismProductionQueueItemAny =
  MechanismProductionQueueAny["items"][number];

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
    finding: MechanismProductionFindingSchema.optional(),
    provenance: MechanismProductionAttemptProvenanceSchema.optional(),
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
export const BlenderProductionQueueProductSchema =
  MechanismProductionQueueProductSchema.extend({
    schemaVersion: z.literal("mechanism-production-queue-product-2"),
    report: BlenderProductionEpisodeReportSchema,
  });
export type BlenderProductionQueueProduct = z.infer<
  typeof BlenderProductionQueueProductSchema
>;
export const MechanismProductionQueueProductVersionsSchema = z.union([
  MechanismProductionQueueProductSchema,
  BlenderProductionQueueProductSchema,
]);
export type MechanismProductionQueueProductAny = z.infer<
  typeof MechanismProductionQueueProductVersionsSchema
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
export const BlenderProductionQueueCheckpointSchema =
  BlenderProductionQueueProductSchema.extend({
    completion: MechanismProductionAttemptSchema,
  }).superRefine((c, ctx) => {
    if (
      c.completion.status !== "passed" ||
      c.completion.endedUtc === null ||
      c.completion.seconds === null ||
      c.completion.requestHash !== c.requestHash
    )
      ctx.addIssue({
        code: "custom",
        message: "Sealed completion must bind its finished attempt",
      });
  });
export type BlenderProductionQueueCheckpoint = z.infer<
  typeof BlenderProductionQueueCheckpointSchema
>;
export const MechanismProductionQueueCheckpointVersionsSchema = z.union([
  MechanismProductionQueueCheckpointSchema,
  BlenderProductionQueueCheckpointSchema,
]);

export const MechanismProductionQueueRowSchema = z
  .object({
    id,
    identityHash: MechanismHashSchema,
    requestHash: MechanismHashSchema,
    status: z.enum(["pending", "running", "passed", "failed", "cancelled"]),
    attempts: z.array(MechanismProductionAttemptSchema).max(96),
    interventions: z
      .array(MechanismProductionInterventionSchema)
      .max(64)
      .optional(),
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
    if (
      row.interventions?.some(
        (event, i, events) =>
          event.afterAttempt > row.attempts.length ||
          (i > 0 && event.afterAttempt < events[i - 1]!.afterAttempt),
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Interventions must follow retained attempts in chronological order",
      });
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
