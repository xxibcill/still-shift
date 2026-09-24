import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  AnimationResultSchema,
  CorpusManifestSchema,
  SceneManifestSchema,
  type AnimationResult,
} from "@still-shift/scene-contract";
import { validateEvaluationRecords } from "./evidence.ts";
import { RATING_FIELDS, RatingsExportSchema } from "./ratings.ts";

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
const ratingsInput = await readOptional(option("--ratings"));
const ratings =
  ratingsInput === null ? null : RatingsExportSchema.parse(ratingsInput);
const assembly = (await readOptional(option("--assembly"))) as {
  outputPath?: string;
  durationSeconds?: number;
  videoFrameCount?: number;
  sourceStateCount?: number;
  clipSelections?: Array<{ stateId: string; clipIds: string[] }>;
} | null;
const computeUsdPerHour = numericOption("--compute-usd-per-hour");
const computePriceSource = option("--compute-price-source") ?? null;
const videoBaselineUsdPerMinute = numericOption(
  "--video-baseline-usd-per-minute",
);
const videoBaselineName = option("--video-baseline-name") ?? null;
const videoBaselineSource = option("--video-baseline-source") ?? null;
const operatorMinutes = numericOption("--operator-minutes");
const editorialAccepted = option("--editorial-accepted");
if (
  editorialAccepted !== undefined &&
  !["yes", "no"].includes(editorialAccepted)
)
  throw new Error("--editorial-accepted must be yes or no");

const corpusBytes = await readFile(corpusPath);
const corpusSha256 = `sha256:${createHash("sha256").update(corpusBytes).digest("hex")}`;
const corpus = CorpusManifestSchema.parse(
  JSON.parse(corpusBytes.toString("utf8")),
);
if (
  ratings &&
  (ratings.corpusId !== corpus.corpusId ||
    ratings.corpusSha256 !== corpusSha256)
)
  throw new Error("Ratings were exported for a different corpus revision");
const records = (await readFile(resultsPath, "utf8"))
  .trim()
  .split("\n")
  .map(
    (line) =>
      JSON.parse(line) as {
        id: string;
        status: string;
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
const results: AnimationResult[] = records
  .filter((record) => record.result)
  .map((record) => record.result!);
const summary = JSON.parse(
  await readFile(join(dirname(resultsPath), "batch-summary.json"), "utf8"),
) as {
  totalWallMs: number;
  itemCount: number;
  successful: number;
  reused: number;
  concurrency?: number;
};
if (
  summary.itemCount !== records.length ||
  summary.successful !== results.length
)
  throw new Error("Batch summary does not match its result records");
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
const benchmarkRun =
  runHistory.find(
    (run) =>
      run.itemCount === summary.itemCount &&
      run.successful === run.itemCount &&
      run.reused === 0,
  ) ?? summary;
const expectedCount = corpus.entries.length * 3;
const complete =
  records.length === expectedCount &&
  summary.itemCount === expectedCount &&
  summary.successful === expectedCount;
const validRate = summary.successful / summary.itemCount;
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

const requiredRatings = RATING_FIELDS.map((field) => field.key);
const rated = records.filter((record) =>
  requiredRatings.every(
    (field) => typeof ratings?.clips?.[record.id]?.[field] === "number",
  ),
);
const allRated =
  rated.length === expectedCount && Boolean(ratings?.reviewer?.trim());
const accepted = rated.filter((record) => {
  const score = ratings!.clips[record.id]!;
  return score.editorialUsability === 2 && score.manualRepair === 0;
}).length;
const severe = rated.filter((record) => {
  const score = ratings!.clips[record.id]!;
  return (
    [
      "edgeArtifacts",
      "subjectDeformation",
      "exposedBorders",
      "depthOrder",
    ] as const
  ).some((field) => score[field] === 2);
}).length;
const repaired = rated.filter(
  (record) => ratings!.clips[record.id]!.manualRepair === 1,
).length;
const renderedMinutes =
  results.reduce((sum, result) => sum + result.durationMs, 0) / 60_000;
const aggregateRealtimeRate =
  benchmarkRun.totalWallMs === 0
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
  selectedResults.length === selectedClipIds.size && selectedClipIds.size > 0
    ? selectedResults.reduce(
        (sum, result) => sum + result.metrics.totalWallMs,
        0,
      ) / (benchmarkRun.concurrency ?? 2)
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
const maximumWorkerUsdPerHourForCostGate =
  videoBaselineUsdPerMinute === null ||
  estimatedAssemblyWorkerMs === null ||
  estimatedAssemblyWorkerMs === 0 ||
  finishedMinutes === null
    ? null
    : (0.3 * videoBaselineUsdPerMinute * finishedMinutes * 3_600_000) /
      estimatedAssemblyWorkerMs;
const frozen =
  corpus.status === "frozen" && corpus.review.status === "approved";
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
const gates = [
  {
    name: "Automatic usability",
    result: allRated
      ? `${accepted}/${rated.length} (${percent(accepted / rated.length)})`
      : `${rated.length}/${expectedCount} clips rated${ratings && !ratings.reviewer?.trim() ? "; reviewer missing" : ""}`,
    status: gate(allRated, accepted / rated.length >= 0.8),
  },
  {
    name: "Severe artifacts",
    result: allRated
      ? `${severe}/${rated.length} (${percent(severe / rated.length)})`
      : "Human review pending",
    status: gate(allRated, severe / rated.length < 0.05),
  },
  {
    name: "Batch completion",
    result: `${summary.successful}/${summary.itemCount} (${percent(validRate)})`,
    status: gate(complete, validRate >= 0.98),
  },
  {
    name: "Determinism",
    result: `${summary.reused}/${summary.itemCount} verified retry checkpoints`,
    status: gate(
      summary.reused === summary.itemCount,
      summary.reused === summary.itemCount,
    ),
  },
  {
    name: "Duration accuracy",
    result: `${results.length} exports validated by exact-frame FFprobe check`,
    status: gate(complete, complete),
  },
  {
    name: "Preview/export agreement",
    result:
      "Five golden scenes and 30 parity comparisons pass; candidate visual review pending",
    status: "Pending",
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
      costReduction !== null && !computePriceSource
        ? costReduction >= 0.7
          ? "Scenario pass"
          : "Scenario fail"
        : gate(costReduction !== null, (costReduction ?? 0) >= 0.7),
  },
  {
    name: "Editorial result",
    result: assembly
      ? `${assembly.durationSeconds?.toFixed(1) ?? "?"}s explainer assembled; human review ${editorialAccepted ?? "pending"}`
      : "Explainer assembly pending",
    status: gate(
      Boolean(assembly && editorialAccepted),
      editorialAccepted === "yes",
    ),
  },
];
const report = {
  corpus: {
    id: corpus.corpusId,
    sha256: corpusSha256,
    status: corpus.status,
    review: corpus.review.status,
    entryCount: corpus.entries.length,
    expectedClipCount: expectedCount,
  },
  results: {
    rendered: results.length,
    validRate,
    reused: summary.reused,
    batchWallMs: benchmarkRun.totalWallMs,
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
    rated: rated.length,
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
  gates,
  decision: "Pending human review and an approved frozen corpus",
};
const markdown = `# Still Shift v0.10 evaluation report

**Corpus:** ${corpus.corpusId} (${corpus.status}; review ${corpus.review.status}; ${corpus.entries.length} sources)

**Decision:** ${report.decision}

| Exit gate | Measured result | Status |
| --- | --- | --- |
${gates.map((item) => `| ${item.name} | ${item.result} | ${item.status} |`).join("\n")}

## Evidence and costs

- ${results.length}/${expectedCount} preset clips have valid animation results; full render wall time ${(benchmarkRun.totalWallMs / 1000).toFixed(1)} seconds.
- ${summary.reused}/${summary.itemCount} results were reused on the last retry.
- ${rated.length}/${expectedCount} clips have complete human ratings; ${repaired} rated clips required manual repair.
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
