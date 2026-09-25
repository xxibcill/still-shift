import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  AnimationResultSchema,
  CorpusManifestSchema,
  SceneManifestSchema,
  type AnimationResult,
} from "@still-shift/scene-contract";
import {
  hashBatchArtifacts,
  selectBenchmarkRun,
} from "../../tools/still-shift-cli/src/batch-identity.ts";
import { findCorpusIntegrityBlockers } from "../corpus-integrity.ts";
import {
  AssemblyEvidenceSchema,
  fileSha256,
  verifyAssemblyEvidence,
} from "./assembly-evidence.ts";
import { resolveDecision } from "./decision.ts";
import {
  compareIndependentRenders,
  validateEvaluationRecords,
  validateEvaluationScene,
  verifyCurrentEvaluationExport,
} from "./evidence.ts";
import {
  assertRatingsIdentity,
  RatingsExportSchema,
  summarizeEvaluationRatings,
} from "./ratings.ts";
import {
  evaluationGuidePath,
  formatGateEvidence,
  parityGuidePath,
  resolveSuppliedEvidence,
  type GateEvidence,
} from "./report-evidence.ts";

const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const required = (name: string): string => {
  const value = option(name);
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return resolve(value);
};
const numericOption = (name: string): number | null => {
  const value = option(name);
  if (value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new Error(`${name} must be a nonnegative number`);
  return number;
};
const percent = (value: number): string => `${(100 * value).toFixed(1)}%`;
const readOptional = async (
  path: string | undefined,
): Promise<unknown | null> =>
  path ? JSON.parse(await readFile(resolve(path), "utf8")) : null;

const corpusPath = required("--corpus");
const resultsPath = required("--results");
const outputPath = required("--output");
const determinismResultsPath = option("--determinism-results");
const ratingsInput = await readOptional(option("--ratings"));
const ratings =
  ratingsInput === null ? null : RatingsExportSchema.parse(ratingsInput);
const assemblyInput = await readOptional(option("--assembly"));
const computeUsdPerHour = numericOption("--compute-usd-per-hour");
const computePriceSource = option("--compute-price-source") ?? null;
const videoBaselineUsdPerMinute = numericOption(
  "--video-baseline-usd-per-minute",
);
const videoBaselineName = option("--video-baseline-name") ?? null;
const videoBaselineSource = option("--video-baseline-source") ?? null;
const operatorMinutes = numericOption("--operator-minutes");
const editorialAccepted = option("--editorial-accepted");
const previewExportAccepted = option("--preview-export-accepted");
const previewExportEvidence = option("--preview-export-evidence");
const decisionOutcome = option("--decision");
const decisionReviewer = option("--decision-reviewer");
const decisionRationale = option("--decision-rationale");
const ratingsPath = option("--ratings");
const assemblyPath = option("--assembly");
const previewExportEvidenceTarget = await resolveSuppliedEvidence(
  previewExportEvidence,
);
const computePriceEvidenceTarget = await resolveSuppliedEvidence(
  computePriceSource ?? undefined,
);
const videoBaselineEvidenceTarget = await resolveSuppliedEvidence(
  videoBaselineSource ?? undefined,
);
if (
  editorialAccepted !== undefined &&
  !["yes", "no"].includes(editorialAccepted)
)
  throw new Error("--editorial-accepted must be yes or no");
if (
  previewExportAccepted !== undefined &&
  !["yes", "no"].includes(previewExportAccepted)
)
  throw new Error("--preview-export-accepted must be yes or no");

const corpusBytes = await readFile(corpusPath);
const corpusSha256 = `sha256:${createHash("sha256").update(corpusBytes).digest("hex")}`;
const corpus = CorpusManifestSchema.parse(
  JSON.parse(corpusBytes.toString("utf8")),
);
const freezeBlockers = findCorpusIntegrityBlockers(corpus, {
  sourceRoot: dirname(corpusPath),
});
if (corpus.status === "frozen" && freezeBlockers.length)
  throw new Error(
    `Frozen corpus has integrity blockers: ${freezeBlockers.map((blocker) => blocker.code).join(", ")}`,
  );
const records = (await readFile(resultsPath, "utf8"))
  .trim()
  .split("\n")
  .map(
    (line) =>
      JSON.parse(line) as {
        id: string;
        status: string;
        requestHash: string | null;
        reused: boolean;
        result?: unknown;
      },
  )
  .map((record) => ({
    ...record,
    result: record.result
      ? AnimationResultSchema.parse(record.result)
      : undefined,
  }));
validateEvaluationRecords(corpus, records);
for (const record of records) {
  if (!record.result) continue;
  const normalizedSourcePath = record.result.assetPaths?.normalizedSource;
  if (!normalizedSourcePath)
    throw new Error(`Evaluation result has no normalized source: ${record.id}`);
  const scene = SceneManifestSchema.parse(
    JSON.parse(await readFile(record.result.sceneManifestPath, "utf8")),
  );
  validateEvaluationScene(
    scene,
    await fileSha256(normalizedSourcePath),
    record.result.selectedPreset,
  );
}
const results: AnimationResult[] = records
  .filter((record) => record.result)
  .map((record) => record.result!);
const invalidExportIds: string[] = [];
for (const record of records) {
  if (record.result && !(await verifyCurrentEvaluationExport(record.result)))
    invalidExportIds.push(record.id);
}
const verifiedExportCount = results.length - invalidExportIds.length;
const repeatRecords = determinismResultsPath
  ? (await readFile(resolve(determinismResultsPath), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as (typeof records)[number])
      .map((record) => ({
        ...record,
        result: record.result
          ? AnimationResultSchema.parse(record.result)
          : undefined,
      }))
  : null;
if (repeatRecords) validateEvaluationRecords(corpus, repeatRecords);
const summary = JSON.parse(
  await readFile(join(dirname(resultsPath), "batch-summary.json"), "utf8"),
) as {
  totalWallMs: number;
  itemCount: number;
  successful: number;
  reused: number;
  concurrency?: number;
  manifestSha256?: string;
  artifactSetSha256?: string;
};
if (
  summary.itemCount !== records.length ||
  summary.successful !== results.length
)
  throw new Error("Batch summary does not match its result records");
const artifactSetSha256 = hashBatchArtifacts(records);
if (
  summary.artifactSetSha256 &&
  summary.artifactSetSha256 !== artifactSetSha256
)
  throw new Error("Batch summary artifact identity does not match its results");
assertRatingsIdentity(
  ratings,
  { id: corpus.corpusId, sha256: corpusSha256 },
  artifactSetSha256,
);
const assembly =
  assemblyInput === null ? null : AssemblyEvidenceSchema.parse(assemblyInput);
if (assembly)
  await verifyAssemblyEvidence(
    assembly,
    { id: corpus.corpusId, sha256: corpusSha256, status: corpus.status },
    new Map(
      records.flatMap((record) =>
        record.result ? [[record.id, record.result.checksums.output]] : [],
      ),
    ),
  );
let runHistory: (typeof summary)[] = [];
try {
  runHistory = (
    await readFile(join(dirname(resultsPath), "batch-runs.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as typeof summary);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const benchmarkRun = selectBenchmarkRun(summary, runHistory);
const expectedCount = corpus.entries.length * 3;
const batchMeasured =
  records.length === expectedCount && summary.itemCount === expectedCount;
const independentRendersMatch = repeatRecords
  ? await compareIndependentRenders(records, repeatRecords)
  : false;
const validRate = verifiedExportCount / summary.itemCount;
const workerRates = results.map(
  (result) => result.durationMs / result.metrics.totalWallMs,
);
const medianRate = workerRates.length
  ? [...workerRates].sort((a, b) => a - b)[Math.floor(workerRates.length / 2)]!
  : null;
const versions = results[0]?.metrics.versions ?? null;
const scene = results[0]
  ? SceneManifestSchema.parse(
      JSON.parse(await readFile(results[0].sceneManifestPath, "utf8")),
    )
  : null;
const model = scene?.depth
  ? (
      JSON.parse(
        await readFile(
          join(dirname(scene.depth.asset), "manifest.json"),
          "utf8",
        ),
      ) as { model?: unknown }
    ).model
  : null;
const preparationBySource = new Map<string, number>();
for (const result of results) {
  if (preparationBySource.has(result.checksums.source)) continue;
  const itemScene = SceneManifestSchema.parse(
    JSON.parse(await readFile(result.sceneManifestPath, "utf8")),
  );
  if (!itemScene.depth) continue;
  const preparation = JSON.parse(
    await readFile(
      join(dirname(itemScene.depth.asset), "manifest.json"),
      "utf8",
    ),
  ) as { metrics?: { totalPreparationMs?: number } };
  const elapsed = preparation.metrics?.totalPreparationMs;
  if (typeof elapsed === "number" && Number.isFinite(elapsed))
    preparationBySource.set(result.checksums.source, elapsed);
}

const ratingSummary = summarizeEvaluationRatings(records, ratings);
const {
  rated,
  rendered,
  failed,
  allRenderedRated,
  accepted,
  severe,
  repaired,
} = ratingSummary;
const renderedMinutes =
  results.reduce((sum, result) => sum + result.durationMs, 0) / 60_000;
const aggregateRealtimeRate =
  !benchmarkRun || benchmarkRun.totalWallMs === 0
    ? null
    : (renderedMinutes * 60_000) / benchmarkRun.totalWallMs;
const selectedClipIds = new Set(
  assembly?.clipSelections?.flatMap((selection) => selection.clipIds) ?? [],
);
const selectedResults = records
  .filter((record) => selectedClipIds.has(record.id) && record.result)
  .map((record) => AnimationResultSchema.parse(record.result));
const selectedSourceHashes = new Set(
  selectedResults.map((result) => result.checksums.source),
);
const selectedPreparationMs = [...selectedSourceHashes].every((hash) =>
  preparationBySource.has(hash),
)
  ? [...selectedSourceHashes].reduce(
      (sum, hash) => sum + preparationBySource.get(hash)!,
      0,
    )
  : null;
const selectedRenderWallMs =
  selectedResults.length === selectedClipIds.size &&
  selectedClipIds.size > 0 &&
  benchmarkRun?.concurrency &&
  benchmarkRun.concurrency > 0
    ? selectedResults.reduce(
        (sum, result) => sum + result.metrics.totalWallMs,
        0,
      ) / benchmarkRun.concurrency
    : null;
const estimatedAssemblyWorkerMs =
  selectedRenderWallMs === null || selectedPreparationMs === null
    ? null
    : selectedRenderWallMs + selectedPreparationMs;
const finishedMinutes =
  assembly?.durationSeconds && assembly.durationSeconds > 0
    ? assembly.durationSeconds / 60
    : null;
const computeCost =
  computeUsdPerHour === null || estimatedAssemblyWorkerMs === null
    ? null
    : (estimatedAssemblyWorkerMs / 3_600_000) * computeUsdPerHour;
const computeCostPerMinute =
  computeCost === null || finishedMinutes === null
    ? null
    : computeCost / finishedMinutes;
const costReduction =
  computeCostPerMinute === null ||
  videoBaselineUsdPerMinute === null ||
  videoBaselineUsdPerMinute === 0
    ? null
    : 1 - computeCostPerMinute / videoBaselineUsdPerMinute;
const selectedCostBaseline = Boolean(
  computePriceEvidenceTarget &&
    videoBaselineName?.trim() &&
    videoBaselineEvidenceTarget,
);
const maximumWorkerUsdPerHourForCostGate =
  videoBaselineUsdPerMinute === null ||
  estimatedAssemblyWorkerMs === null ||
  estimatedAssemblyWorkerMs === 0 ||
  finishedMinutes === null
    ? null
    : (0.3 * videoBaselineUsdPerMinute * finishedMinutes * 3_600_000) /
      estimatedAssemblyWorkerMs;
const frozen = freezeBlockers.length === 0;
const gate = (measured: boolean, pass: boolean): string =>
  !measured
    ? "Pending"
    : !frozen
      ? pass
        ? "Candidate pass"
        : "Candidate fail"
      : pass
        ? "Pass"
        : "Fail";
type Gate = {
  name: string;
  result: string;
  status: string;
  evidence: GateEvidence[];
};
const guideEvidence: GateEvidence = {
  label: "evaluation procedure",
  target: evaluationGuidePath,
};
const resultsEvidence: GateEvidence = {
  label: "result records",
  target: resultsPath,
};
const summaryEvidence: GateEvidence = {
  label: "batch summary",
  target: join(dirname(resultsPath), "batch-summary.json"),
};
const benchmarkEvidence: GateEvidence = runHistory.length
  ? {
      label: "batch run history",
      target: join(dirname(resultsPath), "batch-runs.jsonl"),
    }
  : summaryEvidence;
const ratingsEvidence: GateEvidence[] = ratingsPath
  ? [{ label: "ratings export", target: resolve(ratingsPath) }]
  : [guideEvidence];
const gates: Gate[] = [
  {
    name: "Automatic usability",
    result: allRenderedRated
      ? `${accepted}/${expectedCount} (${percent(accepted / expectedCount)}); ${failed} failed clips counted as unusable`
      : `${rated}/${rendered} rendered clips rated${ratings && !ratings.reviewer?.trim() ? "; reviewer missing" : ""}`,
    status: gate(allRenderedRated, accepted / expectedCount >= 0.8),
    evidence: ratingsEvidence,
  },
  {
    name: "Severe artifacts",
    result: allRenderedRated
      ? rendered > 0
        ? `${severe}/${rendered} rendered clips (${percent(severe / rendered)}); ${failed} failed clips unassessable`
        : "No rendered clips to inspect"
      : "Human review pending",
    status: gate(allRenderedRated, rendered > 0 && severe / rendered < 0.05),
    evidence: ratingsEvidence,
  },
  {
    name: "Batch completion",
    result: `${verifiedExportCount}/${summary.itemCount} current exports verified (${percent(validRate)})`,
    status: gate(batchMeasured, validRate >= 0.98),
    evidence: [resultsEvidence, summaryEvidence],
  },
  {
    name: "Determinism",
    result: repeatRecords
      ? `${independentRendersMatch ? "Matching" : "Different"} independent renders; ${summary.reused}/${summary.itemCount} verified retry checkpoints`
      : `${summary.reused}/${summary.itemCount} verified retry checkpoints; independent rerender pending`,
    status: gate(Boolean(repeatRecords), independentRendersMatch),
    evidence: determinismResultsPath
      ? [
          resultsEvidence,
          {
            label: "independent results",
            target: resolve(determinismResultsPath),
          },
        ]
      : [resultsEvidence, guideEvidence],
  },
  {
    name: "Duration accuracy",
    result: `${verifiedExportCount}/${results.length} current exports pass checksum and exact-frame FFprobe checks`,
    status: gate(
      batchMeasured && results.length > 0,
      invalidExportIds.length === 0,
    ),
    evidence: [
      resultsEvidence,
      { label: "verification counts", target: `${outputPath}.json` },
    ],
  },
  {
    name: "Preview/export agreement",
    result: previewExportAccepted
      ? `Human visual review ${previewExportAccepted}; evidence ${previewExportEvidenceTarget ? "supplied" : "missing"}`
      : "Five golden scenes and 30 parity comparisons pass; human visual review pending",
    status: gate(
      Boolean(previewExportAccepted && previewExportEvidenceTarget),
      previewExportAccepted === "yes",
    ),
    evidence: previewExportEvidenceTarget
      ? [{ label: "visual review", target: previewExportEvidenceTarget }]
      : [{ label: "parity procedure", target: parityGuidePath }],
  },
  {
    name: "Export throughput",
    result:
      medianRate === null
        ? "No renders"
        : `${medianRate.toFixed(2)}× median per clip; ${aggregateRealtimeRate?.toFixed(2) ?? "?"}× aggregate`,
    status: gate(
      aggregateRealtimeRate !== null,
      (aggregateRealtimeRate ?? 0) >= 1,
    ),
    evidence: [resultsEvidence, benchmarkEvidence],
  },
  {
    name: "Cost reduction",
    result:
      costReduction === null
        ? computeUsdPerHour === null
          ? "Worker hourly price missing; video price is illustrative"
          : "Assembly or video baseline missing"
        : `${percent(costReduction)} reduction`,
    status:
      costReduction === null
        ? "Pending"
        : !selectedCostBaseline
          ? costReduction >= 0.7
            ? "Scenario pass"
            : "Scenario fail"
          : gate(true, costReduction >= 0.7),
    evidence: [
      resultsEvidence,
      benchmarkEvidence,
      ...(assemblyPath
        ? [{ label: "assembly evidence", target: resolve(assemblyPath) }]
        : [guideEvidence]),
      ...(computePriceEvidenceTarget
        ? [{ label: "worker price source", target: computePriceEvidenceTarget }]
        : []),
      ...(videoBaselineEvidenceTarget
        ? [{ label: "video price source", target: videoBaselineEvidenceTarget }]
        : []),
    ],
  },
  {
    name: "Editorial result",
    result: assembly
      ? `${assembly.durationSeconds?.toFixed(1) ?? "?"}s explainer assembled; human review ${editorialAccepted ?? "pending"}`
      : "Explainer assembly pending",
    status: gate(
      Boolean(assembly && editorialAccepted),
      editorialAccepted === "yes" &&
        (assembly?.durationSeconds ?? 0) >= 300 &&
        (assembly?.durationSeconds ?? Infinity) <= 600,
    ),
    evidence: assemblyPath
      ? [{ label: "assembly evidence", target: resolve(assemblyPath) }]
      : [guideEvidence],
  },
];
const decision = resolveDecision({
  outcome: decisionOutcome,
  reviewer: decisionReviewer,
  rationale: decisionRationale,
  gateStatuses: gates.map((item) => item.status),
  operatorMinutes,
});
const report = {
  corpus: {
    id: corpus.corpusId,
    sha256: corpusSha256,
    status: corpus.status,
    review: corpus.review.status,
    freezeBlockers: freezeBlockers.map((blocker) => blocker.code),
    entryCount: corpus.entries.length,
    expectedClipCount: expectedCount,
  },
  results: {
    rendered: results.length,
    verifiedExports: verifiedExportCount,
    invalidExportIds,
    validRate,
    reused: summary.reused,
    batchWallMs: benchmarkRun?.totalWallMs ?? null,
    retryWallMs: summary.totalWallMs,
    renderedMinutes,
    measuredColdPreparationMs: [...preparationBySource.values()].reduce(
      (sum, value) => sum + value,
      0,
    ),
    selectedClipCount: selectedResults.length,
    selectedSourceCount: selectedSourceHashes.size,
    selectedRenderWallMs,
    selectedPreparationMs,
    estimatedAssemblyWorkerMs,
    finishedMinutes,
    medianWorkerRealtimeRate: medianRate,
    aggregateRealtimeRate,
    rated,
    accepted,
    severe,
    manualRepairs: repaired,
    operatorMinutes,
    computeUsdPerHour,
    computePriceSource,
    computeCost,
    computeCostPerFinishedMinute: computeCostPerMinute,
    videoBaselineUsdPerMinute,
    videoBaselineName,
    videoBaselineSource,
    maximumWorkerUsdPerHourForCostGate,
    costReduction,
  },
  versions: { ...versions, model },
  assembly,
  previewExportReview: {
    accepted: previewExportAccepted ?? null,
    evidence: previewExportEvidence ?? null,
  },
  gates,
  decision: decision.label,
  decisionReview: {
    outcome: decision.outcome,
    reviewer: decision.reviewer,
    rationale: decision.rationale,
  },
};
const markdown = `# Still Shift v0.10 evaluation report

**Corpus:** ${corpus.corpusId} (${corpus.status}; review ${corpus.review.status}; ${corpus.entries.length} sources)

**Decision:** ${report.decision}
${decision.outcome ? `\n**Decision reviewer:** ${decision.reviewer}\n\n**Rationale:** ${decision.rationale}\n` : ""}

| Exit gate | Measured result | Status | Evidence |
| --- | --- | --- | --- |
${gates.map((item) => `| ${item.name} | ${item.result} | ${item.status} | ${formatGateEvidence(outputPath, item.evidence)} |`).join("\n")}

## Evidence and costs

- ${verifiedExportCount}/${expectedCount} preset clips have current MP4s that pass checksum and exact-frame FFprobe checks${invalidExportIds.length ? `; invalid export IDs: ${invalidExportIds.join(", ")}` : ""}; full render wall time ${benchmarkRun ? `${(benchmarkRun.totalWallMs / 1000).toFixed(1)} seconds` : "unavailable for this exact manifest and artifact set"}.
- ${summary.reused}/${summary.itemCount} results were reused on the last retry.
- ${rated}/${rendered} rendered clips have complete human ratings; ${failed} clips failed before review and count as unusable; ${repaired} rated clips required manual repair.
- Archived cold preparation time across ${preparationBySource.size} unique sources: ${([...preparationBySource.values()].reduce((sum, value) => sum + value, 0) / 1000).toFixed(1)} seconds. The benchmark render used cached depth.
- Assembled-video cost estimate uses ${selectedResults.length} selected clips, ${selectedSourceHashes.size} prepared sources, ${selectedRenderWallMs === null ? "unknown" : `${(selectedRenderWallMs / 1000).toFixed(1)} seconds`} of concurrency-adjusted rendering, and ${selectedPreparationMs === null ? "unknown" : `${(selectedPreparationMs / 1000).toFixed(1)} seconds`} of archived preparation time.
- Operator editing time: ${operatorMinutes === null ? "not recorded" : `${operatorMinutes} minutes`}.
- Compute estimate: ${computeCost === null ? "pending hourly worker price or assembly measurement" : `$${computeCost.toFixed(3)} total; $${computeCostPerMinute!.toFixed(3)} per finished assembled minute${computePriceSource ? ` ([worker price source](${computePriceSource}))` : " (hypothetical worker price)"}`}.
- Generative-video baseline: ${videoBaselineUsdPerMinute === null ? "not selected" : `${videoBaselineName ?? "unnamed"}, $${videoBaselineUsdPerMinute.toFixed(3)} per minute${videoBaselineSource ? ` ([price source](${videoBaselineSource}))` : ""}`}.
- At this measured throughput, the compute worker would need to cost no more than ${maximumWorkerUsdPerHourForCostGate === null ? "an unknown rate" : `$${maximumWorkerUsdPerHourForCostGate.toFixed(2)}/hour`} for a 70% reduction in render costs before storage, image creation, retries, and operator labor.
- Assembly: ${assembly?.outputPath ?? "pending"}.

## Exact versions

\`\`\`json
${JSON.stringify(report.versions, null, 2)}
\`\`\`

The current corpus is ${frozen ? "approved and frozen" : "not approved and frozen"}. Automated metrics do not substitute for human artifact and editorial review.
`;
await writeFile(outputPath, markdown);
await writeFile(`${outputPath}.json`, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ outputPath, decision: report.decision, rendered: results.length, expectedCount })}\n`,
);
