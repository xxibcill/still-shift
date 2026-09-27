import { z } from "zod";
import { DepthModelSchema } from "./contracts.ts";

export const DEPTH_WORKER_PROTOCOL_VERSION = "depth-worker-1" as const;

const NonEmptyStringSchema = z.string().trim().min(1);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ChecksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const DurationSchema = z.number().finite().nonnegative();
const MemoryBytesSchema = z.number().int().nonnegative().nullable();
const CacheStatusSchema = z.enum(["hit", "miss"]);

export const DepthImageDimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const SourceDimensionsSchema = z.object({
  input: DepthImageDimensionsSchema.extend({ format: NonEmptyStringSchema }),
  orientation: z.number().int(),
  oriented: DepthImageDimensionsSchema,
  normalized: DepthImageDimensionsSchema,
});

export const DepthWorkerMetricsSchema = z.object({
  inferenceMs: DurationSchema,
  postProcessMs: DurationSchema,
  totalPreparationMs: DurationSchema,
  requestMs: DurationSchema,
  cacheStatus: CacheStatusSchema,
  peakCpuMemoryBytes: MemoryBytesSchema,
  peakGpuMemoryBytes: MemoryBytesSchema,
  selectedDevice: NonEmptyStringSchema,
  hardwareDescription: NonEmptyStringSchema,
});

export const DepthPreparedResponseSchema = z.object({
  protocolVersion: z.literal(DEPTH_WORKER_PROTOCOL_VERSION),
  status: z.literal("prepared"),
  preparationVersion: NonEmptyStringSchema,
  cacheKey: HashSchema,
  cacheStatus: CacheStatusSchema,
  cacheInvalidated: z.boolean(),
  cacheDirectory: NonEmptyStringSchema,
  manifestPath: NonEmptyStringSchema,
  assets: z.object({
    normalizedSource: NonEmptyStringSchema,
    rawDepth: NonEmptyStringSchema,
    previewDepth: NonEmptyStringSchema,
  }),
  model: DepthModelSchema,
  dimensions: SourceDimensionsSchema,
  checksums: z.object({
    normalizedSource: HashSchema,
    rawDepth: HashSchema,
    previewDepth: HashSchema,
  }),
  metrics: DepthWorkerMetricsSchema,
  normalizationWarnings: z.array(NonEmptyStringSchema),
});

export const DepthNormalizedResponseSchema = z.object({
  protocolVersion: z.literal(DEPTH_WORKER_PROTOCOL_VERSION),
  status: z.literal("normalized"),
  preprocessingVersion: NonEmptyStringSchema,
  sourceHash: ChecksumSchema,
  sourcePath: NonEmptyStringSchema,
  dimensions: SourceDimensionsSchema,
  checksum: ChecksumSchema,
  cacheStatus: CacheStatusSchema,
  normalizationWarnings: z.array(NonEmptyStringSchema),
});

export const DepthWorkerFailureSchema = z.object({
  protocolVersion: z.literal(DEPTH_WORKER_PROTOCOL_VERSION),
  status: z.literal("failed"),
  error: z.object({
    code: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
    context: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const DepthPreparationResponseSchema = z.discriminatedUnion("status", [
  DepthPreparedResponseSchema,
  DepthWorkerFailureSchema,
]);

export const DepthWorkerResponseSchema = z.discriminatedUnion("status", [
  DepthPreparedResponseSchema,
  DepthNormalizedResponseSchema,
  DepthWorkerFailureSchema,
]);

export type DepthImageDimensions = z.infer<typeof DepthImageDimensionsSchema>;
export type DepthWorkerMetrics = z.infer<typeof DepthWorkerMetricsSchema>;
export type PreparedDepthResult = z.infer<typeof DepthPreparedResponseSchema>;
export type NormalizedDepthSource = z.infer<
  typeof DepthNormalizedResponseSchema
>;
export type DepthWorkerFailure = z.infer<typeof DepthWorkerFailureSchema>;
export type DepthWorkerResponse = z.infer<typeof DepthWorkerResponseSchema>;
export type DepthPreparationResponse = z.infer<
  typeof DepthPreparationResponseSchema
>;

const invalidResponse = (): DepthWorkerFailure => ({
  protocolVersion: DEPTH_WORKER_PROTOCOL_VERSION,
  status: "failed",
  error: {
    code: "PREPARATION_FAILED",
    message: "Depth worker returned an invalid response",
  },
});

/** Reject older or unknown protocols without exposing unvalidated worker data. */
export function parseDepthWorkerResponse(value: unknown): DepthWorkerResponse {
  const result = DepthWorkerResponseSchema.safeParse(value);
  if (result.success) return result.data;
  return invalidResponse();
}

export function parseDepthPreparationResponse(
  value: unknown,
): DepthPreparationResponse {
  const result = parseDepthWorkerResponse(value);
  return result.status === "normalized" ? invalidResponse() : result;
}
