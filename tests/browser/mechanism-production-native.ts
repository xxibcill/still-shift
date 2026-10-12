import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createMechanismProductionNativeExecutor,
  runMechanismProductionQueue,
  inspectMechanismProductionNativeItem,
  patchMechanismCueAuthoring,
  readMechanismCueAuthoring,
  readMechanismFamilyAuthoring,
  inspectMechanismProductionDisposition,
  type MechanismProductionQueueProduct,
} from "@still-shift/animation-engine";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";

const directory = await mkdtemp(
  "/private/tmp/still-shift-ms3-production-native-",
);
const progressPath = join(directory, "progress.json");
const stages: unknown[] = [];
const record = async (value: unknown) => {
  stages.push(value);
  await writeFile(
    progressPath,
    JSON.stringify({ status: "running", stages }, null, 2) + "\n",
  );
};
console.log(JSON.stringify({ status: "running", directory }));
const parent = new CompositionNodeMemory(),
  foreign = parent.reserve(1024);
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
    projects.push({
      id: "S" + (i + 1),
      question: questions[i]!,
      familyPath: fixture.familyPath,
      cuePath: fixture.cuePath,
    });
  }
  const executor = await createMechanismProductionNativeExecutor();
  const manifest = await executor.createQueue(
    "engineering-native",
    projects,
    directory,
  );
  assert(manifest.items.every((i) => i.inputs.length === 6));
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
    { nodeMemory: parent },
  );
  await record({ name: "cold", state: first });
  assert.deepEqual(
    first.rows.map((r) => r.status),
    ["passed", "passed", "passed"],
  );
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
    assert.equal(
      product.report.qa.filter((q) => q.status === "unreviewed").length,
      5,
    );
    products.push(product);
  }
  const repeated = await runMechanismProductionQueue(
    manifestPath,
    output,
    observed,
    { nodeMemory: parent },
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
    { nodeMemory: parent },
  );
  await record({ name: "caption-only-revision", state: edited });
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
        outputs: 4,
        decodedFrames: 240,
        source: "synthetic-engineering-PCM",
        qualification:
          "Real shared native/cached pipeline and full decode/zero-new-caption-native work; no genuine narration/factual/visual/listening/pilot/human acceptance.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ status: "passed", directory, executions, outputs: 4 }),
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
  parent.dispose();
}
