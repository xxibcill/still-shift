import { z } from "zod";

import { CorpusEntrySchema } from "../../packages/scene-contract/src/corpus.ts";
import {
  DepthPreparationResponseSchema,
  type PreparedDepthResult,
} from "../../packages/scene-contract/src/depth-worker.ts";

export const CorpusResponseSchema = z.object({
  status: z.enum(["incomplete", "frozen"]),
  entries: z.array(
    CorpusEntrySchema.pick({
      id: true,
      categories: true,
      expectedShotDurationMs: true,
    }),
  ),
});

export type CorpusEntry = z.infer<
  typeof CorpusResponseSchema
>["entries"][number];

const ImageDimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const ModelIdentitySchema = z.object({ id: z.string().min(1) }).passthrough();

export const PreparedEntrySchema = z.object({
  id: z.string().min(1),
  sourceUrl: z.string().min(1),
  depthUrl: z.string().min(1),
  dimensions: ImageDimensionsSchema,
  durationMs: z.number().int().positive(),
  cacheStatus: z.string().min(1),
  model: ModelIdentitySchema,
});

export type PreparedEntry = z.infer<typeof PreparedEntrySchema>;
export type PreviewPair = {
  sourceUrl: string;
  depthUrl: string | null;
  durationMs: number;
};

export const DepthPreparationFailureSchema = z.object({
  error: z.string().min(1),
  code: z.literal("DEPTH_PREPARATION_FAILED"),
  sourceUrl: z.string().min(1),
  durationMs: z.number().int().positive(),
});

export const WorkerResultSchema = DepthPreparationResponseSchema;
export type PreparedWorkerResult = PreparedDepthResult;

export const ApiErrorSchema = z.object({ error: z.string().min(1) });
