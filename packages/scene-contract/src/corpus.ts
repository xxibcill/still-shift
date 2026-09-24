import { z } from "zod";

import { V0_1_REQUEST_CONSTRAINTS } from "./contracts.ts";

export const CORPUS_SCHEMA_VERSION = "0.1" as const;
export const CORPUS_MINIMUM_SIZE = 30;
export const CORPUS_MAXIMUM_SIZE = 50;

export const CorpusCategorySchema = z.enum([
  "portrait_person",
  "landscape_environment",
  "architecture_interior",
  "product_object",
  "illustration_anime",
  "text_heavy_diagram",
  "difficult_edges",
]);

export const REQUIRED_CORPUS_CATEGORIES = CorpusCategorySchema.options;

export const CorpusEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    source: z
      .object({
        path: z.string().trim().min(1),
        tracked: z.boolean(),
        sha256: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .nullable(),
      })
      .strict(),
    categories: z
      .array(CorpusCategorySchema)
      .min(1)
      .refine((categories) => new Set(categories).size === categories.length, {
        message: "categories must be unique",
      })
      .meta({ uniqueItems: true }),
    dimensions: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict(),
    rights: z
      .object({
        status: z.enum(["owned", "licensed", "private_internal", "unknown"]),
        usageNotes: z.string().trim().min(1),
        attribution: z.string().trim().min(1).nullable(),
      })
      .strict(),
    expectedShotDurationMs: z
      .number()
      .int()
      .min(V0_1_REQUEST_CONSTRAINTS.durationMs.minimum)
      .max(V0_1_REQUEST_CONSTRAINTS.durationMs.maximum)
      .multipleOf(100),
    notes: z.string(),
  })
  .strict();

export const CorpusManifestSchema = z
  .object({
    $schema: z.string().trim().min(1),
    schemaVersion: z.literal(CORPUS_SCHEMA_VERSION),
    corpusId: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    status: z.enum(["incomplete", "frozen"]),
    frozenAt: z.string().datetime().nullable(),
    targetSize: z
      .object({
        minimum: z.literal(CORPUS_MINIMUM_SIZE),
        maximum: z.literal(CORPUS_MAXIMUM_SIZE),
      })
      .strict(),
    sourcePolicy: z
      .object({
        realExplainerWorkflowImagesRequired: z.literal(true),
        privateImagesMayRemainUntracked: z.literal(true),
      })
      .strict(),
    evaluationGatesDocument: z.string().trim().min(1),
    outstandingRequirements: z.array(z.string().trim().min(1)),
    entries: z.array(CorpusEntrySchema).max(CORPUS_MAXIMUM_SIZE),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = manifest.entries.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "corpus entry ids must be unique",
        path: ["entries"],
      });
    }
  });

export type CorpusManifest = z.infer<typeof CorpusManifestSchema>;
export type CorpusEntry = z.infer<typeof CorpusEntrySchema>;
export type CorpusCategory = z.infer<typeof CorpusCategorySchema>;

export const findCorpusFreezeBlockers = (
  manifest: CorpusManifest,
): string[] => {
  const blockers: string[] = [];

  if (manifest.status !== "frozen" || manifest.frozenAt === null) {
    blockers.push(
      "manifest status and frozenAt must record a completed freeze",
    );
  }
  if (manifest.entries.length < CORPUS_MINIMUM_SIZE) {
    blockers.push(
      `corpus requires at least ${CORPUS_MINIMUM_SIZE} real images`,
    );
  }
  if (manifest.outstandingRequirements.length > 0) {
    blockers.push("outstanding corpus requirements must be resolved");
  }

  const coveredCategories = new Set(
    manifest.entries.flatMap((entry) => entry.categories),
  );
  for (const category of REQUIRED_CORPUS_CATEGORIES) {
    if (!coveredCategories.has(category)) {
      blockers.push(`corpus category is not represented: ${category}`);
    }
  }
  if (manifest.entries.some((entry) => entry.rights.status === "unknown")) {
    blockers.push("every corpus entry must have reviewed rights");
  }
  if (manifest.entries.some((entry) => entry.source.sha256 === null)) {
    blockers.push("every corpus entry must have a source checksum");
  }

  const sourcePaths = manifest.entries.map((entry) => entry.source.path);
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    blockers.push("every corpus entry must reference a unique source path");
  }
  const sourceChecksums = manifest.entries.flatMap((entry) =>
    entry.source.sha256 === null ? [] : [entry.source.sha256],
  );
  if (new Set(sourceChecksums).size !== sourceChecksums.length) {
    blockers.push("every corpus entry must have a unique source checksum");
  }

  return blockers;
};
