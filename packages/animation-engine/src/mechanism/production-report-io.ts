import { dirname, join, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import {
  CompositionNodeMemory,
  isCompositionNodeCapacityError,
  compositionNodeJsonSize,
} from "@still-shift/execution-runtime/export";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import {
  failureDiagnostic,
  type FailureDiagnostic,
} from "@still-shift/scene-contract";
import {
  MechanismProductionQueueSchema,
  MechanismProductionQueueStateSchema,
  MechanismProductionQueueCheckpointSchema,
  MECHANISM_PRODUCTION_QUEUE_LIMITS as LIMIT,
  MechanismProductionOwnedFileSchema,
  type MechanismProductionQueueRow,
} from "./production-queue-contract.ts";
import { z } from "zod";
import {
  readProductionJSON,
  productionFile,
  productionOwnedPath,
  verifyProductionArtifacts,
  productionFailure,
} from "./production-queue-files.ts";
import {
  assertProductionJournal,
  assertProductionProduct,
  productionReportAttempts,
} from "./production-queue-validation.ts";
import {
  createUnreviewedMechanismQA,
  inspectMechanismProductionDisposition,
  MechanismProductionEpisodeReportSchema,
  summarizeMechanismProductionCohort,
  type MechanismProductionEpisodeReport,
  type MechanismProductionDisposition,
  type MechanismProductionCohortReport,
  type MechanismProductionQA,
  MECHANISM_QA_DIMENSIONS,
  MechanismProductionQASchema,
  MechanismProductionCohortReportSchema,
} from "./production-report.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import { freezeMechanismPack, mechanismPackHash } from "./pack-support.ts";
import type {
  MechanismProductionExecutor,
  MechanismProductionQueueOptions,
} from "./production-queue.ts";

export const MECHANISM_PRODUCTION_REPORT_LIMITS = {
  completeBytes: 8 * 1024 * 1024,
  retainedCapacityBytes: 64 * 1024 * 1024,
} as const;
type OwnedFile = z.infer<typeof MechanismProductionOwnedFileSchema>;
export interface MechanismProductionReportedEpisode {
  queueStatus: MechanismProductionQueueRow["status"];
  validation: {
    status: "verified" | "stale" | "unavailable";
    issue: FailureDiagnostic | null;
  };
  product: OwnedFile | null;
  qualityEvidence: OwnedFile | null;
  priorProducts: OwnedFile[];
  cacheFailures: MechanismProductionQueueRow["cacheFailures"];
  retainedQA: MechanismProductionQA[];
  report: MechanismProductionEpisodeReport;
  disposition: MechanismProductionDisposition;
}
export interface MechanismProductionReportBundle {
  schemaVersion: "mechanism-production-report-bundle-1";
  source: {
    queueId: string;
    revision: number;
    manifestSha256: string;
    manifestFileSha256: string;
    journalFileSha256: string;
    queueCodeSha256: string;
    queueProfileSha256: string;
    currentCodeSha256: string;
    currentProfileSha256: string;
  };
  episodes: MechanismProductionReportedEpisode[];
  cohort: MechanismProductionCohortReport;
  qualification: string;
}
const reportHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const reportFailure = z
  .object({
    stage: z.string().max(128),
    path: z.string().max(2048).optional(),
    nextAction: z.string().max(2048),
    causes: z
      .array(
        z
          .object({
            name: z.string().max(64),
            code: z.string().max(128).optional(),
            message: z.string().max(1024),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
const dispositionStatus = z.enum(["passed", "failed", "unreviewed"]);
const dimension = z.enum(MECHANISM_QA_DIMENSIONS);
export const MechanismProductionReportBundleSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-report-bundle-1"),
    source: z
      .object({
        queueId: z.string().min(1).max(80),
        revision: z.number().int().nonnegative().max(31),
        manifestSha256: reportHash,
        manifestFileSha256: reportHash,
        journalFileSha256: reportHash,
        queueCodeSha256: reportHash,
        queueProfileSha256: reportHash,
        currentCodeSha256: reportHash,
        currentProfileSha256: reportHash,
      })
      .strict(),
    episodes: z
      .array(
        z
          .object({
            queueStatus: z.enum([
              "pending",
              "running",
              "passed",
              "failed",
              "cancelled",
            ]),
            validation: z
              .object({
                status: z.enum(["verified", "stale", "unavailable"]),
                issue: reportFailure.nullable(),
              })
              .strict(),
            product: MechanismProductionOwnedFileSchema.nullable(),
            qualityEvidence:
              MechanismProductionOwnedFileSchema.nullable().default(null),
            priorProducts: z.array(MechanismProductionOwnedFileSchema).max(32),
            cacheFailures:
              MechanismProductionQueueStateSchema.shape.rows.element.shape
                .cacheFailures,
            retainedQA: z.array(MechanismProductionQASchema).max(6),
            report: MechanismProductionEpisodeReportSchema,
            disposition: z
              .object({
                reviewedReady: z.boolean(),
                statuses: z
                  .object(
                    Object.fromEntries(
                      MECHANISM_QA_DIMENSIONS.map((d) => [
                        d,
                        dispositionStatus,
                      ]),
                    ) as Record<
                      (typeof MECHANISM_QA_DIMENSIONS)[number],
                      typeof dispositionStatus
                    >,
                  )
                  .strict(),
                staleDimensions: z.array(dimension).max(6),
                incompleteDimensions: z.array(dimension).max(6),
              })
              .strict(),
          })
          .strict(),
      )
      .max(300),
    cohort: MechanismProductionCohortReportSchema,
    qualification: z.string().min(1).max(2048),
  })
  .strict()
  .superRefine((bundle, ctx) => {
    if (
      mechanismPackHash(
        summarizeMechanismProductionCohort(
          bundle.episodes.map((e) => e.report),
        ),
      ) !== mechanismPackHash(bundle.cohort)
    )
      ctx.addIssue({
        code: "custom",
        message: "Cohort summary must agree with every current episode report",
      });
    for (const episode of bundle.episodes) {
      if (
        mechanismPackHash(
          inspectMechanismProductionDisposition(episode.report),
        ) !== mechanismPackHash(episode.disposition)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Episode disposition must agree with its current artifact-specific QA",
        });
      if (
        episode.validation.status !== "verified" &&
        episode.disposition.reviewedReady
      )
        ctx.addIssue({
          code: "custom",
          message: "An unverified artifact cannot retain reviewed-ready state",
        });
    }
  });
/** Recheck persisted attempts and artifact/dependency identities under the queue lock. Never executes, retries or changes the journal. */
export async function readMechanismProductionReports(
  manifestPath: string,
  outputDirectory: string,
  executor: Pick<
    MechanismProductionExecutor,
    "codeSha256" | "profileSha256" | "verify"
  >,
  options: MechanismProductionQueueOptions = {},
): Promise<MechanismProductionReportBundle> {
  options.signal?.throwIfAborted();
  const root = await realpath(resolve(outputDirectory));
  const owner = new CompositionNodeMemory(options.nodeMemory);
  let unlock: (() => Promise<void>) | undefined;
  let manifest:
    | Awaited<
        ReturnType<
          typeof readProductionJSON<
            ReturnType<typeof MechanismProductionQueueSchema.parse>
          >
        >
      >
    | undefined;
  let journal:
    | Awaited<
        ReturnType<
          typeof readProductionJSON<
            ReturnType<typeof MechanismProductionQueueStateSchema.parse>
          >
        >
      >
    | undefined;
  const capacity = owner.reserve(
    MECHANISM_PRODUCTION_REPORT_LIMITS.retainedCapacityBytes,
  );
  let transferred = false;
  try {
    unlock = await acquireArtifactLock(
      join(root, ".production.lock"),
      root,
      options,
    );
    manifest = await readProductionJSON(
      manifestPath,
      MechanismProductionQueueSchema,
      owner,
      LIMIT.manifestBytes,
      options.signal,
    );
    journal = await readProductionJSON(
      join(root, "queue-state.json"),
      MechanismProductionQueueStateSchema,
      owner,
      LIMIT.journalBytes,
      options.signal,
    );
    const queue = manifest.value,
      state = journal.value;
    assertProductionJournal(queue, mechanismPackHash(queue), state);
    const runtimeCurrent =
      queue.codeSha256 === executor.codeSha256 &&
      queue.profileSha256 === executor.profileSha256;
    const episodes: MechanismProductionReportedEpisode[] = [];
    for (const item of queue.items) {
      options.signal?.throwIfAborted();
      const row = state.rows.find((r) => r.id === item.id)!;
      const child = new CompositionNodeMemory(owner);
      let original: MechanismProductionEpisodeReport | undefined;
      let qualityEvidence: OwnedFile | null = null;
      let outputSha256: string | null = null,
        issue: FailureDiagnostic | null = null;
      let validation: MechanismProductionReportedEpisode["validation"]["status"] =
        "unavailable";
      try {
        for (const input of item.inputs) {
          const actual = await cuePlateFile(
            resolve(dirname(resolve(manifestPath)), input.path),
            child,
            { sha256: input.sha256, signal: options.signal },
          );
          if (actual.bytes !== input.bytes)
            productionFailure(
              "production-dependency-size",
              "Declared dependency byte count changed",
              input.path,
            );
        }
        if (row.product) {
          const actual = await productionFile(root, row.product.path, child);
          if (
            actual.sha256 !== row.product.sha256 ||
            actual.bytes !== row.product.bytes
          )
            productionFailure(
              "production-product-hash",
              "Sealed product changed",
              row.product.path,
            );
          const loaded = await readProductionJSON(
            await productionOwnedPath(root, row.product.path),
            MechanismProductionQueueCheckpointSchema,
            child,
            LIMIT.productBytes,
            options.signal,
          );
          try {
            const { completion, ...payload } = loaded.value;
            const product = assertProductionProduct(queue, item, row, payload);
            // Keep the checkpoint extension out of the strict product schema.
            if (
              mechanismPackHash(completion) !==
                mechanismPackHash(row.attempts.at(-1)) ||
              mechanismPackHash(product.report.attempts) !==
                mechanismPackHash(productionReportAttempts(row.attempts))
            )
              productionFailure(
                "production-completion-binding",
                "Sealed completion/attempts differ from the journal",
                item.id,
              );
            original = product.report;
            await verifyProductionArtifacts(
              root,
              product,
              child,
              options.signal,
            );
            outputSha256 = product.report.binding.outputSha256;
            if (runtimeCurrent) {
              await executor.verify(item, product, {
                manifestDirectory: dirname(resolve(manifestPath)),
                manifestPath: resolve(manifestPath),
                outputRoot: root,
                attemptDirectory: join(
                  root,
                  "items",
                  item.id,
                  String(row.attempts.at(-1)!.number),
                ),
                requestHash: row.requestHash,
                nodeMemory: child,
                signal: options.signal,
                progress: async () => {},
              });
              await verifyProductionArtifacts(
                root,
                product,
                child,
                options.signal,
              );
              for (const input of item.inputs) {
                const actual = await cuePlateFile(
                  resolve(dirname(resolve(manifestPath)), input.path),
                  child,
                  { sha256: input.sha256, signal: options.signal },
                );
                if (actual.bytes !== input.bytes)
                  productionFailure(
                    "production-dependency-size",
                    "Dependency changed during report verification",
                    input.path,
                  );
              }
              qualityEvidence =
                product.artifacts.find((f) =>
                  f.path.endsWith("/qa-facts.json"),
                ) ?? null;
              validation = "verified";
            } else {
              validation = "stale";
              issue = {
                stage: "current-runtime-identity",
                path: "codeSha256/profileSha256",
                nextAction:
                  "Create a revision with the current runtime identity and revalidate affected products; retain prior receipts.",
                causes: [
                  {
                    name: "StaleRuntime",
                    message:
                      "Queued code/profile differs from the current report verifier.",
                  },
                ],
              };
            }
          } finally {
            loaded.release();
          }
        }
      } catch (error) {
        options.signal?.throwIfAborted();
        validation = isCompositionNodeCapacityError(error)
          ? "unavailable"
          : "stale";
        outputSha256 = null;
        issue = failureDiagnostic(error);
      } finally {
        child.dispose();
      }
      const binding = {
        inputSha256: row.requestHash,
        outputSha256,
        codeSha256: executor.codeSha256,
        profileSha256: executor.profileSha256,
      };
      const report = MechanismProductionEpisodeReportSchema.parse({
        schemaVersion: "mechanism-production-episode-report-1",
        id: item.id,
        question: item.question,
        family: item.family,
        designVariant: item.designVariant,
        binding,
        clock: item.clock,
        attempts: productionReportAttempts(row.attempts),
        qa:
          validation === "verified" && original
            ? original.qa
            : createUnreviewedMechanismQA(binding),
        unresolvedMechanicalFailures:
          original?.unresolvedMechanicalFailures ?? 0,
        durations: original?.durations ?? {
          setupSeconds: null,
          routineSeconds: null,
          renderSeconds: null,
        },
        authoring: original?.authoring ?? {
          setupTokens: null,
          routineTokens: null,
          baselineRoutineTokens: null,
          comparable: false,
          measurementEvidence: null,
        },
      });
      episodes.push({
        queueStatus: row.status,
        validation: { status: validation, issue },
        product: row.product,
        qualityEvidence: validation === "verified" ? qualityEvidence : null,
        priorProducts: row.priorProducts,
        cacheFailures: row.cacheFailures,
        retainedQA: original?.qa ?? [],
        report,
        disposition: inspectMechanismProductionDisposition(report),
      });
      compositionNodeJsonSize(
        episodes,
        0,
        "",
        MECHANISM_PRODUCTION_REPORT_LIMITS.retainedCapacityBytes,
      );
    }
    const result: MechanismProductionReportBundle = {
      schemaVersion: "mechanism-production-report-bundle-1",
      source: {
        queueId: queue.id,
        revision: queue.revision,
        manifestSha256: state.manifestHash,
        manifestFileSha256: manifest.sha256,
        journalFileSha256: journal.sha256,
        queueCodeSha256: queue.codeSha256,
        queueProfileSha256: queue.profileSha256,
        currentCodeSha256: executor.codeSha256,
        currentProfileSha256: executor.profileSha256,
      },
      episodes,
      cohort: summarizeMechanismProductionCohort(episodes.map((e) => e.report)),
      qualification:
        "Current artifact audit with original attempt/setup/routine history. Review metadata remains declared evidence; no new jobs, human acceptance, frozen pilot admission or achieved pilot target is inferred. Missing authoring telemetry remains null.",
    };
    const size = compositionNodeJsonSize(
      result,
      2,
      "\n",
      MECHANISM_PRODUCTION_REPORT_LIMITS.retainedCapacityBytes,
    );
    if (size.encodedBytes > MECHANISM_PRODUCTION_REPORT_LIMITS.completeBytes)
      productionFailure(
        "production-report-size",
        "Complete production report exceeds8MiB",
        root,
      );
    for (const pin of [
      { path: manifestPath, sha256: manifest.sha256 },
      { path: join(root, "queue-state.json"), sha256: journal.sha256 },
    ])
      await cuePlateFile(pin.path, owner, {
        sha256: pin.sha256,
        signal: options.signal,
      });
    MechanismProductionReportBundleSchema.parse(result);
    const frozen = freezeMechanismPack(result);
    journal.release();
    journal = undefined;
    manifest.release();
    manifest = undefined;
    if (options.nodeMemory) {
      owner.transfer();
      transferred = true;
    }
    return frozen;
  } finally {
    journal?.release();
    manifest?.release();
    if (!transferred) capacity.release();
    try {
      await unlock?.();
    } finally {
      owner.dispose();
    }
  }
}
