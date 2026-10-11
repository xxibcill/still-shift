import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { MechanismPackReferenceSchema } from "@still-shift/scene-contract";
import { inspectMechanismFamilyRegistry } from "../../packages/animation-engine/src/mechanism/family-registry.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";

const text = z.string().trim().min(1).max(2048);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,95}$/);
const strings = z.array(text).min(1).max(32);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const family = z.enum(["tape-hook", "cable-tie", "clothespeg"]);
const route = z.enum([
  "existing-pack-rig",
  "new-asset-existing-rig",
  "new-behavior",
]);
const source = z
  .object({
    id,
    title: text,
    url: z.url(),
    claim: text,
    scope: text,
    checkedDate: date,
    access: z.enum(["primary-content-read", "primary-search-excerpt"]),
  })
  .strict();
const episode = z
  .object({
    id,
    family,
    question: text,
    explanationKey: id,
    answer: text,
    causalRelationship: z
      .object({ cause: text, effect: text, counterfactual: text })
      .strict(),
    factualVariant: z
      .object({
        id,
        description: text,
        dimensionBasis: z.literal("illustrative"),
        sources: z.array(id).min(1),
      })
      .strict(),
    requiredPack: z
      .object({
        base: MechanismPackReferenceSchema,
        plannedAssetId: id.nullable(),
      })
      .strict(),
    reusedRigIds: z.array(id).min(1).max(8),
    explanationViews: strings,
    requiredCapabilities: strings,
    assetWork: z.array(text).max(16),
    behaviorWork: z.array(text).max(16),
    plannedBehaviorId: id.nullable(),
    route,
    overlap: z
      .object({
        relatedEpisodes: z.array(id),
        questionAnswer: text,
        scenePatterns: strings,
        distinction: text,
      })
      .strict(),
    sharedEarlierEpisodes: z
      .array(z.object({ milestone: text, id, scope: text }).strict())
      .max(8),
    existingEvidence: z
      .array(z.object({ path: text, scope: text }).strict())
      .max(16),
    support: z
      .object({ state: z.literal("not-validated"), missingGates: strings })
      .strict(),
  })
  .strict();
/** This baseline format deliberately cannot admit support. Named capabilities and scoped software receipts are not acceptance. */
export const CoverageBoardSchema = z
  .object({
    schemaVersion: z.literal("mechanism-coverage-board-1"),
    revision: z.number().int().positive(),
    date,
    milestone: z.enum(["MS2", "MS3", "MS4C"]),
    sourceCheckpoint: z.string().regex(/^[a-f0-9]{40}$/),
    selectionCriteria: strings,
    supportCriteria: strings,
    sources: z.array(source).min(1).max(64),
    episodes: z.array(episode).min(1).max(300),
    selection: z
      .object({ id, selectedEpisodeIds: z.array(id).max(300), sha256: hash })
      .strict(),
    changes: z
      .array(
        z
          .object({
            revision: z.number().int().positive(),
            date,
            reason: text,
            previousSelectionSha256: hash.nullable(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type CoverageBoard = z.infer<typeof CoverageBoardSchema>;

export function coverageSelectionHash(board: CoverageBoard): string {
  const rows = board.selection.selectedEpisodeIds.map((selected) => {
    const row = board.episodes.find((candidate) => candidate.id === selected);
    assert(row, `Unknown selected episode: ${selected}`);
    return row;
  });
  const sourceIds = new Set(rows.flatMap((row) => row.factualVariant.sources));
  return mechanismPackHash({
    selectionId: board.selection.id,
    selectionCriteria: board.selectionCriteria,
    supportCriteria: board.supportCriteria,
    episodes: rows,
    sources: board.sources.filter((entry) => sourceIds.has(entry.id)),
  });
}
const normalized = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
function unique(values: readonly string[], label: string) {
  assert.equal(new Set(values).size, values.length, `Duplicate ${label}`);
}

/** Read-only baseline audit. Positive support requires a future admission contract with verified capabilities and review receipts. */
export function inspectCoverageBoard(input: unknown) {
  const board = CoverageBoardSchema.parse(input);
  unique(
    board.episodes.map((row) => row.id),
    "episode ID",
  );
  unique(
    board.episodes.map((row) => row.explanationKey),
    "explanation key",
  );
  unique(
    board.episodes.map((row) => normalized(row.question)),
    "question",
  );
  unique(
    board.episodes.map((row) => normalized(row.answer)),
    "answer",
  );
  unique(
    board.sources.map((entry) => entry.id),
    "source ID",
  );
  unique(board.selection.selectedEpisodeIds, "selected episode ID");
  const registry = inspectMechanismFamilyRegistry();
  const sourceIds = new Set(board.sources.map((entry) => entry.id));
  const ids = new Set(board.episodes.map((row) => row.id));
  for (const row of board.episodes) {
    const entry = registry.entries.find(
      (candidate) => candidate.id === row.family,
    )!;
    assert.deepEqual(
      row.requiredPack.base,
      entry.reference,
      `Stale pack reference: ${row.id}`,
    );
    // This version reports the candidate baseline; it must not silently survive pack admission.
    assert.equal(
      entry.status,
      "candidate",
      `Refresh support admission for verified pack: ${row.id}`,
    );
    assert.equal(
      row.requiredPack.base.id,
      row.family,
      `Pack family mismatch: ${row.id}`,
    );
    unique(row.reusedRigIds, `rig ID in ${row.id}`);
    for (const rig of row.reusedRigIds)
      assert(
        entry.controls.some((control) => control.id === rig),
        `Unknown reused rig: ${row.id}/${rig}`,
      );
    for (const sourceId of row.factualVariant.sources)
      assert(sourceIds.has(sourceId), `Unknown source: ${row.id}/${sourceId}`);
    unique(row.overlap.relatedEpisodes, `related episode in ${row.id}`);
    for (const related of row.overlap.relatedEpisodes)
      assert(
        related !== row.id && ids.has(related),
        `Invalid overlap: ${row.id}/${related}`,
      );
    if (row.route === "existing-pack-rig") {
      assert.equal(
        row.requiredPack.plannedAssetId,
        null,
        `Unexpected new asset: ${row.id}`,
      );
      assert.equal(row.assetWork.length, 0, `Unexpected asset work: ${row.id}`);
      assert.equal(
        row.factualVariant.id,
        entry.reference.variant,
        `Existing route changes variant: ${row.id}`,
      );
    } else {
      assert(
        row.requiredPack.plannedAssetId && row.assetWork.length,
        `Missing new asset work: ${row.id}`,
      );
    }
    assert.equal(
      row.route === "new-behavior",
      row.plannedBehaviorId !== null,
      `Behavior route mismatch: ${row.id}`,
    );
    assert.equal(
      row.route === "new-behavior",
      row.behaviorWork.length > 0,
      `Behavior work mismatch: ${row.id}`,
    );
    for (const evidence of row.existingEvidence)
      assert(
        !evidence.path.startsWith("/") &&
          !evidence.path.split("/").includes(".."),
        `Evidence must be repository relative: ${row.id}`,
      );
  }
  assert.equal(
    coverageSelectionHash(board),
    board.selection.sha256,
    "Frozen selection changed; disclose and freeze a new revision",
  );
  const selected = board.selection.selectedEpisodeIds.map(
    (selectedId) => board.episodes.find((row) => row.id === selectedId)!,
  );
  const routeCounts = (rows: typeof selected) =>
    Object.fromEntries(
      route.options.map((kind) => [
        kind,
        rows.filter((row) => row.route === kind).length,
      ]),
    );
  const newAssetIds = selected
    .filter((row) => row.assetWork.length)
    .map((row) => row.id);
  const newBehaviorIds = selected
    .filter((row) => row.behaviorWork.length)
    .map((row) => row.id);
  return {
    schemaVersion: "mechanism-coverage-report-1",
    boardSha256: mechanismPackHash(board),
    selection: board.selection,
    proposedDistinctEpisodes: board.episodes.length,
    selectedDistinctEpisodes: selected.length,
    supportedDistinctEpisodes: 0,
    coverage: selected.length ? 0 : null,
    candidateRouting: routeCounts(board.episodes),
    selectedRouting: routeCounts(selected),
    newAssetEpisodes: { count: newAssetIds.length, ids: newAssetIds },
    newBehaviorEpisodes: { count: newBehaviorIds.length, ids: newBehaviorIds },
    plannedBehaviorTypes: [
      ...new Set(
        selected.flatMap((row) =>
          row.plannedBehaviorId ? [row.plannedBehaviorId] : [],
        ),
      ),
    ],
    admittedNewAssets: 0,
    admittedNewRigTypes: 0,
    packStatuses: registry.entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      reference: entry.reference,
    })),
    scope:
      "Audited frozen candidate baseline. Distinctness keys and overlap disclosures require editorial judgment. No support, completed pilot, factual review, visual/listening acceptance or new asset/rig admission is inferred.",
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const path = process.argv[2];
  assert(
    path,
    "Usage: node --import tsx scripts/mechanism/coverage-board.ts <board.json>",
  );
  const input: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
  const report = inspectCoverageBoard(input);
  const board = CoverageBoardSchema.parse(input);
  for (const row of board.episodes)
    for (const evidence of row.existingEvidence)
      await readFile(resolve(evidence.path));
  console.log(JSON.stringify(report, null, 2));
}
