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

export type CorpusFreezeBlockerCode =
  | "MANIFEST_NOT_FROZEN"
  | "CORPUS_TOO_SMALL"
  | "OUTSTANDING_REQUIREMENTS"
  | "CATEGORY_NOT_REPRESENTED"
  | "RIGHTS_NOT_REVIEWED"
  | "SOURCE_CHECKSUM_MISSING"
  | "SOURCE_PATH_DUPLICATE"
  | "SOURCE_CHECKSUM_DUPLICATE"
  | "SOURCE_UNREADABLE"
  | "SOURCE_CHECKSUM_MISMATCH"
  | "SOURCE_DIMENSIONS_MISMATCH"
  | "SOURCE_DIMENSIONS_UNREADABLE";

export type CorpusFreezeBlocker = {
  code: CorpusFreezeBlockerCode;
  message: string;
  entryId?: string;
  category?: CorpusCategory;
};

export const findCorpusFreezeBlockers = (
  manifest: CorpusManifest,
): CorpusFreezeBlocker[] => {
  const blockers: CorpusFreezeBlocker[] = [];

  if (manifest.status !== "frozen" || manifest.frozenAt === null) {
    blockers.push({
      code: "MANIFEST_NOT_FROZEN",
      message: "manifest status and frozenAt must record a completed freeze",
    });
  }
  if (manifest.entries.length < CORPUS_MINIMUM_SIZE) {
    blockers.push({
      code: "CORPUS_TOO_SMALL",
      message: `corpus requires at least ${CORPUS_MINIMUM_SIZE} real images`,
    });
  }
  if (manifest.outstandingRequirements.length > 0) {
    blockers.push({
      code: "OUTSTANDING_REQUIREMENTS",
      message: "outstanding corpus requirements must be resolved",
    });
  }

  const coveredCategories = new Set(
    manifest.entries.flatMap((entry) => entry.categories),
  );
  for (const category of REQUIRED_CORPUS_CATEGORIES) {
    if (!coveredCategories.has(category)) {
      blockers.push({
        code: "CATEGORY_NOT_REPRESENTED",
        message: `corpus category is not represented: ${category}`,
        category,
      });
    }
  }
  for (const entry of manifest.entries) {
    if (entry.rights.status === "unknown") {
      blockers.push({
        code: "RIGHTS_NOT_REVIEWED",
        message: `corpus entry must have reviewed rights: ${entry.id}`,
        entryId: entry.id,
      });
    }
    if (entry.source.sha256 === null) {
      blockers.push({
        code: "SOURCE_CHECKSUM_MISSING",
        message: `corpus entry must have a source checksum: ${entry.id}`,
        entryId: entry.id,
      });
    }
  }

  const sourcePaths = manifest.entries.map((entry) => entry.source.path);
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    blockers.push({
      code: "SOURCE_PATH_DUPLICATE",
      message: "every corpus entry must reference a unique source path",
    });
  }
  const sourceChecksums = manifest.entries.flatMap((entry) =>
    entry.source.sha256 === null ? [] : [entry.source.sha256],
  );
  if (new Set(sourceChecksums).size !== sourceChecksums.length) {
    blockers.push({
      code: "SOURCE_CHECKSUM_DUPLICATE",
      message: "every corpus entry must have a unique source checksum",
    });
  }

  return blockers;
};
