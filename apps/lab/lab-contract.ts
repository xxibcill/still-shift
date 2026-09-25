import { z } from "zod";

import { CorpusEntrySchema } from "../../packages/scene-contract/src/corpus.ts";

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

export const WorkerResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("prepared"),
    assets: z.object({
      normalizedSource: z.string().min(1),
      previewDepth: z.string().min(1),
    }),
    dimensions: z.object({ normalized: ImageDimensionsSchema }),
    model: ModelIdentitySchema,
    cacheStatus: z.string().min(1),
  }),
  z.object({
    status: z.literal("failed"),
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
  }),
]);

export type PreparedWorkerResult = Extract<
  z.infer<typeof WorkerResultSchema>,
  { status: "prepared" }
>;

export const ApiErrorSchema = z.object({ error: z.string().min(1) });
