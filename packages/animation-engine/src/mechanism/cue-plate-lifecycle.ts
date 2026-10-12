import { z } from "zod";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  AnimationEngineError,
  CompositionSchema,
  MechanismHashSchema,
} from "@still-shift/scene-contract";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { loadComposition, renderComposition } from "../composition-render.ts";
import {
  readMechanismCueCompilation,
  MechanismCueCompilationSchema,
} from "./cue-lifecycle.ts";
import {
  checkMechanismCueNativePlates,
  MechanismCueNativePlatesSchema,
} from "./cue-native-plates.ts";
import { cuePlateFile, readCuePlateJson } from "./cue-plate-files.ts";
import { lowerMechanismCuePlateOverlays } from "./cue-plate-overlays.ts";
import { mechanismPackHash } from "./pack-support.ts";
import { writeMechanismJson } from "./io.ts";

const path = z.string().min(1).max(2048);
const count = z.number().int().nonnegative();
const positive = z.number().int().positive();
const duration = z.number().finite().nonnegative();
const file = z
  .object({
    path,
    bytes: count.max(512 * 1024 * 1024),
    sha256: MechanismHashSchema,
  })
  .strict();
export const MECHANISM_CUE_PLATE_EXPORT_VERSION =
  "mechanism-cue-plate-export-1" as const;
export interface MechanismCuePlateOptions {
  readonly signal?: AbortSignal | undefined;
}
export const MechanismCuePlateExportSchema = z
  .object({
    schemaVersion: z.literal(MECHANISM_CUE_PLATE_EXPORT_VERSION),
    currentCompilation: file,
    currentSource: file,
    loweredSource: file,
    originalPlateReceipt: file,
    nativePictureSha256: MechanismHashSchema,
    sequenceSha256: MechanismHashSchema,
    sceneManifest: file,
    renderResult: file,
    output: file,
  })
  .strict();
export type MechanismCuePlateExport = z.infer<
  typeof MechanismCuePlateExportSchema
>;
const row = z
  .object({
    phase: z.string(),
    type: z.string(),
    calls: count,
    submissionWallMs: duration,
  })
  .passthrough();
const submission = z
  .object({
    scope: z.literal("synchronous-submission-wall-time"),
    totalSubmissionWallMs: duration,
    byLayerType: z.array(row).min(1).max(512),
  })
  .passthrough();
const workerRender = z
  .object({
    version: z.literal("composition-submission-statistics-1"),
    scope: z.literal("synchronous-submission-wall-time"),
    byLayerType: z.array(row).min(1).max(512),
  })
  .passthrough();
const outputResult = z
  .object({
    schemaVersion: z.literal("composition-result-1"),
    status: z.literal("rendered"),
    composition: z.string(),
    fps: positive,
    frameCount: positive,
    durationMs: duration,
    outputPath: path,
    sceneManifestPath: path,
    systemFontLayers: z.array(z.string()).length(0),
    checksums: z
      .object({
        source: MechanismHashSchema,
        scene: MechanismHashSchema,
        output: MechanismHashSchema,
      })
      .strict(),
    metrics: z
      .object({
        width: positive,
        height: positive,
        frameCount: positive,
        durationMs: duration,
        sourceChecksum: MechanismHashSchema,
        sceneChecksum: MechanismHashSchema,
        sceneManifestPath: path,
        outputChecksum: MechanismHashSchema,
        frameTransport: z.literal("raw_rgba"),
        nativeObservations: z.never().optional(),
        compositionStatistics: submission.extend({
          version: z.literal("composition-export-statistics-1"),
          frameCount: positive,
          cacheEnabled: z.literal(false),
          cacheHits: z.literal(0),
          workers: z
            .array(z.object({ render: workerRender }).passthrough())
            .length(1),
        }),
        work: z
          .object({
            version: z.literal("composition-render-work-1"),
            workers: z.literal(1),
            chunkFrames: z.literal(1),
            cacheStatic: z.literal(false),
            orderedFrames: z
              .object({
                deliveredFrames: positive,
                pendingFrames: z.literal(0),
              })
              .passthrough(),
            submissionStatistics: submission,
            workersDetail: z
              .array(
                z
                  .object({
                    worker: z.literal(0),
                    result: z
                      .object({
                        worker: z.literal(0),
                        frames: z
                          .array(
                            z
                              .object({
                                index: count,
                                renderMs: duration,
                                uploadMs: duration,
                              })
                              .passthrough(),
                          )
                          .min(1)
                          .max(2000),
                        renderStatistics: workerRender,
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .length(1),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
type Receipt = z.infer<typeof MechanismCuePlateExportSchema>;
type Context = {
  familyPath: string;
  cuePath: string;
  preparedDirectory: string;
  platesDirectory: string;
  owner: CompositionNodeMemory;
  signal?: AbortSignal | undefined;
};
function failure(location: string, message: string): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-cue-plate-export",
    diagnosticCode: "mechanism-cue-plate-export-identity",
    path: location,
    nextAction:
      "Compile current cues and render into a fresh directory using verified compatible original native plates.",
  });
}
async function current(context: Context) {
  const {
    familyPath,
    cuePath,
    preparedDirectory,
    platesDirectory,
    owner,
    signal,
  } = context;
  signal?.throwIfAborted();
  const compilation = await readMechanismCueCompilation(
    familyPath,
    cuePath,
    preparedDirectory,
  );
  const currentCompilation = await cuePlateFile(
    compilation.receiptPath,
    owner,
    { signal },
  );
  const receiptBody = MechanismCueCompilationSchema.parse(
    await readCuePlateJson(
      currentCompilation.path,
      owner,
      signal,
      65536,
      currentCompilation.sha256,
    ),
  );
  if (mechanismPackHash(receiptBody) !== mechanismPackHash(compilation.receipt))
    failure(
      "currentCompilation",
      "Current compilation receipt changed during reading",
    );
  const originalPlateReceipt = await cuePlateFile(
    join(resolve(platesDirectory), "native-plates.json"),
    owner,
    { signal },
  );
  const verified = await checkMechanismCueNativePlates(
    familyPath,
    cuePath,
    preparedDirectory,
    platesDirectory,
    { signal, nodeMemory: owner },
  );
  await cuePlateFile(originalPlateReceipt.path, owner, {
    signal,
    sha256: originalPlateReceipt.sha256,
  });
  const plates = MechanismCueNativePlatesSchema.parse(
    await readCuePlateJson(
      originalPlateReceipt.path,
      owner,
      signal,
      65536,
      originalPlateReceipt.sha256,
    ),
  );
  if (
    plates.nativePictureSha256 !== verified.nativePictureSha256 ||
    plates.sequence.sha256 !== verified.sequenceSha256
  )
    failure(
      "originalPlateReceipt",
      "Original plate receipt changed after verification",
    );
  const currentSource = await cuePlateFile(
    compilation.receipt.composition.path,
    owner,
    { signal, sha256: compilation.receipt.composition.sha256 },
  );
  const loaded = await loadComposition(currentSource.path, "webgl2", {
    nodeMemory: owner,
    signal,
  });
  if (loaded.sourceChecksum !== currentSource.sha256 || !loaded.native3D)
    failure(
      "currentSource",
      "Current verified native source changed during loading",
    );
  const lowered = lowerMechanismCuePlateOverlays(
    loaded.composition,
    loaded.native3D,
    plates.sequence,
  );
  assertOrdinary(lowered);
  const finalCompilation = await readMechanismCueCompilation(
    familyPath,
    cuePath,
    preparedDirectory,
  );
  if (
    mechanismPackHash(finalCompilation.receipt) !==
    mechanismPackHash(compilation.receipt)
  )
    failure(
      "currentCompilation",
      "Current compilation changed during lowering",
    );
  for (const item of [currentCompilation, currentSource, originalPlateReceipt])
    await cuePlateFile(item.path, owner, { signal, sha256: item.sha256 });
  return {
    compilation,
    currentCompilation,
    currentSource,
    originalPlateReceipt,
    verified,
    lowered,
  };
}
function assertOrdinary(composition: z.infer<typeof CompositionSchema>) {
  if (
    composition.assets.some((a) => a.type === "native3d") ||
    composition.layers.some(
      (l) => l.type === "native3d" || l.native3D || l.overlayAfter,
    )
  )
    failure(
      "loweredSource",
      "Cached export contains a fresh native controller or binding",
    );
  const sequences = composition.layers.filter((l) => l.type === "sequence");
  if (
    sequences.length !== 1 ||
    sequences[0]!.asset !== "mechanism-native-plates"
  )
    failure(
      "loweredSource",
      "Cached export requires exactly one retained native sequence",
    );
}
function nativeSubmissionCalls(result: z.infer<typeof outputResult>) {
  const { compositionStatistics: stats, work } = result.metrics;
  const measured = work.workersDetail[0]!.result;
  if (
    stats.frameCount !== result.frameCount ||
    work.orderedFrames.deliveredFrames !== result.frameCount ||
    measured.frames.length !== result.frameCount ||
    measured.frames.some((frame, index) => frame.index !== index)
  )
    failure(
      "metrics.work",
      "Cached export omitted ordered worker frame measurements",
    );
  if (
    mechanismPackHash(measured.renderStatistics) !==
      mechanismPackHash(stats.workers[0]!.render) ||
    mechanismPackHash(stats.byLayerType) !==
      mechanismPackHash(work.submissionStatistics.byLayerType) ||
    stats.totalSubmissionWallMs !==
      work.submissionStatistics.totalSubmissionWallMs
  )
    failure(
      "metrics.compositionStatistics",
      "Cached worker and aggregate submission measurements differ",
    );
  const totals = new Map<string, { calls: number; submissionWallMs: number }>();
  for (const item of measured.renderStatistics.byLayerType) {
    const key = JSON.stringify([item.phase, item.type]);
    const prior = totals.get(key) ?? { calls: 0, submissionWallMs: 0 };
    prior.calls += item.calls;
    prior.submissionWallMs += item.submissionWallMs;
    totals.set(key, prior);
  }
  const seen = new Set<string>();
  for (const item of stats.byLayerType) {
    const key = JSON.stringify([item.phase, item.type]),
      actual = totals.get(key);
    if (
      seen.has(key) ||
      !actual ||
      item.calls !== actual.calls ||
      item.submissionWallMs !== actual.submissionWallMs
    )
      failure(
        "metrics.compositionStatistics",
        "Cached aggregate does not match measured worker calls",
      );
    seen.add(key);
  }
  if (
    seen.size !== totals.size ||
    stats.totalSubmissionWallMs !==
      stats.byLayerType.reduce((sum, item) => sum + item.submissionWallMs, 0)
  )
    failure(
      "metrics.compositionStatistics",
      "Cached submission totals are incomplete",
    );
  const calls = measured.renderStatistics.byLayerType
    .filter((item) => item.type === "native-depth" || item.type === "native3d")
    .reduce((sum, item) => sum + item.calls, 0);
  if (calls !== 0)
    failure("metrics.native", "Cached export submitted fresh native work");
  return calls;
}
async function videoFacts(
  output: string,
  compilation: z.infer<typeof MechanismCueCompilationSchema>,
  signal?: AbortSignal,
) {
  const probe = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,nb_read_frames,avg_frame_rate",
      "-of",
      "json",
      output,
    ],
    { signal },
  );
  const value = z
    .object({
      streams: z
        .array(
          z
            .object({
              width: positive,
              height: positive,
              nb_read_frames: z.string(),
              avg_frame_rate: z.string(),
            })
            .passthrough(),
        )
        .length(1),
    })
    .parse(JSON.parse(probe.stdout));
  const actual = value.streams[0]!,
    rate = actual.avg_frame_rate.split("/").map(Number);
  if (
    actual.width !== compilation.width ||
    actual.height !== compilation.height ||
    Number(actual.nb_read_frames) !== compilation.frameCount ||
    rate.length !== 2 ||
    !rate.every((n) => Number.isFinite(n) && n > 0) ||
    rate[0] !== compilation.fps * rate[1]!
  )
    failure(
      "output.video",
      "Actual cached video facts differ from current compilation",
    );
  return actual;
}
async function verify(receipt: Receipt, outputPath: string, context: Context) {
  const { owner, signal } = context;
  const directory = dirname(outputPath);
  for (const [key, expected] of Object.entries({
    loweredSource: join(directory, "plate-composition.json"),
    sceneManifest: outputPath + ".scene.json",
    renderResult: outputPath + ".result.json",
    output: outputPath,
    currentCompilation: join(
      resolve(context.preparedDirectory),
      "cue-compilation.json",
    ),
    currentSource: join(resolve(context.preparedDirectory), "composition.json"),
    originalPlateReceipt: join(
      resolve(context.platesDirectory),
      "native-plates.json",
    ),
  }))
    if (
      receipt[
        key as keyof Pick<
          Receipt,
          | "loweredSource"
          | "sceneManifest"
          | "renderResult"
          | "output"
          | "currentCompilation"
          | "currentSource"
          | "originalPlateReceipt"
        >
      ].path !== expected
    )
      failure(key, "Cached receipt does not name its owning artifact");
  for (const item of [
    receipt.currentCompilation,
    receipt.currentSource,
    receipt.loweredSource,
    receipt.originalPlateReceipt,
    receipt.sceneManifest,
    receipt.renderResult,
    receipt.output,
  ]) {
    const actual = await cuePlateFile(item.path, owner, {
      signal,
      sha256: item.sha256,
    });
    if (actual.bytes !== item.bytes)
      failure(item.path, "Cached receipt byte count changed");
  }
  const value = await current(context);
  if (
    mechanismPackHash(value.currentCompilation) !==
      mechanismPackHash(receipt.currentCompilation) ||
    mechanismPackHash(value.currentSource) !==
      mechanismPackHash(receipt.currentSource) ||
    mechanismPackHash(value.originalPlateReceipt) !==
      mechanismPackHash(receipt.originalPlateReceipt) ||
    value.verified.nativePictureSha256 !== receipt.nativePictureSha256 ||
    value.verified.sequenceSha256 !== receipt.sequenceSha256
  )
    failure(
      "sourceEdges",
      "Cached export source edges no longer match current cues and original plates",
    );
  const lowered = CompositionSchema.parse(
    await readCuePlateJson(
      receipt.loweredSource.path,
      owner,
      signal,
      undefined,
      receipt.loweredSource.sha256,
    ),
  );
  assertOrdinary(lowered);
  if (mechanismPackHash(lowered) !== mechanismPackHash(value.lowered))
    failure(
      "loweredSource",
      "Cached composition differs from current independently lowered overlays",
    );
  const loaded = await loadComposition(receipt.loweredSource.path, "webgl2", {
    nodeMemory: owner,
    signal,
  });
  if (
    loaded.sourceChecksum !== receipt.loweredSource.sha256 ||
    loaded.preparedNative3D ||
    loaded.native3D
  )
    failure(
      "loweredSource",
      "Cached source loaded fresh native resources or changed",
    );
  const manifest = z
    .object({
      schemaVersion: z.literal("composition-render-1"),
      sourcePath: path,
      sourceChecksum: MechanismHashSchema,
      scene: z.unknown(),
      assetPaths: z.record(z.string(), z.string()),
    })
    .passthrough()
    .parse(
      await readCuePlateJson(
        receipt.sceneManifest.path,
        owner,
        signal,
        undefined,
        receipt.sceneManifest.sha256,
      ),
    );
  if (
    manifest.sourcePath !== receipt.loweredSource.path ||
    manifest.sourceChecksum !== receipt.loweredSource.sha256 ||
    mechanismPackHash(manifest.scene) !== mechanismPackHash(loaded.scene) ||
    mechanismPackHash(manifest.assetPaths) !==
      mechanismPackHash(loaded.assetPaths)
  )
    failure(
      "sceneManifest",
      "Cached scene does not match its actually loaded ordinary source and dependencies",
    );
  const result = outputResult.parse(
    await readCuePlateJson(
      receipt.renderResult.path,
      owner,
      signal,
      undefined,
      receipt.renderResult.sha256,
    ),
  );
  const compilation = value.compilation.receipt;
  if (
    result.composition !== lowered.id ||
    result.outputPath !== outputPath ||
    result.sceneManifestPath !== receipt.sceneManifest.path ||
    result.checksums.source !== receipt.loweredSource.sha256 ||
    result.checksums.scene !== receipt.sceneManifest.sha256 ||
    result.checksums.output !== receipt.output.sha256 ||
    result.metrics.sourceChecksum !== receipt.loweredSource.sha256 ||
    result.metrics.sceneChecksum !== receipt.sceneManifest.sha256 ||
    result.metrics.sceneManifestPath !== receipt.sceneManifest.path ||
    result.metrics.outputChecksum !== receipt.output.sha256 ||
    result.frameCount !== compilation.frameCount ||
    result.metrics.frameCount !== compilation.frameCount ||
    result.fps !== compilation.fps ||
    result.metrics.width !== compilation.width ||
    result.metrics.height !== compilation.height ||
    result.durationMs !== (compilation.frameCount * 1000) / compilation.fps ||
    result.metrics.durationMs !== result.durationMs
  )
    failure(
      "renderResult",
      "Cached result source, scene, output or current clock facts changed",
    );
  const freshNativeSubmissionCalls = nativeSubmissionCalls(result);
  const video = await videoFacts(outputPath, compilation, signal);
  // Full original replay/probe may take time: recheck every edge and final body after them.
  const final = await readMechanismCueCompilation(
    context.familyPath,
    context.cuePath,
    context.preparedDirectory,
  );
  if (mechanismPackHash(final.receipt) !== mechanismPackHash(compilation))
    failure(
      "currentCompilation",
      "Current cues changed during output verification",
    );
  for (const item of [
    receipt.currentCompilation,
    receipt.currentSource,
    receipt.loweredSource,
    receipt.originalPlateReceipt,
    receipt.sceneManifest,
    receipt.renderResult,
    receipt.output,
  ])
    await cuePlateFile(item.path, owner, { signal, sha256: item.sha256 });
  return {
    freshNativeSubmissionCalls,
    originalNativeFrames: value.verified.originalNativeFrames,
    originalNativePasses: value.verified.originalNativePasses,
    reusedPlateFrames: compilation.frameCount,
    video,
  };
}
/** Export current ordinary screen overlays and audio onto independently verified original native plates. */
export async function renderMechanismCuePlateProject(
  familyPath: string,
  cuePath: string,
  preparedDirectory: string,
  platesDirectory: string,
  outputDirectory: string,
  options: MechanismCuePlateOptions = {},
) {
  const owner = new CompositionNodeMemory(),
    directory = resolve(outputDirectory);
  const context: Context = {
    familyPath,
    cuePath,
    preparedDirectory,
    platesDirectory,
    owner,
    signal: options.signal,
  };
  let created = false,
    published = false;
  try {
    const value = await current(context);
    await mkdir(dirname(directory), { recursive: true });
    await mkdir(directory);
    created = true;
    const loweredSourcePath = join(directory, "plate-composition.json"),
      outputPath = join(directory, "output.mp4");
    await writeMechanismJson(loweredSourcePath, value.lowered);
    const rendered = await renderComposition({
      compositionPath: loweredSourcePath,
      nodeMemory: owner,
      outputPath,
      signal: options.signal,
      backend: "webgl2",
      transport: "raw_rgba",
      workers: 1,
      cacheStatic: false,
      validateSourceEdges: async () => {
        const final = await current(context);
        if (
          mechanismPackHash(final.currentCompilation) !==
            mechanismPackHash(value.currentCompilation) ||
          mechanismPackHash(final.originalPlateReceipt) !==
            mechanismPackHash(value.originalPlateReceipt)
        )
          failure(
            "sourceEdges",
            "Current cues or original plates changed before cached output publication",
          );
      },
    });
    const receipt = MechanismCuePlateExportSchema.parse({
      schemaVersion: MECHANISM_CUE_PLATE_EXPORT_VERSION,
      currentCompilation: value.currentCompilation,
      currentSource: value.currentSource,
      loweredSource: await cuePlateFile(loweredSourcePath, owner, {
        signal: options.signal,
      }),
      originalPlateReceipt: value.originalPlateReceipt,
      nativePictureSha256: value.verified.nativePictureSha256,
      sequenceSha256: value.verified.sequenceSha256,
      sceneManifest: await cuePlateFile(rendered.sceneManifestPath, owner, {
        signal: options.signal,
      }),
      renderResult: await cuePlateFile(outputPath + ".result.json", owner, {
        signal: options.signal,
      }),
      output: await cuePlateFile(outputPath, owner, { signal: options.signal }),
    });
    const checked = await verify(receipt, outputPath, context);
    options.signal?.throwIfAborted();
    const receiptPath = outputPath + ".cue-plate-export.json";
    await writeMechanismJson(receiptPath, receipt);
    published = true;
    return {
      ...rendered,
      schemaVersion: "mechanism-cue-plate-render-result-1" as const,
      receiptPath,
      ...checked,
      scope:
        "current-revision-ordinary-overlays-and-audio-with-original-native-plate-proof",
    };
  } finally {
    owner.dispose();
    if (created && !published)
      await rm(directory, { recursive: true, force: true });
  }
}
/** Verify final ordinary output, current overlays, actual submission counters and original capture evidence independently. */
export async function checkMechanismCuePlateOutput(
  familyPath: string,
  cuePath: string,
  preparedDirectory: string,
  platesDirectory: string,
  outputPath: string,
  options: MechanismCuePlateOptions = {},
) {
  const owner = new CompositionNodeMemory(),
    actualPath = resolve(outputPath);
  try {
    const receiptPath = actualPath + ".cue-plate-export.json";
    const receiptFile = await cuePlateFile(receiptPath, owner, {
      signal: options.signal,
    });
    const receipt = MechanismCuePlateExportSchema.parse(
      await readCuePlateJson(
        receiptPath,
        owner,
        options.signal,
        65536,
        receiptFile.sha256,
      ),
    );
    const checked = await verify(receipt, actualPath, {
      familyPath,
      cuePath,
      preparedDirectory,
      platesDirectory,
      owner,
      signal: options.signal,
    });
    await cuePlateFile(receiptPath, owner, {
      signal: options.signal,
      sha256: receiptFile.sha256,
    });
    return {
      schemaVersion: "mechanism-cue-plate-check-result-1" as const,
      status: "passed" as const,
      outputPath: actualPath,
      outputSha256: receipt.output.sha256,
      nativePictureSha256: receipt.nativePictureSha256,
      sequenceSha256: receipt.sequenceSha256,
      ...checked,
      scope:
        "current-overlays-final-video-and-measured-zero-new-native-submissions-with-original-capture-proof",
      remainingQa:
        "Visual, listening, whole resource and pilot acceptance remain separate gates.",
    };
  } finally {
    owner.dispose();
  }
}
