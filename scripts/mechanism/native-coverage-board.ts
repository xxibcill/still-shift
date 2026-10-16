import assert from "node:assert/strict";
import { lstat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  BlenderEpisodeSourceSchema,
  BlenderEpisodePlanSchema,
  BlenderProductionQueueSchema,
  MechanismProductionReportBundleSchema,
  createBlenderProductionExecutor,
  readMechanismProductionReports,
  MECHANISM_QA_DIMENSIONS,
} from "@still-shift/animation-engine";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import {
  readProductionJSON,
  writeProductionJSON,
} from "../../packages/animation-engine/src/mechanism/production-queue-files.ts";
import { productionQueueItemRequest } from "../../packages/animation-engine/src/mechanism/production-queue-validation.ts";
import { cuePlateFile } from "../../packages/animation-engine/src/mechanism/cue-plate-files.ts";

const text = z.string().trim().min(1).max(2048);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const file = z
  .object({
    path: text,
    bytes: z
      .number()
      .int()
      .positive()
      .max(4 * 1024 * 1024),
    sha256: hash,
  })
  .strict();
const selection = z
  .object({ id, selectedEpisodeIds: z.array(id).min(1).max(300), sha256: hash })
  .strict();
const route = z.enum([
  "existing-pack-rig",
  "new-asset-existing-rig",
  "new-behavior",
]);
export const NativeCoverageBoardSchema = z
  .object({
    schemaVersion: z.literal("mechanism-native-coverage-board-2"),
    revision: z.number().int().positive().max(1000),
    selectionFile: file,
    selection,
    registry: z
      .array(
        z
          .object({
            id,
            family: BlenderEpisodeSourceSchema.shape.family,
            designVariant: text,
            selectedAssetSha256: hash,
            currentAssetSha256: hash,
            controllerSha256: hash,
          })
          .strict(),
      )
      .min(1)
      .max(300),
    episodes: z
      .array(
        z
          .object({
            id,
            registryId: id,
            route,
            assetWork: z.array(text).max(16),
            rigWork: z.array(text).max(16),
            newRigType: id.nullable(),
            workEvidence: z.array(file).max(16),
          })
          .strict(),
      )
      .min(1)
      .max(300),
    qualification: text,
  })
  .strict();
export type NativeCoverageBoard = z.infer<typeof NativeCoverageBoardSchema>;
const ChannelSelectionSchema = z
  .object({
    schemaVersion: z.literal("mechanism-ms3-channel-pilot-selection-1"),
    selectionCriteria: z.array(text).min(1).max(32),
    supportCriteria: z.array(text).min(1).max(32),
    selection,
    episodes: z
      .array(
        z
          .object({
            id,
            question: text,
            explanationKey: id,
            selectedDesign: text,
            sourceVerifiedAnswerFromSavedBrief: text,
            sources: z
              .array(
                z
                  .object({ url: text, title: text, supported_claim: text })
                  .passthrough(),
              )
              .min(1)
              .max(16),
            format: z
              .object({
                width: BlenderEpisodePlanSchema.shape.width,
                height: BlenderEpisodePlanSchema.shape.height,
                fps: BlenderEpisodePlanSchema.shape.fps,
              })
              .passthrough(),
            narration: z
              .object({
                wavSha256: hash,
                durationSeconds: z.number().finite().positive().max(3600),
                tempoFactor: z.literal(1),
              })
              .passthrough(),
            nativeAsset: z.object({ sha256: hash }).passthrough(),
          })
          .passthrough(),
      )
      .min(1)
      .max(300),
  })
  .passthrough();
export type NativeCoverageSelection = z.infer<typeof ChannelSelectionSchema>;
/** Native plan selection check is separate from completed listening review. */
export function assertNativeCoveragePlan(
  selected: NativeCoverageSelection["episodes"][number],
  input: unknown,
) {
  const plan = BlenderEpisodePlanSchema.parse(input);
  const samples = Math.round(selected.narration.durationSeconds * 48000);
  assert.equal(plan.id, selected.id, "Selected plan ID differs");
  assert.equal(
    plan.narration.sha256,
    selected.narration.wavSha256,
    "Selected whole narration identity differs",
  );
  assert.equal(
    plan.narration.sampleRate,
    48000,
    "Selected narration normalized clock differs",
  );
  assert.equal(
    plan.narration.sampleCount,
    samples,
    "Selected whole narration duration differs",
  );
  assert.equal(
    BigInt(plan.originalNarrationClock.samples) * 48000n,
    BigInt(samples) * BigInt(plan.originalNarrationClock.sampleRate),
    "Selected original narration1x clock differs",
  );
  for (const key of ["width", "height", "fps"] as const)
    assert.equal(
      plan[key],
      selected.format[key],
      `Selected output ${key} differs`,
    );
  return plan;
}
const distinct = (values: readonly string[], label: string) =>
  assert.equal(new Set(values).size, values.length, `Duplicate ${label}`);
const normalized = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
/** Reconcile declared library work independently of product and whole-review acceptance. */
export function inspectNativeCoverageBoard(
  boardInput: unknown,
  selectedInput: unknown,
  queueInput: unknown,
  bundleInput: unknown,
  plansInput: unknown,
) {
  const board = NativeCoverageBoardSchema.parse(boardInput);
  const selected = ChannelSelectionSchema.parse(selectedInput);
  const queue = BlenderProductionQueueSchema.parse(queueInput);
  const bundle = MechanismProductionReportBundleSchema.parse(bundleInput);
  const plans = z.array(BlenderEpisodePlanSchema).max(300).parse(plansInput);
  assert.equal(
    mechanismPackHash({
      selectionId: selected.selection.id,
      selectionCriteria: selected.selectionCriteria,
      supportCriteria: selected.supportCriteria,
      episodes: selected.episodes,
    }),
    selected.selection.sha256,
    "Selected content differs from its frozen hash",
  );
  assert.deepEqual(
    board.selection,
    selected.selection,
    "Board selection changed",
  );
  assert.deepEqual(
    selected.selection.selectedEpisodeIds,
    selected.episodes.map((r) => r.id),
    "Selected channel order differs from frozen rows",
  );
  for (const [values, label] of [
    [selected.selection.selectedEpisodeIds, "selected ID"],
    [selected.episodes.map((r) => r.id), "selection row"],
    [selected.episodes.map((r) => r.explanationKey), "explanation key"],
    [selected.episodes.map((r) => normalized(r.question)), "question"],
    [
      selected.episodes.map((r) =>
        normalized(r.sourceVerifiedAnswerFromSavedBrief),
      ),
      "answer",
    ],
    [board.registry.map((r) => r.id), "registry ID"],
    [board.episodes.map((r) => r.id), "coverage row"],
    [bundle.episodes.map((r) => r.report.id), "report row"],
  ] as const)
    distinct(values, label);
  const sameIds = (actual: string[], label: string) =>
    assert.deepEqual(
      [...actual].sort(),
      [...selected.selection.selectedEpisodeIds].sort(),
      `${label} differs from selected denominator`,
    );
  sameIds(
    board.episodes.map((r) => r.id),
    "Coverage",
  );
  sameIds(
    queue.items.map((r) => r.id),
    "Queue",
  );
  sameIds(
    bundle.episodes.map((r) => r.report.id),
    "Reports",
  );
  sameIds(
    plans.map((p) => p.id),
    "Plans",
  );
  distinct(
    plans.map((p) => p.id),
    "plan ID",
  );
  assert.equal(bundle.source.queueId, queue.id, "Report queue differs");
  assert.equal(
    bundle.source.revision,
    queue.revision,
    "Report revision differs",
  );
  assert.equal(
    bundle.source.manifestSha256,
    mechanismPackHash(queue),
    "Report manifest differs",
  );
  assert.equal(
    bundle.source.queueCodeSha256,
    queue.codeSha256,
    "Report code differs",
  );
  assert.equal(
    bundle.source.queueProfileSha256,
    queue.profileSha256,
    "Report profile differs",
  );
  const registryUsed = new Set<string>();
  const rows = selected.selection.selectedEpisodeIds.map((episodeId) => {
    const row = board.episodes.find((r) => r.id === episodeId)!;
    const source = selected.episodes.find((r) => r.id === row.id);
    const entry = board.registry.find((r) => r.id === row.registryId);
    const item = queue.items.find((r) => r.id === row.id)!;
    const delivery = bundle.episodes.find((r) => r.report.id === row.id)!;
    assert(source && entry, `Missing source or registry entry: ${row.id}`);
    const plan = assertNativeCoveragePlan(
      source,
      plans.find((p) => p.id === row.id),
    );
    assert.equal(
      item.clock.sourceSamples,
      plan.narration.sampleCount,
      `Queued narration clock differs: ${row.id}`,
    );
    assert.equal(
      item.clock.outputFrames,
      Math.ceil((plan.narration.sampleCount * plan.fps) / 48000),
      `Queued output clock differs: ${row.id}`,
    );
    registryUsed.add(entry.id);
    assert.equal(entry.family, item.family, `Family differs: ${row.id}`);
    assert.equal(
      entry.designVariant,
      item.designVariant,
      `Design differs: ${row.id}`,
    );
    assert.equal(item.question, source.question, `Question differs: ${row.id}`);
    assert.equal(
      item.designVariant,
      source.selectedDesign,
      `Selected design differs: ${row.id}`,
    );
    assert.equal(
      entry.selectedAssetSha256,
      source.nativeAsset.sha256,
      `Original asset differs: ${row.id}`,
    );
    const assetChanged = entry.selectedAssetSha256 !== entry.currentAssetSha256;
    assert.equal(
      assetChanged,
      row.assetWork.length > 0,
      `Asset work differs from changed identity: ${row.id}`,
    );
    assert.equal(
      row.rigWork.length > 0,
      row.newRigType !== null,
      `Rig work differs: ${row.id}`,
    );
    assert.equal(
      row.route,
      row.newRigType
        ? "new-behavior"
        : assetChanged
          ? "new-asset-existing-rig"
          : "existing-pack-rig",
      `Route differs: ${row.id}`,
    );
    if (assetChanged || row.newRigType)
      assert(row.workEvidence.length, `Missing work evidence: ${row.id}`);
    assert.equal(
      delivery.report.question,
      item.question,
      `Report question differs: ${row.id}`,
    );
    assert.equal(
      delivery.report.family,
      item.family,
      `Report family differs: ${row.id}`,
    );
    assert.equal(
      delivery.report.designVariant,
      item.designVariant,
      `Report design differs: ${row.id}`,
    );
    assert.equal(
      delivery.report.binding.inputSha256,
      productionQueueItemRequest(item, queue),
      `Report request differs: ${row.id}`,
    );
    assert.equal(
      delivery.report.binding.codeSha256,
      queue.codeSha256,
      `Episode code differs: ${row.id}`,
    );
    assert.equal(
      delivery.report.binding.profileSha256,
      queue.profileSha256,
      `Episode profile differs: ${row.id}`,
    );
    assert.equal(
      delivery.report.clock.outputFrames,
      item.clock.outputFrames,
      `Report output clock differs: ${row.id}`,
    );
    assert.equal(
      delivery.report.clock.sourceSamples,
      item.clock.sourceSamples,
      `Report audio clock differs: ${row.id}`,
    );
    const supported =
      bundle.source.currentCodeSha256 === queue.codeSha256 &&
      bundle.source.currentProfileSha256 === queue.profileSha256 &&
      delivery.validation.status === "verified" &&
      delivery.queueStatus === "passed" &&
      delivery.disposition.reviewedReady &&
      MECHANISM_QA_DIMENSIONS.every(
        (d) => delivery.disposition.statuses[d] === "passed",
      );
    return {
      id: row.id,
      family: entry.family,
      registryId: entry.id,
      question: source.question,
      explanationKey: source.explanationKey,
      factSources: source.sources.map((s) => ({ title: s.title, url: s.url })),
      route: row.route,
      assetChanged,
      newRigType: row.newRigType,
      validation: delivery.validation.status,
      supported,
    };
  });
  assert.equal(
    registryUsed.size,
    board.registry.length,
    "Unused registry entries must not inflate library totals",
  );
  const supported = rows.filter((r) => r.supported);
  const assetIds = [
    ...new Set(
      rows
        .filter((r) => r.assetChanged)
        .map(
          (r) =>
            board.registry.find((entry) => entry.id === r.registryId)!
              .currentAssetSha256,
        ),
    ),
  ];
  const newRigTypes = [
    ...new Set(rows.flatMap((r) => (r.newRigType ? [r.newRigType] : []))),
  ];
  return {
    schemaVersion: "mechanism-native-coverage-report-2",
    boardSha256: mechanismPackHash(board),
    selection: board.selection,
    selectedDistinctEpisodes: rows.length,
    supportedDistinctEpisodes: supported.length,
    coverage: supported.length / rows.length,
    selectedRouting: Object.fromEntries(
      route.options.map((kind) => [
        kind,
        rows.filter((r) => r.route === kind).length,
      ]),
    ),
    library: {
      registeredEntries: board.registry.length,
      registeredNativeAssets: new Set(
        board.registry.map((r) => r.currentAssetSha256),
      ).size,
      distinctNativeFamilies: new Set(board.registry.map((r) => r.family)).size,
      declaredNewAssetVersions: { count: assetIds.length, ids: assetIds },
      declaredNewRigTypes: { count: newRigTypes.length, ids: newRigTypes },
      admittedNewAssetVersions: [
        ...new Set(
          supported
            .filter((r) => r.assetChanged)
            .map(
              (r) =>
                board.registry.find((entry) => entry.id === r.registryId)!
                  .currentAssetSha256,
            ),
        ),
      ].length,
      admittedNewRigTypes: [
        ...new Set(
          supported.flatMap((r) => (r.newRigType ? [r.newRigType] : [])),
        ),
      ].length,
    },
    rows,
    qualification:
      "Current source/queue/report closure is audited separately from declared library work. Support requires freshly verified products and all six artifact-specific reviews passed; declared work, imported facts, not-applicable decisions and encode success cannot grant pilot support.",
  };
}
/** Bounded command audit; the production reader verifies current products without executing or repairing them. */
export async function auditNativeCoverageBoard(options: {
  boardPath: string;
  manifestPath: string;
  outputDirectory: string;
  blenderExecutable: string;
  reportPath: string;
}) {
  const destination = resolve(options.reportPath);
  const existing = await lstat(destination).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    },
  );
  assert(
    !existing,
    "Native coverage audit requires a fresh report destination",
  );
  const owner = new CompositionNodeMemory();
  const loaded: { release(): void }[] = [];
  try {
    const board = await readProductionJSON(
      resolve(options.boardPath),
      NativeCoverageBoardSchema,
      owner,
      4 * 1024 * 1024,
    );
    loaded.push(board);
    const root = dirname(resolve(options.boardPath));
    const readPin = async <T>(
      pin: z.infer<typeof file>,
      schema: z.ZodType<T>,
    ) => {
      const actual = await cuePlateFile(resolve(root, pin.path), owner, {
        maximumBytes: 4 * 1024 * 1024,
        sha256: pin.sha256,
      });
      assert.equal(
        actual.bytes,
        pin.bytes,
        `Pinned byte count differs: ${pin.path}`,
      );
      const document = await readProductionJSON(
        resolve(root, pin.path),
        schema,
        owner,
        4 * 1024 * 1024,
      );
      loaded.push(document);
      assert.equal(
        document.sha256,
        pin.sha256,
        `Pinned JSON changed during admission: ${pin.path}`,
      );
      return document.value;
    };
    const selected = await readPin(
      board.value.selectionFile,
      ChannelSelectionSchema,
    );
    const queue = await readProductionJSON(
      resolve(options.manifestPath),
      BlenderProductionQueueSchema,
      owner,
      4 * 1024 * 1024,
    );
    loaded.push(queue);
    for (const row of board.value.episodes)
      for (const evidence of row.workEvidence)
        await readPin(evidence, z.json());
    const plans: z.infer<typeof BlenderEpisodePlanSchema>[] = [];
    for (const item of queue.value.items) {
      const entry = board.value.registry.find(
        (r) =>
          r.id ===
          board.value.episodes.find((r) => r.id === item.id)?.registryId,
      );
      assert(entry, `Missing registry: ${item.id}`);
      const sourcePin = item.inputs.find((p) => p.path === item.familyPath);
      assert(sourcePin, `Missing queued source pin: ${item.id}`);
      const sourcePath = resolve(
        dirname(resolve(options.manifestPath)),
        item.familyPath,
      );
      const actual = await cuePlateFile(sourcePath, owner, {
        maximumBytes: 4 * 1024 * 1024,
        sha256: sourcePin.sha256,
      });
      assert.equal(
        actual.bytes,
        sourcePin.bytes,
        `Source byte count differs: ${item.id}`,
      );
      const source = await readProductionJSON(
        sourcePath,
        BlenderEpisodeSourceSchema,
        owner,
        4 * 1024 * 1024,
      );
      loaded.push(source);
      assert.equal(
        source.sha256,
        sourcePin.sha256,
        `Queued source changed during admission: ${item.id}`,
      );
      assert.equal(
        entry.family,
        source.value.family,
        `Registry source family differs: ${item.id}`,
      );
      assert.equal(
        entry.designVariant,
        source.value.designVariant,
        `Registry source design differs: ${item.id}`,
      );
      assert.equal(
        entry.currentAssetSha256,
        source.value.asset.sha256,
        `Current asset differs: ${item.id}`,
      );
      assert.equal(
        entry.controllerSha256,
        mechanismPackHash(source.value.controller),
        `Controller differs: ${item.id}`,
      );
    }
    for (const item of queue.value.items) {
      const pin = item.inputs.find((p) => p.path === item.cuePath);
      assert(pin, `Missing queued plan pin: ${item.id}`);
      const path = resolve(
        dirname(resolve(options.manifestPath)),
        item.cuePath,
      );
      const actual = await cuePlateFile(path, owner, {
        maximumBytes: 4 * 1024 * 1024,
        sha256: pin.sha256,
      });
      assert.equal(
        actual.bytes,
        pin.bytes,
        `Plan byte count differs: ${item.id}`,
      );
      const plan = await readProductionJSON(
        path,
        BlenderEpisodePlanSchema,
        owner,
        4 * 1024 * 1024,
      );
      loaded.push(plan);
      assert.equal(
        plan.sha256,
        pin.sha256,
        `Queued plan changed during admission: ${item.id}`,
      );
      plans.push(plan.value);
      const row = selected.episodes.find((r) => r.id === item.id);
      assert(row, `Missing selected narration: ${item.id}`);
      assertNativeCoveragePlan(row, plan.value);
    }
    const executor = await createBlenderProductionExecutor({
      blenderExecutable: options.blenderExecutable,
    });
    const bundle = await readMechanismProductionReports(
      options.manifestPath,
      options.outputDirectory,
      executor,
      { nodeMemory: owner },
    );
    const report = inspectNativeCoverageBoard(
      board.value,
      selected,
      queue.value,
      bundle,
      plans,
    );
    await writeProductionJSON(
      resolve(options.reportPath),
      report,
      owner,
      4 * 1024 * 1024,
      true,
    );
    return {
      path: resolve(options.reportPath),
      selected: report.selectedDistinctEpisodes,
      supported: report.supportedDistinctEpisodes,
      declaredNewAssets: report.library.declaredNewAssetVersions.count,
      declaredNewRigTypes: report.library.declaredNewRigTypes.count,
    };
  } finally {
    for (const document of loaded.reverse()) document.release();
    owner.dispose();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    assert.equal(
      args.length,
      5,
      "Usage: native-coverage-board.ts <board.json> <queue.json> <output-directory> <Blender executable> <report.json>",
    );
    console.log(
      JSON.stringify(
        await auditNativeCoverageBoard({
          boardPath: args[0]!,
          manifestPath: args[1]!,
          outputDirectory: args[2]!,
          blenderExecutable: args[3]!,
          reportPath: args[4]!,
        }),
      ),
    );
  } catch (error) {
    const diagnostic =
      error instanceof z.ZodError
        ? error.issues.slice(0, 4).map((issue) => ({
            path: issue.path.slice(0, 8).map((p) => String(p).slice(0, 64)),
            message: issue.message.slice(0, 256),
          }))
        : {
            message:
              error instanceof Error
                ? error.message.slice(0, 2048)
                : "Native coverage audit failed",
          };
    console.error(
      JSON.stringify({
        status: "failed",
        diagnostic,
        nextAction:
          "Inspect the board, frozen selection, current source/work pins and production report. The audit does not repair or execute jobs.",
      }),
    );
    process.exitCode = 1;
  }
}
