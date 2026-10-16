import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  BlenderProductionQueueSchema,
  BlenderProductionEpisodeReportSchema,
  createUnreviewedMechanismQA,
  inspectMechanismProductionDisposition,
  summarizeMechanismProductionCohort,
} from "@still-shift/animation-engine";
import {
  inspectNativeCoverageBoard,
  assertNativeCoveragePlan,
  type NativeCoverageBoard,
} from "../../scripts/mechanism/native-coverage-board.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import { productionQueueItemRequest } from "../../packages/animation-engine/src/mechanism/production-queue-validation.ts";
import {
  hash,
  code,
  profile,
} from "../fixtures/mechanism-production-queue-support.ts";
import { blenderEpisodePlan } from "../fixtures/blender-episode-support.ts";
const input = JSON.parse(
  await readFile(
    new URL(
      "../../docs/mechanism-shorts-ms3-pilot-selection.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
function fixture() {
  const selected = structuredClone(input);
  const queue = BlenderProductionQueueSchema.parse({
    schemaVersion: "mechanism-production-queue-2",
    id: "native-coverage-fixture",
    revision: 0,
    baseHash: null,
    codeSha256: code,
    profileSha256: profile,
    maximumAttempts: 1,
    items: selected.episodes.map(
      (row: (typeof selected.episodes)[number], i: number) => ({
        id: row.id,
        backend: "blender-native",
        question: row.question,
        family: [
          "tape-hook",
          "cable-tie",
          "clothespeg",
          "zipper",
          "keyhole-slot",
          "binder-clip",
          "side-release-buckle",
          "spring-latch",
          "curved-tape-blade",
          "stay-on-can-tab",
        ][i],
        designVariant: row.selectedDesign,
        familyPath: "source.json",
        cuePath: "plan.json",
        clock: {
          outputFrames: Math.ceil(row.narration.durationSeconds * 30),
          sourceSamples: Math.round(row.narration.durationSeconds * 48000),
        },
        inputs: [
          { path: "source.json", bytes: 2, sha256: hash("{}") },
          { path: "plan.json", bytes: 2, sha256: hash("{}") },
        ],
      }),
    ),
  });
  const board: NativeCoverageBoard = {
    schemaVersion: "mechanism-native-coverage-board-2",
    revision: 1,
    selectionFile: { path: "selection.json", bytes: 2, sha256: hash("{}") },
    selection: selected.selection,
    registry: queue.items.map((item, i) => ({
      id: "asset" + i,
      family: item.family,
      designVariant: item.designVariant,
      selectedAssetSha256: selected.episodes[i].nativeAsset.sha256,
      currentAssetSha256:
        i === 3
          ? hash("fixture-revised-zipper")
          : selected.episodes[i].nativeAsset.sha256,
      controllerSha256: hash("fixture-controller"),
    })),
    episodes: queue.items.map((item, i) => ({
      id: item.id,
      registryId: "asset" + i,
      route: i === 3 ? "new-asset-existing-rig" : "existing-pack-rig",
      assetWork: i === 3 ? ["Declared fixture asset revision"] : [],
      rigWork: [],
      newRigType: null,
      workEvidence:
        i === 3 ? [{ path: "work.json", bytes: 2, sha256: hash("{}") }] : [],
    })),
    qualification:
      "Synthetic report/source fixture only; no actual pilot support.",
  };
  const reports = queue.items.map((item) => {
    const binding = {
      inputSha256: productionQueueItemRequest(item, queue),
      outputSha256: hash(item.id),
      codeSha256: code,
      profileSha256: profile,
    };
    return BlenderProductionEpisodeReportSchema.parse({
      schemaVersion: "mechanism-production-episode-report-2",
      backend: "blender-native",
      id: item.id,
      question: item.question,
      family: item.family,
      designVariant: item.designVariant,
      binding,
      clock: item.clock,
      attempts: [],
      qa: createUnreviewedMechanismQA(binding),
      unresolvedMechanicalFailures: 0,
      durations: {
        setupSeconds: null,
        routineSeconds: null,
        renderSeconds: null,
      },
      authoring: {
        setupTokens: null,
        routineTokens: null,
        baselineRoutineTokens: null,
        comparable: false,
        measurementEvidence: null,
      },
    });
  });
  const bundle = {
    schemaVersion: "mechanism-production-report-bundle-1",
    source: {
      queueId: queue.id,
      revision: 0,
      manifestSha256: mechanismPackHash(queue),
      manifestFileSha256: hash("manifest-file"),
      journalFileSha256: hash("journal-file"),
      queueCodeSha256: code,
      queueProfileSha256: profile,
      currentCodeSha256: code,
      currentProfileSha256: profile,
    },
    episodes: reports.map((report) => ({
      queueStatus: "passed",
      validation: { status: "verified", issue: null },
      product: null,
      qualityEvidence: null,
      priorProducts: [],
      cacheFailures: [],
      retainedQA: [],
      report,
      disposition: inspectMechanismProductionDisposition(report),
    })),
    cohort: summarizeMechanismProductionCohort(reports),
    qualification: "Synthetic fixture only.",
  };
  const plans = selected.episodes.map(
    (row: (typeof selected.episodes)[number]) => {
      const samples = Math.round(row.narration.durationSeconds * 48000),
        template = blenderEpisodePlan();
      return {
        ...template,
        id: row.id,
        ...row.format,
        narration: {
          ...template.narration,
          sha256: row.narration.wavSha256,
          sampleCount: samples,
        },
        originalNarrationClock: {
          sampleRate: 44100,
          samples: Math.round(row.narration.durationSeconds * 44100),
        },
        shots: [
          { ...template.shots[0]!, endExclusive: 30 },
          {
            ...template.shots[1]!,
            endExclusive: Math.ceil((samples * row.format.fps) / 48000),
          },
        ],
      };
    },
  );
  return { board, selected, queue, bundle, plans };
}
function audit(f: ReturnType<typeof fixture>) {
  return inspectNativeCoverageBoard(
    f.board,
    f.selected,
    f.queue,
    f.bundle,
    f.plans,
  );
}
function refresh(f: ReturnType<typeof fixture>) {
  f.bundle.episodes.forEach((e) => {
    e.disposition = inspectMechanismProductionDisposition(e.report);
  });
  f.bundle.cohort = summarizeMechanismProductionCohort(
    f.bundle.episodes.map((e) => e.report),
  );
}
describe("native selected-cohort coverage", () => {
  it("admits all ten distinct native families without changing the legacy board and keeps unreviewed support at zero", () => {
    const f = fixture(),
      before = JSON.stringify(f);
    const result = audit(f);
    expect(result.selectedDistinctEpisodes).toBe(10);
    expect(result.supportedDistinctEpisodes).toBe(0);
    expect(result.library.registeredNativeAssets).toBe(10);
    expect(result.selectedRouting).toEqual({
      "existing-pack-rig": 9,
      "new-asset-existing-rig": 1,
      "new-behavior": 0,
    });
    expect(result.library.declaredNewAssetVersions.count).toBe(1);
    expect(result.library.admittedNewAssetVersions).toBe(0);
    expect(JSON.stringify(f)).toBe(before);
  });
  it("rejects omitted, added and duplicate coverage rows rather than shrinking the denominator", () => {
    for (const edit of [
      (f: ReturnType<typeof fixture>) => f.board.episodes.pop(),
      (f: ReturnType<typeof fixture>) =>
        f.board.episodes.push(f.board.episodes[0]!),
      (f: ReturnType<typeof fixture>) => (f.board.episodes[0]!.id = "EU-999"),
    ]) {
      const f = fixture();
      edit(f);
      expect(() => audit(f)).toThrow();
    }
  });
  it("rejects changed frozen answers, unknown registries, changed routes and undeclared changed assets", () => {
    for (const edit of [
      (f: ReturnType<typeof fixture>) =>
        (f.selected.episodes[0].sourceVerifiedAnswerFromSavedBrief +=
          "changed"),
      (f: ReturnType<typeof fixture>) =>
        (f.board.episodes[0]!.registryId = "missing"),
      (f: ReturnType<typeof fixture>) =>
        (f.board.episodes[3]!.route = "existing-pack-rig"),
      (f: ReturnType<typeof fixture>) => (f.board.episodes[3]!.assetWork = []),
      (f: ReturnType<typeof fixture>) =>
        (f.board.episodes[3]!.workEvidence = []),
    ]) {
      const f = fixture();
      edit(f);
      expect(() => audit(f)).toThrow();
    }
  });
  it("keeps selected channel order bound to the frozen rows", () => {
    const f = fixture();
    f.selected.selection.selectedEpisodeIds.reverse();
    expect(() => audit(f)).toThrow(/channel order/);
  });
  it("emits rows in frozen channel order even when board entries are reordered", () => {
    const f = fixture();
    f.board.episodes.reverse();
    expect(audit(f).rows.map((row) => row.id)).toEqual(
      f.selected.selection.selectedEpisodeIds,
    );
  });
  it("binds the whole selected recording, original clock and requested format before support admission", () => {
    const selected = structuredClone(input.episodes[0]);
    const samples = Math.round(selected.narration.durationSeconds * 48000);
    const plan = {
      ...blenderEpisodePlan(),
      id: selected.id,
      ...selected.format,
      narration: {
        ...blenderEpisodePlan().narration,
        sha256: selected.narration.wavSha256,
        sampleCount: samples,
      },
      originalNarrationClock: {
        sampleRate: 44100,
        samples: Math.round(selected.narration.durationSeconds * 44100),
      },
      shots: [
        { ...blenderEpisodePlan().shots[0]!, endExclusive: 30 },
        {
          ...blenderEpisodePlan().shots[1]!,
          endExclusive: Math.ceil((samples * selected.format.fps) / 48000),
        },
      ],
    };
    expect(() => assertNativeCoveragePlan(selected, plan)).not.toThrow();
    for (const change of [
      (p: typeof plan) => (p.narration.sha256 = hash("substituted-take")),
      (p: typeof plan) => (p.narration.sampleCount -= 48000),
      (p: typeof plan) => (p.originalNarrationClock.samples -= 44100),
      (p: typeof plan) => (p.width = 320),
      (p: typeof plan) => (p.fps = 24),
    ]) {
      const changed = structuredClone(plan);
      change(changed);
      expect(() => assertNativeCoveragePlan(selected, changed)).toThrow();
    }
  });
  it("reconciles new rig types from individual declared rows and rejects undeclared rig work", () => {
    const f = fixture();
    Object.assign(f.board.episodes[3]!, {
      route: "new-behavior",
      rigWork: ["Fixture rig change"],
      newRigType: "fixture-new-rig",
    });
    expect(audit(f).library.declaredNewRigTypes).toEqual({
      count: 1,
      ids: ["fixture-new-rig"],
    });
    f.board.episodes[3]!.newRigType = null;
    expect(() => audit(f)).toThrow();
  });
  it("requires all six complete passed reviews and current code for positive support", () => {
    const f = fixture(),
      report = f.bundle.episodes[3]!.report;
    report.qa = report.qa.map((q) => ({
      ...q,
      status: "passed",
      method: "fixture-explicit-review",
      evaluatedInterval: {
        unit: q.dimension === "listening" ? "source-sample" : "output-frame",
        start: 0,
        endExclusive:
          q.dimension === "listening"
            ? report.clock.sourceSamples
            : report.clock.outputFrames,
      },
      evidence: [
        { path: "fixture-review.json", sha256: hash("fixture-review") },
      ],
      reviewer: { kind: "agent", id: "fixture-only" },
    }));
    refresh(f);
    expect(audit(f).supportedDistinctEpisodes).toBe(1);
    expect(audit(f).library.admittedNewAssetVersions).toBe(1);
    Object.assign(report.qa.find((q) => q.dimension === "listening")!, {
      status: "not-applicable",
      method: "not-applicable",
      evaluatedInterval: null,
    });
    refresh(f);
    expect(audit(f).supportedDistinctEpisodes).toBe(0);
    Object.assign(report.qa.find((q) => q.dimension === "listening")!, {
      status: "passed",
      method: "fixture-explicit-review",
      evaluatedInterval: {
        unit: "source-sample",
        start: 0,
        endExclusive: report.clock.sourceSamples,
      },
    });
    refresh(f);
    f.bundle.source.currentCodeSha256 = hash("new-code");
    expect(audit(f).supportedDistinctEpisodes).toBe(0);
  });
  it("rejects a report from another request, manifest or source clock", () => {
    for (const edit of [
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.source.manifestSha256 = hash("other-manifest")),
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.episodes[0]!.report.binding.inputSha256 =
          hash("other-request")),
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.episodes[0]!.report.clock.outputFrames = 61),
    ]) {
      const f = fixture();
      edit(f);
      expect(() => audit(f)).toThrow();
    }
  });
});
