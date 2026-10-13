import { z } from "zod";
import { MechanismProductionFindingSchema } from "./production-failure.ts";
import {
  MechanismHashSchema,
  MechanismIdSchema,
} from "@still-shift/scene-contract";

export const MECHANISM_QA_DIMENSIONS = [
  "technical",
  "mechanical",
  "sampled-visual",
  "continuous-motion",
  "listening",
  "factual",
] as const;
export type MechanismQADimension = (typeof MECHANISM_QA_DIMENSIONS)[number];
const status = z.enum(["passed", "failed", "unreviewed"]);
const measurement = z.number().finite().nonnegative().nullable();
const tokenCount = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
export const MechanismProductionArtifactSchema = z
  .object({
    path: z.string().min(1).max(2048),
    sha256: MechanismHashSchema,
  })
  .strict();
export const MechanismProductionBindingSchema = z
  .object({
    inputSha256: MechanismHashSchema,
    outputSha256: MechanismHashSchema.nullable(),
    codeSha256: MechanismHashSchema,
    profileSha256: MechanismHashSchema,
  })
  .strict();
export type MechanismProductionBinding = z.infer<
  typeof MechanismProductionBindingSchema
>;
export const MechanismProductionQASchema = z
  .object({
    dimension: z.enum(MECHANISM_QA_DIMENSIONS),
    status,
    binding: MechanismProductionBindingSchema,
    method: z.string().min(1).max(256),
    evaluatedInterval: z
      .object({
        unit: z.enum(["output-frame", "source-sample"]),
        start: z.number().int().nonnegative().max(172800000),
        endExclusive: z.number().int().positive().max(172800000),
      })
      .strict()
      .refine((i) => i.endExclusive > i.start, {
        message: "QA interval must be nonempty",
      })
      .nullable(),
    evidence: z.array(MechanismProductionArtifactSchema).max(4),
    reviewer: z
      .object({
        kind: z.enum(["automated", "agent", "human"]),
        id: z.string().min(1).max(128),
      })
      .strict()
      .nullable(),
    explanation: z.string().min(1).max(2048),
  })
  .strict()
  .superRefine((review, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (review.status === "unreviewed") {
      if (
        review.method !== "not-reviewed" ||
        review.evaluatedInterval !== null ||
        review.evidence.length ||
        review.reviewer !== null
      )
        reject(
          "Unreviewed QA must not carry an evaluated interval or completed-review evidence",
        );
    } else {
      if (
        review.method === "not-reviewed" ||
        !review.reviewer ||
        !review.evidence.length
      )
        reject(
          "Completed QA requires a method, reviewer and artifact evidence",
        );
      if (
        review.status === "passed" &&
        (!review.binding.outputSha256 || !review.evaluatedInterval)
      )
        reject(
          "Passed QA requires the actual output identity and evaluated interval",
        );
      if (
        review.status === "passed" &&
        ["continuous-motion", "listening", "factual"].includes(
          review.dimension,
        ) &&
        review.reviewer?.kind === "automated"
      )
        reject(
          "Automated checks cannot declare playback, listening or factual review passed",
        );
    }
  });
export type MechanismProductionQA = z.infer<typeof MechanismProductionQASchema>;

const productionEpisodeFields = z
  .object({
    schemaVersion: z.literal("mechanism-production-episode-report-1"),
    id: MechanismIdSchema,
    question: z.string().min(1).max(512),
    family: z.enum(["tape-hook", "cable-tie", "clothespeg"]),
    designVariant: z.string().min(1).max(256),
    binding: MechanismProductionBindingSchema,
    clock: z
      .object({
        outputFrames: z.number().int().positive().max(108000),
        sourceSamples: z.number().int().positive().max(172800000),
      })
      .strict(),
    attempts: z
      .array(
        z
          .object({
            number: z.number().int().min(1).max(96),
            inputSha256: MechanismHashSchema,
            status: z.enum([
              "running",
              "passed",
              "failed",
              "cancelled",
              "interrupted",
            ]),
            stage: z.string().min(1).max(128),
            seconds: z.number().finite().nonnegative().max(86400).nullable(),
            diagnostic: z.string().max(2048).nullable(),
            finding: MechanismProductionFindingSchema.optional(),
          })
          .strict(),
      )
      .max(96),
    qa: z
      .array(MechanismProductionQASchema)
      .length(MECHANISM_QA_DIMENSIONS.length),
    unresolvedMechanicalFailures: z.number().int().nonnegative().max(100000),
    durations: z
      .object({
        setupSeconds: measurement,
        routineSeconds: measurement,
        renderSeconds: measurement,
      })
      .strict(),
    authoring: z
      .object({
        setupTokens: tokenCount,
        routineTokens: tokenCount,
        baselineRoutineTokens: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .nullable(),
        comparable: z.boolean(),
        measurementEvidence: MechanismProductionArtifactSchema.nullable(),
      })
      .strict(),
  })
  .strict();
function validateProductionEpisode(
  report: Pick<
    z.infer<typeof productionEpisodeFields>,
    "qa" | "attempts" | "binding" | "clock" | "authoring"
  >,
  ctx: z.RefinementCtx,
) {
  const reject = (message: string) => ctx.addIssue({ code: "custom", message });
  if (
    new Set(report.qa.map((q) => q.dimension)).size !==
    MECHANISM_QA_DIMENSIONS.length
  )
    reject("Each QA dimension must appear exactly once");
  if (report.attempts.some((a, i) => a.number !== i + 1))
    reject("Attempt history must retain contiguous original attempt numbers");
  for (const review of report.qa) {
    const interval = review.evaluatedInterval;
    if (
      interval &&
      mechanismProductionBindingMatches(review.binding, report.binding)
    ) {
      const limit =
        interval.unit === "output-frame"
          ? report.clock.outputFrames
          : report.clock.sourceSamples;
      if (interval.endExclusive > limit)
        reject("Current QA interval exceeds its bound artifact clock");
    }
  }
  const tokens = report.authoring;
  if (
    [
      tokens.setupTokens,
      tokens.routineTokens,
      tokens.baselineRoutineTokens,
    ].some((x) => x !== null) &&
    !tokens.measurementEvidence
  )
    reject("Token measurements require retained measurement evidence");
}
export const MechanismProductionEpisodeReportSchema =
  productionEpisodeFields.superRefine(validateProductionEpisode);
export const BlenderProductionEpisodeReportSchema = z
  .object({
    ...productionEpisodeFields.shape,
    schemaVersion: z.literal("mechanism-production-episode-report-2"),
    backend: z.literal("blender-native"),
    family: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,127}$/),
  })
  .strict()
  .superRefine(validateProductionEpisode);
export type BlenderProductionEpisodeReport = z.infer<
  typeof BlenderProductionEpisodeReportSchema
>;
export const MechanismProductionEpisodeReportVersionsSchema = z.union([
  MechanismProductionEpisodeReportSchema,
  BlenderProductionEpisodeReportSchema,
]);
export type MechanismProductionEpisodeReportAny = z.infer<
  typeof MechanismProductionEpisodeReportVersionsSchema
>;

export type MechanismProductionEpisodeReport = z.infer<
  typeof MechanismProductionEpisodeReportSchema
>;

export function mechanismProductionBindingMatches(
  a: MechanismProductionBinding,
  b: MechanismProductionBinding,
): boolean {
  return (
    a.inputSha256 === b.inputSha256 &&
    a.outputSha256 === b.outputSha256 &&
    a.codeSha256 === b.codeSha256 &&
    a.profileSha256 === b.profileSha256
  );
}

export function createUnreviewedMechanismQA(
  input: MechanismProductionBinding,
): MechanismProductionQA[] {
  const binding = MechanismProductionBindingSchema.parse(input);
  return MECHANISM_QA_DIMENSIONS.map((dimension) => ({
    dimension,
    status: "unreviewed",
    binding: { ...binding },
    method: "not-reviewed",
    evaluatedInterval: null,
    evidence: [],
    reviewer: null,
    explanation: "This artifact has not been evaluated for this QA dimension.",
  }));
}

export type MechanismProductionDisposition = {
  reviewedReady: boolean;
  statuses: Record<MechanismQADimension, "passed" | "failed" | "unreviewed">;
  staleDimensions: MechanismQADimension[];
  incompleteDimensions: MechanismQADimension[];
};
export function inspectMechanismProductionDisposition(
  input: unknown,
): MechanismProductionDisposition {
  const report = MechanismProductionEpisodeReportVersionsSchema.parse(input);
  const staleDimensions: MechanismQADimension[] = [];
  const incompleteDimensions: MechanismQADimension[] = [];
  const statuses = {} as MechanismProductionDisposition["statuses"];
  for (const review of report.qa) {
    const current = mechanismProductionBindingMatches(
      review.binding,
      report.binding,
    );
    if (!current) staleDimensions.push(review.dimension);
    const interval = review.evaluatedInterval;
    const unit =
      review.dimension === "listening" ? "source-sample" : "output-frame";
    const limit =
      unit === "source-sample"
        ? report.clock.sourceSamples
        : report.clock.outputFrames;
    const complete =
      interval?.unit === unit &&
      (review.dimension === "sampled-visual" ||
        (interval.start === 0 && interval.endExclusive === limit));
    if (current && review.status === "passed" && !complete)
      incompleteDimensions.push(review.dimension);
    statuses[review.dimension] =
      !current || (review.status === "passed" && !complete)
        ? "unreviewed"
        : review.status;
  }
  return {
    reviewedReady:
      report.binding.outputSha256 !== null &&
      report.unresolvedMechanicalFailures === 0 &&
      MECHANISM_QA_DIMENSIONS.every((d) => statuses[d] === "passed"),
    statuses,
    staleDimensions,
    incompleteDimensions,
  };
}

/** Linear interpolation at (n - 1) * p; missing measurements remain absent. */
export function mechanismProductionPercentile(
  values: readonly number[],
  p: number,
): number | null {
  if (!Number.isFinite(p) || p < 0 || p > 1)
    throw Error("Production percentile must be between zero and one");
  if (values.some((v) => !Number.isFinite(v) || v < 0))
    throw Error("Production durations must be finite and nonnegative");
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * p,
    lower = Math.floor(at),
    upper = Math.ceil(at);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (at - lower);
}

const reviewCount = z
  .object({
    passed: z.number().int().nonnegative().max(300),
    failed: z.number().int().nonnegative().max(300),
    unreviewed: z.number().int().nonnegative().max(300),
  })
  .strict();
const durationSummary = z
  .object({
    available: z.number().int().nonnegative().max(300),
    p50: measurement,
    p95: measurement,
  })
  .strict();
export const MechanismProductionCohortReportSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-cohort-report-1"),
    percentileMethod: z.literal("linear-interpolation-at-n-minus-one"),
    selected: z.number().int().nonnegative().max(300),
    attempted: z.number().int().nonnegative().max(300),
    firstPassTechnical: z
      .object({
        completed: z.number().int().nonnegative().max(300),
        passed: z.number().int().nonnegative().max(300),
        rate: z.number().min(0).max(1).nullable(),
        targetSatisfied: z.boolean().nullable(),
      })
      .strict(),
    failures: z
      .object({
        failedAttempts: z.number().int().nonnegative().max(28800),
        repeatedFailureEpisodes: z.number().int().nonnegative().max(300),
        cancelled: z.number().int().nonnegative().max(28800),
        interrupted: z.number().int().nonnegative().max(28800),
      })
      .strict(),
    reviewedReady: z.number().int().nonnegative().max(300),
    reviewCounts: z
      .object(
        Object.fromEntries(
          MECHANISM_QA_DIMENSIONS.map((d) => [d, reviewCount]),
        ) as Record<MechanismQADimension, typeof reviewCount>,
      )
      .strict(),
    durations: z
      .object({
        setupSeconds: durationSummary,
        routineSeconds: durationSummary,
        renderSeconds: durationSummary,
      })
      .strict(),
    authoring: z
      .object({
        comparablePairedTasks: z.number().int().nonnegative().max(300),
        routineMedianTokens: measurement,
        baselineMedianTokens: measurement,
        savings: z.number().finite().nullable(),
        targetSatisfied: z.boolean().nullable(),
      })
      .strict(),
    rows: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            question: z.string().min(1).max(512),
            family: z.string().min(1).max(128),
            reviewedReady: z.boolean(),
            attempts: z.number().int().nonnegative().max(96),
            failedAttempts: z.number().int().nonnegative().max(96),
            staleDimensions: z.array(z.enum(MECHANISM_QA_DIMENSIONS)).max(6),
            incompleteDimensions: z
              .array(z.enum(MECHANISM_QA_DIMENSIONS))
              .max(6),
          })
          .strict(),
      )
      .max(300),
  })
  .strict();
export type MechanismProductionCohortReport = z.infer<
  typeof MechanismProductionCohortReportSchema
>;
export function summarizeMechanismProductionCohort(
  input: readonly unknown[],
): MechanismProductionCohortReport {
  const reports = z
    .array(MechanismProductionEpisodeReportVersionsSchema)
    .max(300)
    .parse(input);
  if (new Set(reports.map((r) => r.id)).size !== reports.length)
    throw Error("Production cohort requires distinct episode IDs");
  const questions = reports.map((r) =>
    r.question.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
  );
  if (questions.some((q) => !q) || new Set(questions).size !== reports.length)
    throw Error(
      "Production cohort requires distinct questions; IDs alone do not establish distinctness",
    );
  const reviewCounts = Object.fromEntries(
    MECHANISM_QA_DIMENSIONS.map((d) => [
      d,
      { passed: 0, failed: 0, unreviewed: 0 },
    ]),
  ) as MechanismProductionCohortReport["reviewCounts"];
  const dispositions = reports.map(inspectMechanismProductionDisposition);
  dispositions.forEach((d) =>
    MECHANISM_QA_DIMENSIONS.forEach((k) => reviewCounts[k][d.statuses[k]]++),
  );
  const attempted = reports.filter((r) => r.attempts.length).length;
  const firstCompleted = reports.filter(
    (r) => r.attempts[0] && r.attempts[0].status !== "running",
  ).length;
  const firstPassed = reports.filter(
    (r) => r.attempts[0]?.status === "passed",
  ).length;
  const paired = reports.filter(
    (r) =>
      r.authoring.comparable &&
      r.authoring.routineTokens !== null &&
      r.authoring.baselineRoutineTokens !== null,
  );
  const fullyPaired = reports.length > 0 && paired.length === reports.length;
  const routineMedian = fullyPaired
    ? mechanismProductionPercentile(
        paired.map((r) => r.authoring.routineTokens!),
        0.5,
      )
    : null;
  const baselineMedian = fullyPaired
    ? mechanismProductionPercentile(
        paired.map((r) => r.authoring.baselineRoutineTokens!),
        0.5,
      )
    : null;
  const savings =
    routineMedian !== null && baselineMedian !== null
      ? 1 - routineMedian / baselineMedian
      : null;
  const failures = reports.map(
    (r) => r.attempts.filter((a) => a.status === "failed").length,
  );
  const durations = Object.fromEntries(
    (["setupSeconds", "routineSeconds", "renderSeconds"] as const).map(
      (key) => {
        const values = reports.flatMap((r) =>
          r.durations[key] === null ? [] : [r.durations[key]],
        );
        return [
          key,
          {
            available: values.length,
            p50: mechanismProductionPercentile(values, 0.5),
            p95: mechanismProductionPercentile(values, 0.95),
          },
        ];
      },
    ),
  ) as MechanismProductionCohortReport["durations"];
  return {
    schemaVersion: "mechanism-production-cohort-report-1",
    percentileMethod: "linear-interpolation-at-n-minus-one",
    selected: reports.length,
    attempted,
    firstPassTechnical: {
      completed: firstCompleted,
      passed: firstPassed,
      rate: firstCompleted ? firstPassed / firstCompleted : null,
      targetSatisfied:
        reports.length && firstCompleted === reports.length
          ? firstPassed / reports.length >= 0.9
          : null,
    },
    failures: {
      failedAttempts: failures.reduce((a, b) => a + b, 0),
      repeatedFailureEpisodes: failures.filter((n) => n > 1).length,
      cancelled: reports
        .flatMap((r) => r.attempts)
        .filter((a) => a.status === "cancelled").length,
      interrupted: reports
        .flatMap((r) => r.attempts)
        .filter((a) => a.status === "interrupted").length,
    },
    reviewedReady: dispositions.filter((d) => d.reviewedReady).length,
    reviewCounts,
    durations,
    authoring: {
      comparablePairedTasks: paired.length,
      routineMedianTokens: routineMedian,
      baselineMedianTokens: baselineMedian,
      savings,
      targetSatisfied: savings === null ? null : savings >= 0.5,
    },
    rows: reports.map((r, i) => ({
      id: r.id,
      question: r.question,
      family: r.family,
      reviewedReady: dispositions[i]!.reviewedReady,
      attempts: r.attempts.length,
      failedAttempts: failures[i]!,
      staleDimensions: dispositions[i]!.staleDimensions,
      incompleteDimensions: dispositions[i]!.incompleteDimensions,
    })),
  };
}
