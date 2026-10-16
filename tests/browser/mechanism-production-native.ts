import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createMechanismProductionNativeExecutor,
  readMechanismProductionReports,
  MechanismProductionReportBundleSchema,
  MechanismProductionEvidenceSchema,
  MechanismProductionHandoffSchema,
  MechanismProductionQAFactsSchema,
  runMechanismProductionQueue,
  inspectMechanismProductionNativeItem,
  patchMechanismCueAuthoring,
  readMechanismCueAuthoring,
  readMechanismFamilyAuthoring,
  inspectMechanismProductionDisposition,
  type MechanismProductionQueueProduct,
} from "@still-shift/animation-engine";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
import {
  CompositionNodeMemory,
  isCompositionNodeCapacityError,
} from "@still-shift/execution-runtime/export";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";

const directory = await mkdtemp(
  "/private/tmp/still-shift-ms3-production-native-",
);
const progressPath = join(directory, "progress.json");
const stages: unknown[] = [];
const record = async (value: {
  name: string;
  state?: unknown;
  [key: string]: unknown;
}) => {
  const { state, ...compact } = value;
  if (state !== undefined) {
    const path = join(directory, `stage-${stages.length}-${value.name}.json`),
      body = JSON.stringify(state, null, 2) + "\n";
    await writeFile(path, body);
    compact.stateFile = {
      path,
      bytes: Buffer.byteLength(body),
      sha256: "sha256:" + createHash("sha256").update(body).digest("hex"),
    };
  }
  stages.push(compact);
  await writeFile(
    progressPath,
    JSON.stringify({ status: "running", stages }, null, 2) + "\n",
  );
};
console.log(JSON.stringify({ status: "running", directory }));
const parent = new CompositionNodeMemory(),
  foreign = parent.reserve(1024);
const resultOwners: CompositionNodeMemory[] = [];
const resultOwner = () => {
  const owner = new CompositionNodeMemory(parent);
  resultOwners.push(owner);
  return owner;
};
try {
  const projects = [];
  const questions = [
    "How does this floating hook establish the measurement zero?",
    "Why does this declared one-way tie resist reverse strap travel?",
    "How do the opposing peg arms pivot around their spring?",
  ];
  for (const [i, family] of (
    ["tape-hook", "cable-tie", "clothespeg"] as const
  ).entries()) {
    const fixture = await createCueProjectFixture(
      join(directory, "inputs", family),
      family,
    );
    const actualFamily = await readMechanismFamilyAuthoring(fixture.familyPath);
    assert.equal(actualFamily.document.family, family);
    const qaPath =
      i === 1 ? join(directory, "inputs", family, "qa.json") : undefined;
    if (qaPath)
      await writeFile(
        qaPath,
        JSON.stringify(
          {
            schemaVersion: "mechanism-production-qa-plan-1",
            measurements: [
              {
                measurement: "strap.travel",
                kind: "part-origin-distance",
                part: "strap",
              },
            ],
            registrations: [
              {
                schemaVersion: "mechanism-semantic-registration-1",
                id: "seeded-strap-limit",
                description:
                  "Deliberately too-small travel range to prove operational failure/recovery",
                domain: "mechanical",
                method: "sampled-numeric-range",
                requireEveryOutputFrame: true,
                rules: [
                  {
                    measurement: "strap.travel",
                    range: [0, 0.001],
                    unit: "scene-unit",
                    rig: "ratchet",
                    parts: ["strap"],
                    relationship: null,
                  },
                ],
              },
            ],
            warningBindings: [],
          },
          null,
          2,
        ) + "\n",
      );
    projects.push({
      id: "S" + (i + 1),
      question: questions[i]!,
      familyPath: fixture.familyPath,
      cuePath: fixture.cuePath,
      ...(qaPath ? { qaPath } : {}),
    });
  }
  const executor = await createMechanismProductionNativeExecutor();
  const manifest = await executor.createQueue(
    "engineering-native",
    projects,
    directory,
  );
  assert.deepEqual(
    manifest.items.map((i) => i.inputs.length),
    [6, 7, 6],
  );
  assert.deepEqual(
    manifest.items.map((i) => i.family),
    ["tape-hook", "cable-tie", "clothespeg"],
  );
  const sourceHashes = manifest.items.map(
    (i) => i.inputs.find((p) => p.path.endsWith("/scene.json"))!.sha256,
  );
  assert.equal(new Set(sourceHashes).size, 3);
  const manifestPath = join(directory, "queue.json"),
    output = join(directory, "output");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  let executions = 0;
  const observed = {
    ...executor,
    execute: async (...args: Parameters<typeof executor.execute>) => {
      executions++;
      return executor.execute(...args);
    },
  };
  const first = await runMechanismProductionQueue(
    manifestPath,
    output,
    observed,
    { nodeMemory: resultOwner() },
  );
  await record({ name: "cold", state: first });
  assert.deepEqual(
    first.rows.map((r) => r.status),
    ["passed", "passed", "passed"],
  );
  const initialS2RequestHash = first.rows[1]!.requestHash,
    initialS2ProductPath = first.rows[1]!.product!.path;
  assert.equal(parent.statistics.current.metadata, 64 * 1024 * 1024 + 1024);
  assert(foreign.active);
  const products: MechanismProductionQueueProduct[] = [];
  for (const row of first.rows) {
    const product = JSON.parse(
      await readFile(join(output, row.product!.path), "utf8"),
    ) as MechanismProductionQueueProduct;
    assert.equal(product.work.reusedNativePlates, false);
    assert.equal(product.work.freshNativeSubmissions, 60);
    assert.equal(
      inspectMechanismProductionDisposition(product.report).reviewedReady,
      false,
    );
    const qualityFile = product.artifacts.find((f) =>
      f.path.endsWith("/qa-facts.json"),
    )!;
    const quality = MechanismProductionQAFactsSchema.parse(
      JSON.parse(await readFile(join(output, qualityFile.path), "utf8")),
    );
    assert.equal(quality.timeline.checkedOutputFrames, 60);
    assert.equal(quality.timeline.checkedEventFrames, 4);
    assert.equal(quality.semantics.rawSamples.length, 60);
    assert(
      quality.semantics.assertions.find(
        (a) => a.id === "production.stationary-mount",
      )?.status === "passed",
    );
    assert.equal(
      product.report.unresolvedMechanicalFailures,
      quality.failures.mechanical,
    );
    assert.equal(
      product.report.qa.find((q) => q.dimension === "mechanical")!.status,
      row.id === "S2" ? "failed" : "unreviewed",
    );
    assert.equal(
      product.report.qa.find((q) => q.dimension === "sampled-visual")!.status,
      quality.failures.sampledVisual ? "failed" : "unreviewed",
    );
    assert(
      quality.warnings.rendered,
      "Current production QA retains rendered visual evidence",
    );
    const renderedVisual = JSON.parse(
      await readFile(join(output, quality.warnings.rendered.path), "utf8"),
    );
    assert.equal(renderedVisual.nativeSubmissionCalls, 0);
    assert.equal(renderedVisual.frameCount, product.report.clock.outputFrames);
    assert.equal(renderedVisual.quality.measured.pixels, true);
    assert.equal(renderedVisual.quality.measured.textBounds, true);
    assert(renderedVisual.quality.textBounds);
    assert.equal(quality.collision.analytic, "not-evaluated");
    assert.equal(quality.collision.continuous, "unreviewed");
    assert(
      product.report.qa
        .filter((q) =>
          ["continuous-motion", "listening", "factual"].includes(q.dimension),
        )
        .every((q) => q.status === "unreviewed"),
    );
    products.push(product);
  }
  const seededProduct = products[1]!;
  const seededFactsFile = seededProduct.artifacts.find((f) =>
    f.path.endsWith("/qa-facts.json"),
  )!;
  const seededFactsPath = join(output, seededFactsFile.path),
    seededFactsBytes = await readFile(seededFactsPath);
  const forged = JSON.parse(seededFactsBytes.toString("utf8"));
  forged.semantics.rawSamples[1].measurements["strap.travel"] = 42;
  const forgedBytes = Buffer.from(JSON.stringify(forged, null, 2) + "\n");
  await writeFile(seededFactsPath, forgedBytes);
  try {
    const product = structuredClone(seededProduct),
      descriptor = product.artifacts.find(
        (f) => f.path === seededFactsFile.path,
      )!;
    descriptor.bytes = forgedBytes.length;
    descriptor.sha256 =
      "sha256:" + createHash("sha256").update(forgedBytes).digest("hex");
    await assert.rejects(
      executor.verify(manifest.items[1]!, product, {
        manifestDirectory: directory,
        manifestPath,
        outputRoot: output,
        attemptDirectory: join(output, "items", "S2", "1"),
        requestHash: initialS2RequestHash,
        nodeMemory: parent,
        progress: async () => {},
      }),
      /QA data differs/,
    );
  } finally {
    await writeFile(seededFactsPath, seededFactsBytes);
  }
  await record({
    name: "recomputed-qa-facts-negative",
    outcome: "rejected",
    restoredOriginalBytes: true,
  });
  const repeated = await runMechanismProductionQueue(
    manifestPath,
    output,
    observed,
    { nodeMemory: resultOwner() },
  );
  await record({ name: "completed-product-reuse", state: repeated });
  assert.equal(executions, 3);
  assert.equal(parent.statistics.current.metadata, 128 * 1024 * 1024 + 1024);
  const baseHash = first.manifestHash;
  const family = await readMechanismFamilyAuthoring(projects[0]!.familyPath);
  const cue = await readMechanismCueAuthoring(
    family.instance,
    projects[0]!.cuePath,
  );
  const caption = cue.document.cues[0]!.text;
  await patchMechanismCueAuthoring(family.instance, projects[0]!.cuePath, {
    schemaVersion: "mechanism-cue-patch-1",
    baseRevision: cue.document.revision,
    baseHash: cue.projectHash,
    operations: [
      {
        cue: cue.document.cues[0]!.id,
        property: "caption",
        value: "X" + caption.slice(1),
      },
    ],
  });
  manifest.revision = 1;
  manifest.baseHash = baseHash;
  manifest.items[0] = await inspectMechanismProductionNativeItem(
    projects[0]!,
    directory,
  );
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const edited = await runMechanismProductionQueue(
    manifestPath,
    output,
    observed,
    { nodeMemory: resultOwner() },
  );
  await record({ name: "caption-only-revision", state: edited });
  const beforeQAHash = edited.manifestHash;
  assert.equal(executions, 4);
  assert(edited.rows.every((r) => r.status === "passed"));
  const changed = JSON.parse(
    await readFile(join(output, edited.rows[0]!.product!.path), "utf8"),
  ) as MechanismProductionQueueProduct;
  assert.equal(changed.work.reusedNativePlates, true);
  assert.equal(changed.work.freshNativeSubmissions, 0);
  assert.notEqual(
    changed.report.binding.outputSha256,
    products[0]!.report.binding.outputSha256,
  );
  const beforePath = products[0]!.artifacts.find((f) =>
    f.path.endsWith("/decoded-output.json"),
  )!.path;
  const afterPath = changed.artifacts.find((f) =>
    f.path.endsWith("/decoded-output.json"),
  )!.path;
  const before = JSON.parse(await readFile(join(output, beforePath), "utf8")),
    after = JSON.parse(await readFile(join(output, afterPath), "utf8"));
  assert.deepEqual(before.audio, after.audio);
  assert.notDeepEqual(before.video, after.video);
  assert.equal(parent.statistics.current.metadata, 192 * 1024 * 1024 + 1024);
  assert(foreign.active);
  const bundle = await readMechanismProductionReports(
    manifestPath,
    output,
    executor,
    { nodeMemory: resultOwner() },
  );
  assert.equal(
    bundle.episodes.filter((e) => e.validation.status === "verified").length,
    3,
  );
  assert.equal(bundle.cohort.reviewedReady, 0);
  assert.equal(bundle.cohort.reviewCounts.technical.passed, 3);
  assert.equal(bundle.cohort.reviewCounts.listening.unreviewed, 3);
  assert.equal(bundle.cohort.authoring.savings, null);
  assert.equal(parent.statistics.current.metadata, 256 * 1024 * 1024 + 1024);
  const completePath = join(directory, "production-report.json");
  const reportCommand = await runProcess(
    process.execPath,
    [
      "--import",
      "tsx",
      join(process.cwd(), "tools/still-shift-cli/src/cli.ts"),
      "production",
      "report",
      "--manifest",
      manifestPath,
      "--output-dir",
      output,
      "--report",
      completePath,
      "--limit",
      "4",
    ],
    { maxBuffer: 65536 },
  );
  const receipt = MechanismCommandReceiptSchema.parse(
    JSON.parse(reportCommand.stdout),
  );
  assert.equal(receipt.summary.selected, 3);
  assert.equal(receipt.items.length, 4);
  assert.equal(receipt.truncated, true);
  assert.equal(receipt.artifacts.length, 1);
  const complete = MechanismProductionReportBundleSchema.parse(
    JSON.parse(await readFile(completePath, "utf8")),
  );
  assert.equal(complete.episodes.length, 3);
  // An unclassified caption revision preserves an unverified first-pass result.
  assert.deepEqual(complete.cohort.firstPassTechnical, {
    completed: 3,
    passed: 2,
    rate: null,
    unverified: 1,
    targetSatisfied: null,
  });
  assert.equal(
    complete.cohort.rows.find((row) => row.id === "S1")?.firstPass,
    "unverified",
  );
  assert.equal(complete.cohort.durations.routineSeconds.available, 3);
  assert.equal(complete.cohort.authoring.savings, null);
  assert.equal(executions, 4);
  await record({
    name: "production-report-api-and-actual-cli",
    completePath,
    cohort: complete.cohort,
    receipt,
  });
  const handoffPath = join(directory, "fresh-session-handoff.json");
  const freshHandoff = await runProcess(
    process.execPath,
    [
      "--import",
      "tsx",
      join(process.cwd(), "tools/still-shift-cli/src/cli.ts"),
      "production",
      "handoff",
      "--manifest",
      manifestPath,
      "--output-dir",
      output,
      "--episode",
      "S1",
      "--report",
      handoffPath,
    ],
    { maxBuffer: 65536 },
  );
  const handoffReceipt = MechanismCommandReceiptSchema.parse(
    JSON.parse(freshHandoff.stdout),
  );
  assert.equal(handoffReceipt.summary.sourceStatus, "current-verified");
  const handoff = MechanismProductionHandoffSchema.parse(
    JSON.parse(await readFile(handoffPath, "utf8")),
  );
  assert.equal(handoff.sourceStatus, "current-verified");
  assert.equal(handoff.reviewedReady, false);
  assert.equal(handoff.qa.listening, "unreviewed");
  assert(handoff.assets.qualityReport);
  assert.equal(
    handoff.assets.qualityReport.sha256,
    bundle.episodes[0]!.qualityEvidence!.sha256,
  );
  assert.equal(
    handoff.binding.outputSha256,
    changed.report.binding.outputSha256,
  );
  const generatedEvidence: unknown[] = [];
  for (const row of edited.rows) {
    const product = JSON.parse(
      await readFile(join(output, row.product!.path), "utf8"),
    ) as MechanismProductionQueueProduct;
    const reference = product.artifacts.find((f) =>
      f.path.endsWith("/review/evidence.json"),
    )!;
    const evidence = MechanismProductionEvidenceSchema.parse(
      JSON.parse(await readFile(join(output, reference.path), "utf8")),
    );
    assert(evidence.images.some((image) => image.kind === "phone"));
    assert(evidence.images.some((image) => image.kind === "caption-crop"));
    assert.equal(
      evidence.audio.decodedSha256,
      (
        JSON.parse(
          await readFile(
            join(
              output,
              product.artifacts.find((f) =>
                f.path.endsWith("/decoded-output.json"),
              )!.path,
            ),
            "utf8",
          ),
        ) as { audio: { sha256: string } }
      ).audio.sha256,
    );
    generatedEvidence.push({
      id: row.id,
      path: reference.path,
      images: evidence.images.length,
      samples: evidence.plan.samples.length,
      cropExceptions: evidence.exceptions.length,
    });
  }
  await record({
    name: "review-images-audio-and-fresh-session-handoff",
    handoffPath,
    handoffReceipt,
    evidence: generatedEvidence,
  });
  // Full prior states have been persisted and consumed. Retire their result owners,
  // preserving the foreign lease and the one shared 512 MiB allowance.
  for (const owner of resultOwners) owner.dispose();
  resultOwners.length = 0;
  assert.equal(parent.statistics.current.metadata, 1024);
  assert(foreign.active);
  const beforePressure = JSON.parse(
    await readFile(join(output, "queue-state.json"), "utf8"),
  );
  const pressure = parent.reserve(parent.availableBytes - 96 * 1024 * 1024);
  try {
    await assert.rejects(
      runMechanismProductionQueue(manifestPath, output, observed, {
        nodeMemory: parent,
      }),
      isCompositionNodeCapacityError,
    );
    const afterPressure = JSON.parse(
      await readFile(join(output, "queue-state.json"), "utf8"),
    );
    assert.deepEqual(afterPressure.rows, beforePressure.rows);
    assert.equal(executions, 4);
  } finally {
    pressure.release();
  }
  assert.equal(parent.statistics.current.metadata, 1024);
  await record({
    name: "quota-rejection-preserves-sealed-products",
    executions,
    unchangedRows: true,
  });
  const qaPath = projects[1]!.qaPath!;
  const beforeQA = JSON.parse(await readFile(qaPath, "utf8"));
  beforeQA.registrations[0].rules[0].range = [0, 1];
  await writeFile(qaPath, JSON.stringify(beforeQA, null, 2) + "\n");
  await assert.rejects(
    executor.verify(manifest.items[1]!, seededProduct, {
      manifestDirectory: directory,
      manifestPath,
      outputRoot: output,
      attemptDirectory: join(output, "items", "S2", "1"),
      requestHash: initialS2RequestHash,
      nodeMemory: parent,
      progress: async () => {},
    }),
    /dependency snapshot changed/,
  );
  manifest.revision = 2;
  manifest.baseHash = beforeQAHash;
  manifest.items[1] = await inspectMechanismProductionNativeItem(
    projects[1]!,
    directory,
  );
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const qaRepaired = await runMechanismProductionQueue(
    manifestPath,
    output,
    observed,
    { nodeMemory: resultOwner() },
  );
  assert.equal(executions, 5);
  assert(qaRepaired.rows.every((r) => r.status === "passed"));
  const repairedProduct = JSON.parse(
    await readFile(join(output, qaRepaired.rows[1]!.product!.path), "utf8"),
  ) as MechanismProductionQueueProduct;
  assert.equal(repairedProduct.work.freshNativeSubmissions, 0);
  assert.equal(repairedProduct.work.reusedNativePlates, true);
  assert.equal(
    repairedProduct.report.binding.outputSha256,
    seededProduct.report.binding.outputSha256,
  );
  assert.notEqual(
    repairedProduct.report.binding.inputSha256,
    seededProduct.report.binding.inputSha256,
  );
  const originalProgram = JSON.parse(
    await readFile(
      join(
        output,
        seededProduct.artifacts.find((f) =>
          f.path.endsWith("/qa-program.json"),
        )!.path,
      ),
      "utf8",
    ),
  );
  const repairedProgram = JSON.parse(
    await readFile(
      join(
        output,
        repairedProduct.artifacts.find((f) =>
          f.path.endsWith("/qa-program.json"),
        )!.path,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(
    originalProgram.registrations.find(
      (r: { id: string }) => r.id === "seeded-strap-limit",
    ).rules[0].range,
    [0, 0.001],
  );
  assert.deepEqual(
    repairedProgram.registrations.find(
      (r: { id: string }) => r.id === "seeded-strap-limit",
    ).rules[0].range,
    [0, 1],
  );
  assert.equal(repairedProduct.report.unresolvedMechanicalFailures, 0);
  assert.equal(
    repairedProduct.report.qa.find((q) => q.dimension === "mechanical")!.status,
    "unreviewed",
  );
  assert(
    qaRepaired.rows[1]!.priorProducts.some(
      (f) => f.path === initialS2ProductPath,
    ),
  );
  const repairedBundle = await readMechanismProductionReports(
    manifestPath,
    output,
    executor,
    { nodeMemory: resultOwner() },
  );
  assert(
    repairedBundle.episodes.every(
      (e) => e.validation.status === "verified" && e.qualityEvidence,
    ),
  );
  assert.equal(repairedBundle.cohort.reviewCounts.mechanical.failed, 0);
  assert.equal(repairedBundle.cohort.reviewedReady, 0);
  await record({
    name: "qa-only-revision-and-stale-plan-rejection",
    state: qaRepaired,
    repairedQualityEvidence: repairedBundle.episodes[1]!.qualityEvidence,
    freshNativeSubmissions: 0,
    preservedEncodedOutput: true,
  });
  assert(foreign.active);
  parent.dispose();
  assert.equal(parent.statistics.reservations, 0);
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        directory,
        stages,
        executions,
        outputs: 5,
        decodedFrames: 300,
        source: "synthetic-engineering-PCM",
        qualification:
          "Real shared native/cached pipeline and full decode/zero-new-caption-native work; no genuine narration/factual/visual/listening/pilot/human acceptance.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ status: "passed", directory, executions, outputs: 5 }),
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        status: "failed",
        error: String(error),
        stack: error instanceof Error ? error.stack : null,
        stages,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  for (const owner of resultOwners) owner.dispose();
  parent.dispose();
}
