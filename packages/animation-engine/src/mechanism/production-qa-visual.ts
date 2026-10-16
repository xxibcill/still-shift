import {
  mechanismCueSpeechCaption,
  mechanismCueSpeechSourceHash,
} from "./cue-speech-caption.ts";
import { dirname, join, resolve } from "node:path";
import {
  CompositionSchema,
  type Composition,
  type MechanismNarratedCycle,
} from "@still-shift/scene-contract";
import {
  CompositionNodeMemory,
  compositionNodeJsonSize,
} from "@still-shift/execution-runtime/export";
import type { CompositionQualityPolicy } from "@still-shift/renderer-core";
import { lintCompositionFile } from "../composition-lint.ts";
import { MechanismCuePlateExportSchema } from "./cue-plate-lifecycle.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import {
  productionFailure,
  productionOwnedPath,
  readProductionJSON,
} from "./production-queue-files.ts";

export function mechanismProductionVisualPolicy(
  composition: Composition,
  document: MechanismNarratedCycle,
): CompositionQualityPolicy {
  const cues = new Map(
    document.cues.map((c, index) => [c.id, { cue: c, index }]),
  );
  const sourceSha256 = mechanismCueSpeechSourceHash(document);
  const text = composition.layers.filter(
    (l) =>
      l.type === "text" &&
      typeof l.text === "string" &&
      l.text.length &&
      typeof l.metadata?.cue === "string",
  );
  const speechCaptions: NonNullable<
    CompositionQualityPolicy["speechCaptions"]
  > = [];
  const readingDeclarations: NonNullable<
    CompositionQualityPolicy["readingDeclarations"]
  > = [];
  for (const [index, layer] of text.entries()) {
    if (layer.type !== "text" || typeof layer.text !== "string") continue;
    const selected = cues.get(String(layer.metadata?.cue));
    if (!selected)
      throw Error("Production text references an absent authored cue");
    const { cue, index: cueIndex } = selected;
    const frame = (sample: number) =>
      Number((BigInt(sample) * BigInt(document.output.fps) + 47999n) / 48000n);
    const start = frame(cue.startSample),
      end = frame(cue.endSampleExclusive);
    const caption = layer.metadata?.track === "caption";
    const expected = caption ? cue.text : layer.text;
    if (!caption)
      readingDeclarations.push({
        id: "cue-reading-" + index,
        purpose: "Read overlay for cue " + cue.id,
        start,
        end,
        members: [
          {
            layer: layer.id,
            text: expected,
            kind: "value",
            locale: document.locale,
          },
        ],
      });
    if (caption)
      speechCaptions.push(
        mechanismCueSpeechCaption(document, cueIndex, layer.id, sourceSha256),
      );
  }
  return {
    readingDeclarations,
    speechCaptions,
    intentionalCuts: document.cues
      .filter((c) => c.editing === "cut")
      .map((c) =>
        Number(
          (BigInt(c.startSample) * BigInt(document.output.fps) + 47999n) /
            48000n,
        ),
      ),
    shots: document.cues.map((c, i) => ({
      id: c.id,
      start: Number(
        (BigInt(c.startSample) * BigInt(document.output.fps) + 47999n) / 48000n,
      ),
      end: Number(
        (BigInt(
          document.cues[i + 1]?.startSample ?? document.narration.sampleCount,
        ) *
          BigInt(document.output.fps) +
          47999n) /
          48000n,
      ),
    })),
  };
}

/** Check the authenticated cached-plate source; all original 3D capture identities remain intact. */
export async function evaluateMechanismProductionVisualQA(input: {
  outputRoot: string;
  video: { path: string; sha256: string };
  expectedComposition: { path: string; sha256: string };
  expectedNativeReceipt: { path: string; sha256: string };
  document: MechanismNarratedCycle;
  nodeMemory: CompositionNodeMemory;
  signal?: AbortSignal | undefined;
}) {
  const owner = new CompositionNodeMemory(input.nodeMemory);
  let receipt:
    | Awaited<
        ReturnType<
          typeof readProductionJSON<
            typeof MechanismCuePlateExportSchema._output
          >
        >
      >
    | undefined;
  let source:
    | Awaited<ReturnType<typeof readProductionJSON<Composition>>>
    | undefined;
  try {
    const videoPath = await productionOwnedPath(
      input.outputRoot,
      input.video.path,
    );
    const videoFile = await cuePlateFile(videoPath, owner, {
      sha256: input.video.sha256,
      signal: input.signal,
    });
    receipt = await readProductionJSON(
      videoPath + ".cue-plate-export.json",
      MechanismCuePlateExportSchema,
      owner,
      65536,
      input.signal,
    );
    const expected = receipt.value;
    if (
      expected.output.bytes !== videoFile.bytes ||
      expected.output.path !== videoPath ||
      expected.output.sha256 !== input.video.sha256 ||
      expected.currentSource.path !== resolve(input.expectedComposition.path) ||
      expected.currentSource.sha256 !== input.expectedComposition.sha256 ||
      expected.originalPlateReceipt.path !==
        resolve(input.outputRoot, input.expectedNativeReceipt.path) ||
      expected.originalPlateReceipt.sha256 !==
        input.expectedNativeReceipt.sha256 ||
      expected.loweredSource.path !==
        join(dirname(videoPath), "plate-composition.json")
    )
      productionFailure(
        "production-visual-source-binding",
        "Visual QA source differs from the authenticated cached export",
        videoPath,
      );
    const sourcePath = await productionOwnedPath(
      input.outputRoot,
      expected.loweredSource.path,
    );
    source = await readProductionJSON(
      sourcePath,
      CompositionSchema,
      owner,
      32 * 1024 * 1024,
      input.signal,
    );
    if (
      source.sha256 !== expected.loweredSource.sha256 ||
      source.value.width !== input.document.output.width ||
      source.value.height !== input.document.output.height ||
      source.value.fps !== input.document.output.fps ||
      source.value.frameCount !==
        Number(
          (BigInt(input.document.narration.sampleCount) *
            BigInt(input.document.output.fps) +
            47999n) /
            48000n,
        ) ||
      !source.value.assets.some((a) => a.type === "sequence") ||
      source.value.assets.some((a) => a.type === "native3d") ||
      source.value.layers.some(
        (l) => l.type === "native3d" || l.native3D !== undefined,
      ) ||
      source.value.precomps?.length
    )
      productionFailure(
        "production-visual-plate-source",
        "Visual QA requires the verified flat cached-plate composition without native bindings",
        sourcePath,
      );
    const policy = mechanismProductionVisualPolicy(
      source.value,
      input.document,
    );
    const quality = await lintCompositionFile(sourcePath, policy, {
      backend: "webgl2",
      pixels: true,
      collectTextBounds: true,
      collectStatistics: true,
      nodeMemory: owner,
      signal: input.signal,
    });
    compositionNodeJsonSize(quality, 0, "", 8 * 1024 * 1024);
    if (
      !quality.textBounds ||
      !quality.renderStatistics ||
      !quality.measured.pixels ||
      !quality.measured.textBounds
    )
      productionFailure(
        "production-visual-measurement-missing",
        "Rendered production QA requires actual pixels, glyph bounds and submission counters",
        sourcePath,
      );
    const nativeRows = quality.renderStatistics.byLayerType.filter((r) =>
      r.type.startsWith("native3d"),
    );
    const nativeSubmissionCalls = nativeRows.reduce((n, r) => n + r.calls, 0);
    if (nativeSubmissionCalls !== 0)
      productionFailure(
        "production-visual-native-submission",
        "Cached visual QA unexpectedly submitted fresh native geometry",
        sourcePath,
      );
    await cuePlateFile(videoPath, owner, {
      sha256: input.video.sha256,
      signal: input.signal,
    });
    await cuePlateFile(sourcePath, owner, {
      sha256: source.sha256,
      signal: input.signal,
    });
    await cuePlateFile(videoPath + ".cue-plate-export.json", owner, {
      sha256: receipt.sha256,
      signal: input.signal,
    });
    const stableQuality = { ...quality };
    delete stableQuality.renderStatistics;
    return {
      method:
        "all-output-frame-cached-plate-preview-pixels-and-measured-glyphs" as const,
      source: { path: sourcePath, sha256: source.sha256 },
      exportReceipt: {
        path: videoPath + ".cue-plate-export.json",
        sha256: receipt.sha256,
      },
      frameCount: source.value.frameCount,
      nativeSubmissionCalls,
      nativeRows: nativeRows.map(({ phase, type, calls }) => ({
        phase,
        type,
        calls,
      })),
      policy,
      speechSourceSha256: mechanismCueSpeechSourceHash(input.document),
      textBounds: quality.textBounds,
      quality: stableQuality,
    };
  } finally {
    source?.release();
    receipt?.release();
    owner.dispose();
  }
}
