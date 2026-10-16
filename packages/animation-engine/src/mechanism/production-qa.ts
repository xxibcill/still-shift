import { loadComposition } from "../composition-render.ts";
import {
  evaluateMechanismProductionVisualQA,
  mechanismProductionVisualPolicy,
} from "./production-qa-visual.ts";
import { z } from "zod";
import { join, relative, resolve } from "node:path";
import {
  MechanismNarratedCycleSchema,
  CompositionSchema,
} from "@still-shift/scene-contract";
import {
  CompositionNodeMemory,
  compositionNodeJsonSize,
} from "@still-shift/execution-runtime/export";
import { analyzeCompositionQuality } from "@still-shift/renderer-core";
import {
  MechanismFamilyAuthoringSchema,
  inspectMechanismFamilyAuthoring,
} from "./family-authoring.ts";
import { inspectMechanismCueAuthoring } from "./cue-authoring.ts";
import { checkMechanismCueNativePlates } from "./cue-native-plates.ts";
import {
  MechanismProductionQAPlanSchema,
  MechanismProductionQAFactsSchema,
  MECHANISM_PRODUCTION_QA_LIMITS as LIMIT,
  type MechanismProductionQAFacts,
} from "./production-qa-contract.ts";
import {
  MechanismProductionQASampler,
  DEFAULT_MECHANISM_PRODUCTION_QA_PLAN,
} from "./production-qa-sampling.ts";
import { mapMechanismProductionWarnings } from "./production-qa-warnings.ts";
import {
  productionFailure,
  productionFile,
  readProductionJSON,
  writeProductionJSON,
} from "./production-queue-files.ts";
import { mechanismPackHash } from "./pack-support.ts";
import type { MechanismProductionBinding } from "./production-report.ts";
import type { MechanismProductionQueueItem } from "./production-queue-contract.ts";
import type { MechanismProductionExecutionContext } from "./production-queue.ts";

export async function evaluateMechanismProductionNativeQA(input: {
  item: MechanismProductionQueueItem;
  context: MechanismProductionExecutionContext;
  binding: MechanismProductionBinding;
  platesDirectory: string;
  preparedDirectory: string;
  video: { path: string; sha256: string };
  verify?: boolean;
}) {
  const { context, item } = input,
    owner = new CompositionNodeMemory(context.nodeMemory);
  const release: (() => void)[] = [];
  const reserve = owner.reserve(LIMIT.retainedCapacityBytes);
  try {
    context.signal?.throwIfAborted();
    const family = await readProductionJSON(
      resolve(context.manifestDirectory, item.familyPath),
      MechanismFamilyAuthoringSchema,
      owner,
      1024 * 1024,
      context.signal,
    );
    release.push(family.release);
    const instance = inspectMechanismFamilyAuthoring(family.value).instance;
    compositionNodeJsonSize(instance, 0, "", 16 * 1024 * 1024);
    const cuePath = resolve(context.manifestDirectory, item.cuePath);
    const cue = await readProductionJSON(
      cuePath,
      MechanismNarratedCycleSchema,
      owner,
      32 * 1024 * 1024,
      context.signal,
    );
    release.push(cue.release);
    const authored = inspectMechanismCueAuthoring(instance, cue.value);
    if (
      authored.compiled.composition.frameCount !== item.clock.outputFrames ||
      authored.document.narration.sampleCount !== item.clock.sourceSamples
    )
      throw Error("QA source clocks differ from the current queue item");
    let plan = DEFAULT_MECHANISM_PRODUCTION_QA_PLAN;
    if (item.qaPath) {
      const loaded = await readProductionJSON(
        resolve(context.manifestDirectory, item.qaPath),
        MechanismProductionQAPlanSchema,
        owner,
        LIMIT.planBytes,
        context.signal,
      );
      release.push(loaded.release);
      plan = loaded.value;
    }
    const sampler = new MechanismProductionQASampler(
      plan,
      instance.scene,
      item.clock.outputFrames,
    );
    const composition = await readProductionJSON(
      join(input.preparedDirectory, "composition.json"),
      CompositionSchema,
      owner,
      32 * 1024 * 1024,
      context.signal,
    );
    release.push(composition.release);
    const layers = new Set(composition.value.layers.map((l) => l.id)),
      rigs = new Set(instance.scene.rigs.map((r) => r.id)),
      parts = new Set(instance.scene.parts.map((p) => p.id));
    for (const binding of plan.warningBindings)
      if (
        !layers.has(binding.layer) ||
        !rigs.has(binding.controllingRig) ||
        binding.parts.some((p) => !parts.has(p))
      )
        throw Error(
          "Warning controller binding must name current layers, physical rigs and parts",
        );
    if (
      new Set(plan.warningBindings.map((b) => b.layer)).size !==
      plan.warningBindings.length
    )
      throw Error("A warning layer has conflicting controller bindings");
    if (
      composition.value.frameCount * composition.value.layers.length >
      LIMIT.qualityLayerFrames
    )
      throw Error(
        "Production state-warning layer-frame budget exceeded before analysis",
      );
    const capture = await productionFile(
      context.outputRoot,
      relative(
        context.outputRoot,
        join(input.platesDirectory, "native-plates.json"),
      ),
      owner,
    );
    await checkMechanismCueNativePlates(
      resolve(context.manifestDirectory, item.familyPath),
      cuePath,
      input.preparedDirectory,
      input.platesDirectory,
      {
        nodeMemory: owner,
        signal: context.signal,
        onFrame: (packet) => {
          if (packet.version !== "native3d-observed-output-frame-2")
            throw Error(
              "Native QA requires original native2 capture observations",
            );
          sampler.observe(packet, {
            path: capture.path,
            sha256: capture.sha256,
          });
        },
      },
    );
    const semantics = sampler.finish(input.binding);
    const qualityCapacity =
      2 * 1024 * 1024 +
      composition.value.frameCount * composition.value.layers.length * 4096;
    if (qualityCapacity > LIMIT.qualityCapacityBytes)
      throw Error(
        "Production state-warning capacity exceeds its published maximum before analysis",
      );
    const qualityLease = owner.reserve(qualityCapacity);
    let quality;
    let renderedVisual;
    try {
      renderedVisual = await evaluateMechanismProductionVisualQA({
        outputRoot: context.outputRoot,
        video: input.video,
        expectedComposition: {
          path: join(input.preparedDirectory, "composition.json"),
          sha256: composition.sha256,
        },
        expectedNativeReceipt: capture,
        document: authored.document,
        nodeMemory: owner,
        signal: context.signal,
      });
      const loaded = await loadComposition(
        join(input.preparedDirectory, "composition.json"),
        "webgl2",
        { nodeMemory: owner, signal: context.signal },
      );
      quality = analyzeCompositionQuality(loaded.composition, {
        ...mechanismProductionVisualPolicy(
          loaded.composition,
          authored.document,
        ),
        evaluation: {
          textBounds: renderedVisual.textBounds,
          ...(loaded.native3D ? { preparedNative3D: loaded.native3D } : {}),
        },
        intentionalCuts: authored.document.cues
          .filter((c) => c.editing === "cut")
          .map((c) =>
            Number(
              (BigInt(c.startSample) * BigInt(authored.document.output.fps) +
                47999n) /
                48000n,
            ),
          ),
        shots: authored.compiled.cueMap.map((c) => ({
          id: c.cue,
          start: c.startFrame,
          end: c.shotEndFrameExclusive,
        })),
      });
      const stateQuality = quality;
      const seen = new Set(
        stateQuality.diagnostics.map((d) => mechanismPackHash(d)),
      );
      quality = {
        ...renderedVisual.quality,
        diagnostics: [
          ...stateQuality.diagnostics,
          ...renderedVisual.quality.diagnostics.filter(
            (d) => !seen.has(mechanismPackHash(d)),
          ),
        ],
      };
      quality.status = quality.diagnostics.some((d) => d.severity === "error")
        ? "failed"
        : "passed";
      compositionNodeJsonSize(quality, 0, "", 8 * 1024 * 1024);
      if (quality.diagnostics.length > LIMIT.warningRows)
        throw Error("Production raw warning row budget exceeded");
    } finally {
      qualityLease.release();
    }
    const persist = async (name: string, data: unknown) => {
      const path = join(context.attemptDirectory, name);
      if (input.verify) {
        const retained = await readProductionJSON(
          path,
          z.unknown(),
          owner,
          LIMIT.factsBytes,
          context.signal,
        );
        try {
          if (mechanismPackHash(retained.value) !== mechanismPackHash(data))
            productionFailure(
              "production-qa-derived-evidence",
              "QA data differs from fresh source/capture analysis",
              path,
            );
        } finally {
          retained.release();
        }
      } else
        await writeProductionJSON(path, data, owner, LIMIT.factsBytes, true);
      return productionFile(
        context.outputRoot,
        relative(context.outputRoot, path),
        owner,
      );
    };
    const program = await persist("qa-program.json", sampler.program);
    const rendered = await persist("qa-rendered-visual.json", {
      schemaVersion: "mechanism-production-rendered-visual-1",
      binding: input.binding,
      ...renderedVisual,
    });
    const raw = await persist("qa-raw-warnings.json", {
      schemaVersion: "mechanism-production-raw-warnings-1",
      binding: input.binding,
      method:
        "current-source-state-and-verified-cached-plate-preview-pixels-and-measured-glyphs",
      renderedVisual: rendered,
      quality,
    });
    const grouped = mapMechanismProductionWarnings({
      composition: composition.value,
      document: authored.document,
      plan,
      diagnostics: quality.diagnostics,
      binding: input.binding,
      rawEvidence: { path: raw.path, sha256: raw.sha256 },
      video: input.video,
    });
    const warningGroups = await persist("qa-warning-groups.json", grouped);
    const mechanicalFailures = semantics.assertions.reduce(
      (n, a) => n + a.findings.length,
      0,
    );
    const sampledVisualFailures = quality.diagnostics.filter(
      (d) => d.severity === "error",
    ).length;
    const collisionAssertions = semantics.assertions.filter(
      (a) => a.domain === "collision",
    );
    const timeline = authored.compiled.timeline;
    const facts = MechanismProductionQAFactsSchema.parse({
      schemaVersion: "mechanism-production-qa-facts-1",
      binding: input.binding,
      planSha256: sampler.planSha256,
      source: {
        cueProjectHash: authored.projectHash,
        sourceSceneSha256: instance.sourceSha256,
        nativeCapture: capture,
        program,
      },
      timeline: {
        method:
          "current-cue-compiler-expected-state-output-frames-and-exact-event-boundaries",
        evidence: timeline.evidence,
        sourceSha256: timeline.sourceSha256,
        timelineSha256: timeline.timelineSha256,
        checkedOutputFrames: timeline.checkedOutputFrames,
        checkedEventFrames: timeline.checkedEventFrames,
        status: "passed",
        collisionMethod: "not-evaluated",
      },
      semantics,
      warnings: {
        raw,
        rendered,
        grouped: warningGroups,
        groups: grouped.groups.length,
        errors: sampledVisualFailures,
      },
      failures: {
        mechanical: mechanicalFailures,
        sampledVisual: sampledVisualFailures,
      },
      collision: {
        analytic: "not-evaluated",
        sampled: !collisionAssertions.length
          ? "unreviewed"
          : collisionAssertions.some((a) => a.status === "failed")
            ? "failed"
            : collisionAssertions.every((a) => a.status === "passed")
              ? "passed"
              : "unreviewed",
        continuous: "unreviewed",
      },
      mechanicalAcceptance: "separate-whole-mechanism-review",
      qualification:
        "Original native output-frame scalars and current expected-state transitions/event order, plus source-state warnings and all-frame cached-plate preview pixels/measured glyphs. Individual sampled rules do not prove whole mechanical correctness, between-frame collision, encoded glyphs, continuous playback, factual truth or listening. Unknown diagnostic units and composition-only controllers remain explicitly unresolved.",
    });
    const artifact = await persist("qa-facts.json", facts);
    return { facts, artifact, raw, rendered, program, grouped: warningGroups };
  } finally {
    for (const r of release.reverse()) r();
    reserve.release();
    owner.dispose();
  }
}
/** Successful individual checks leave whole QA unreviewed; located failures block readiness. */
export function mechanismProductionQAFailureReview(
  facts: MechanismProductionQAFacts,
  artifact: { path: string; sha256: string },
) {
  return (["mechanical", "sampled-visual"] as const).flatMap((dimension) => {
    const failures =
      dimension === "mechanical"
        ? facts.failures.mechanical
        : facts.failures.sampledVisual;
    return failures
      ? [
          {
            dimension,
            status: "failed" as const,
            binding: facts.binding,
            method:
              dimension === "mechanical"
                ? "registered-original-native-output-frame-scalars"
                : "composition-state-lint-no-rendered-pixel-or-glyph-acceptance",
            evaluatedInterval: {
              unit: "output-frame" as const,
              ...facts.semantics.interval,
            },
            evidence: [{ path: artifact.path, sha256: artifact.sha256 }],
            reviewer: {
              kind: "automated" as const,
              id: "still-shift-native-production-qa",
            },
            explanation: `${failures} located ${dimension} findings; inspect immutable QA facts/raw evidence. Whole review remains separate.`,
          },
        ]
      : [];
  });
}
