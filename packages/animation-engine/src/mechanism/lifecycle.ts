import { mkdir, readFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import {
  AnimationEngineError,
  MechanismSidecarSchema,
  type MechanismShot,
  type MechanismSidecar,
  type MechanismRoute,
  type MechanismRouteSelection,
} from "@still-shift/scene-contract";
import {
  evaluateMechanismFrame,
  prepareMechanismScene,
} from "@still-shift/renderer-core";
import {
  captureMechanismPlates,
  type MechanismCaptureResult,
} from "./capture.ts";
import {
  readMechanismEpisode,
  readMechanismJson,
  writeMechanismJson,
  mechanismContentHash,
  mechanismHash,
  type LoadedMechanismEpisode,
  type MechanismFinding,
} from "./io.ts";
import {
  compileMechanismComposition,
  checkMechanismOverlays,
  mechanismOverlayQualityPolicy,
} from "./overlays.ts";
import { renderComposition } from "../composition-render.ts";
import { lintCompositionFile } from "../composition-lint.ts";
import { checkMechanismFrames } from "./assertions.ts";
import { createMechanismCommandReceipt } from "./protocol.ts";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import {
  verifyMechanismFinalAudio,
  type MechanismFinalAudioReport,
} from "./audio-verification.ts";

import {
  selectMechanismRoute,
  followPreparedMechanismRoute,
  mechanismRouteBackend,
  recordedMechanismRoute,
} from "./route.ts";
import {
  prepareNativeMechanismEpisode,
  renderNativeMechanismEpisode,
  checkNativeMechanismEpisode,
  type NativePreparedMechanismEpisode,
} from "./native-lifecycle.ts";
import { previewNativeMechanismEpisode } from "./native-preview.ts";

export type MechanismPreparationOptions = {
  outputDirectory: string;
  signal?: AbortSignal;
  cacheDirectory?: string;
  route?: MechanismRoute;
  backend?: "canvas2d" | "webgl2";
};
function located(code: string, message: string, path: string): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-lifecycle",
    diagnosticCode: code,
    path,
    nextAction:
      "episode inspect --input <episode.json>; episode deps --input <episode.json>",
  });
}
function frameRequest(
  loaded: LoadedMechanismEpisode,
  shot: MechanismShot,
  frame: number,
) {
  return {
    frame,
    width: loaded.episode.output.width,
    height: loaded.episode.output.height,
    ...(shot.camera ? { camera: shot.camera } : {}),
    ...(shot.cameraKeys ? { cameraKeys: shot.cameraKeys } : {}),
    controls: shot.controls,
    hiddenParts: shot.hiddenParts,
  };
}
function captureFont(loaded: LoadedMechanismEpisode) {
  const definition = loaded.episode.dependencies
    .filter((item) => item.type === "font")
    .find((item) => item.id === loaded.episode.font)!;
  return {
    path: loaded.dependencyPaths[definition.id]!,
    sha256: definition.sha256,
    weight: definition.weight ?? "600",
    family: definition.family ?? "Pinned mechanism font",
  };
}
export async function previewMechanismEpisode(
  path: string,
  options: MechanismPreparationOptions & { frame: number },
) {
  const loaded = await readMechanismEpisode(path);
  const selection = selectMechanismRoute(loaded.episode, options.route);
  mechanismRouteBackend(selection, options.backend);
  if (selection.effectiveRoute === "native3d")
    return previewNativeMechanismEpisode(loaded, options, selection);
  const shot = loaded.episode.shots.find(
    (item) =>
      options.frame >= item.startFrame &&
      options.frame < item.endFrameExclusive,
  );
  if (!shot || !Number.isInteger(options.frame))
    located(
      "mechanism-frame-range",
      "Preview frame must be an integer inside the episode",
      path,
    );
  const prepared = prepareMechanismScene(loaded.scene),
    frame = evaluateMechanismFrame(
      prepared,
      frameRequest(loaded, shot, options.frame),
    );
  const capture = await captureMechanismPlates({
    scene: loaded.scene,
    width: loaded.episode.output.width,
    height: loaded.episode.output.height,
    frames: [frame],
    font: captureFont(loaded),
    fps: loaded.episode.output.fps,
    shotId: shot.id,
    outputDirectory: resolve(options.outputDirectory),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.cacheDirectory
      ? { cacheDirectory: options.cacheDirectory }
      : {}),
  });
  return {
    ...capture,
    projectHash: loaded.projectHash,
    sourceFrame: options.frame,
    shotId: shot.id,
  };
}
export type PreparedMechanismEpisode = {
  schemaVersion: "mechanism-prepared-episode-1";
  projectHash: string;
  sourcePath: string;
  outputDirectory: string;
  compositionPath: string;
  captures: (MechanismCaptureResult & { shotId: string })[];
  cacheHits: number;
  new3dRenders: number;
  wallSeconds: number;
  receiptPath: string;
  routeSelection?: MechanismRouteSelection;
};
export type MechanismPreparationResult =
  | PreparedMechanismEpisode
  | NativePreparedMechanismEpisode;
/** Clean plates are keyed only by physical inputs. Native copy/layout lives downstream. */
export async function prepareMechanismEpisode(
  path: string,
  options: MechanismPreparationOptions,
): Promise<MechanismPreparationResult> {
  const loaded = await readMechanismEpisode(path);
  const selection = selectMechanismRoute(loaded.episode, options.route);
  mechanismRouteBackend(selection, options.backend);
  if (selection.effectiveRoute === "native3d")
    return prepareNativeMechanismEpisode(loaded, options, selection);
  const outputDirectory = resolve(options.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const release = await acquireArtifactLock(
    join(outputDirectory, ".prepare.lock"),
    outputDirectory,
  );
  try {
    return await prepareMechanismEpisodeLocked(path, options);
  } finally {
    await release();
  }
}
async function prepareMechanismEpisodeLocked(
  path: string,
  options: MechanismPreparationOptions,
): Promise<PreparedMechanismEpisode> {
  const started = performance.now(),
    loaded = await readMechanismEpisode(path),
    outputDirectory = resolve(options.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  options.signal?.throwIfAborted();
  const prepared = prepareMechanismScene(loaded.scene),
    captures: PreparedMechanismEpisode["captures"] = [];
  for (const shot of loaded.episode.shots) {
    options.signal?.throwIfAborted();
    const frames = Array.from(
      { length: shot.endFrameExclusive - shot.startFrame },
      (_, index) =>
        evaluateMechanismFrame(
          prepared,
          frameRequest(loaded, shot, shot.startFrame + index),
        ),
    );
    const identity = mechanismContentHash({
      scene: loaded.scene,
      frames,
      output: loaded.episode.output,
      font: captureFont(loaded).sha256,
      shotId: shot.id,
    }).slice(7);
    const capture = await captureMechanismPlates({
      scene: loaded.scene,
      width: loaded.episode.output.width,
      height: loaded.episode.output.height,
      frames,
      font: captureFont(loaded),
      fps: loaded.episode.output.fps,
      shotId: shot.id,
      outputDirectory: join(outputDirectory, "plates", identity),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.cacheDirectory
        ? { cacheDirectory: options.cacheDirectory }
        : {}),
    });
    captures.push({ ...capture, shotId: shot.id });
  }
  const descriptors = await Promise.all(
    captures.map(async (capture) => ({
      ...capture,
      frames: capture.frames.map((frame) => frame.sha256),
      pattern: relative(outputDirectory, capture.patternPath),
      sequenceManifestPath: relative(
        outputDirectory,
        capture.sequenceManifestPath,
      ),
      sequenceSha256: capture.sequenceManifestSha256,
      sidecar: MechanismSidecarSchema.parse(
        await readMechanismJson(capture.sidecarPath),
      ),
    })),
  );
  const composition = compileMechanismComposition(loaded, descriptors),
    compositionPath = join(
      outputDirectory,
      `composition-r${loaded.episode.revision}-${loaded.projectHash.slice(7, 19)}.json`,
    );
  // Font/audio references are project-relative in source and explicitly rebased for this preparation directory.
  for (const asset of composition.assets)
    if (asset.type === "font" || asset.type === "audio") {
      const actual = loaded.dependencyPaths[asset.id];
      if (actual) asset.path = relative(outputDirectory, actual);
    }
  await writeMechanismJson(compositionPath, composition, { replace: true });
  const receiptPath = join(outputDirectory, "prepared.receipt.json"),
    result: PreparedMechanismEpisode = {
      schemaVersion: "mechanism-prepared-episode-1",
      projectHash: loaded.projectHash,
      sourcePath: loaded.sourcePath,
      outputDirectory,
      compositionPath,
      captures,
      cacheHits: captures.reduce((sum, item) => sum + item.cacheHits, 0),
      new3dRenders: captures.reduce((sum, item) => sum + item.new3dRenders, 0),
      wallSeconds: (performance.now() - started) / 1000,
      receiptPath,
      ...recordedMechanismRoute(
        selectMechanismRoute(loaded.episode, options.route),
      ),
    };
  await writeMechanismJson(receiptPath, result, { replace: true });
  return result;
}
export const compileMechanismEpisode = prepareMechanismEpisode;
export async function checkMechanismEpisode(
  path: string,
  options: {
    preparedDirectory?: string;
    finalOutput?: string;
    signal?: AbortSignal;
    route?: MechanismRoute;
  } = {},
) {
  options.signal?.throwIfAborted();
  const started = performance.now();
  const loaded = await readMechanismEpisode(path);
  const recorded = options.preparedDirectory
    ? ((await readMechanismJson(
        join(options.preparedDirectory, "prepared.receipt.json"),
      )) as {
        routeSelection?: MechanismRouteSelection;
        schemaVersion?: string;
      })
    : undefined;
  const selection = recorded
    ? followPreparedMechanismRoute(
        loaded.episode,
        recorded.routeSelection,
        options.route,
      )
    : selectMechanismRoute(loaded.episode, options.route);
  if (selection.effectiveRoute === "native3d")
    return checkNativeMechanismEpisode(loaded, options);
  const prepared = prepareMechanismScene(loaded.scene),
    findings: MechanismFinding[] = [];
  const rows = loaded.episode.shots.flatMap((shot) =>
    Array.from(
      { length: shot.endFrameExclusive - shot.startFrame },
      (_, index) => {
        const request = frameRequest(loaded, shot, shot.startFrame + index);
        return {
          shotId: shot.id,
          request,
          frame: evaluateMechanismFrame(prepared, request),
        };
      },
    ),
  );
  const mechanical = checkMechanismFrames(loaded.scene, rows),
    checkedFrames = mechanical.checkedFrames;
  findings.push(
    ...mechanical.findings.map((finding) => ({
      ...finding,
      frame: finding.frames[0],
      shot: finding.shotId,
      message:
        "Observed mechanism state differs from independent authored expectation",
    })),
  );
  let overlayReport: ReturnType<typeof checkMechanismOverlays> | undefined,
    qualityReport: Awaited<ReturnType<typeof lintCompositionFile>> | undefined,
    preparedCompositionPath: string | undefined;
  if (options.preparedDirectory) {
    const receipt = (await readMechanismJson(
      join(options.preparedDirectory, "prepared.receipt.json"),
    )) as PreparedMechanismEpisode;
    if (
      receipt.schemaVersion !== "mechanism-prepared-episode-1" ||
      receipt.projectHash !== loaded.projectHash
    )
      located(
        "mechanism-stale-preparation",
        "Prepared output belongs to another episode revision",
        options.preparedDirectory,
      );
    const sidecars: { shotId: string; sidecar: MechanismSidecar }[] = [];
    for (const capture of receipt.captures) {
      options.signal?.throwIfAborted();
      const sidecarPath = resolve(
          options.preparedDirectory,
          capture.sidecarPath,
        ),
        captureDirectory = resolve(
          options.preparedDirectory,
          capture.outputDirectory,
        );
      if (mechanismHash(await readFile(sidecarPath)) !== capture.sidecarSha256)
        located(
          "mechanism-stale-sidecar",
          "Sidecar content differs from its receipt",
          capture.sidecarPath,
        );
      const sidecar = MechanismSidecarSchema.parse(
        await readMechanismJson(sidecarPath),
      );
      if (
        sidecar.sceneSha256 !== mechanismContentHash(loaded.scene) ||
        sidecar.geometrySha256 !== loaded.scene.geometrySha256
      )
        located(
          "mechanism-stale-sidecar",
          "Sidecar does not match current scene/geometry",
          capture.sidecarPath,
        );
      for (const [index, plate] of capture.frames.entries())
        if (
          mechanismHash(await readFile(join(captureDirectory, plate.path))) !==
            plate.sha256 ||
          sidecar.frames[index]?.plateSha256 !== plate.sha256
        )
          located(
            "mechanism-stale-sidecar",
            "Plate/sidecar hashes do not match",
            plate.path,
          );
      sidecars.push({ shotId: capture.shotId, sidecar });
    }
    preparedCompositionPath = resolve(
      options.preparedDirectory,
      receipt.compositionPath,
    );
    qualityReport = await lintCompositionFile(
      preparedCompositionPath,
      {
        ...mechanismOverlayQualityPolicy(loaded.episode, sidecars),
        shots: loaded.episode.shots.map((shot) => ({
          id: shot.id,
          start: shot.startFrame,
          end: shot.endFrameExclusive,
        })),
        intentionalCuts: loaded.episode.shots.map((shot) => shot.startFrame),
      },
      {
        pixels: true,
        backend: "canvas2d",
        collectTextBounds: true,
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    overlayReport = checkMechanismOverlays(
      loaded.episode,
      sidecars,
      "textBounds" in qualityReport && qualityReport.textBounds
        ? { textBounds: qualityReport.textBounds }
        : {},
    );
  }
  let finalProbe: unknown, audioReport: MechanismFinalAudioReport | undefined;
  if (options.finalOutput) {
    if (!preparedCompositionPath)
      located(
        "mechanism-final-preparation",
        "A final artifact check requires its current prepared source",
        "preparedDirectory",
      );
    const finalPath = resolve(options.finalOutput);
    const renderReceipt = (await readMechanismJson(
      `${finalPath}.result.json`,
    )) as {
      schemaVersion?: string;
      status?: string;
      checksums?: { source?: string; scene?: string; output?: string };
    };
    const actualSource = mechanismHash(await readFile(preparedCompositionPath));
    const actualOutput = mechanismHash(await readFile(finalPath));
    const actualScene = mechanismHash(
      await readFile(`${finalPath}.scene.json`),
    );
    if (
      renderReceipt.schemaVersion !== "composition-result-1" ||
      renderReceipt.status !== "rendered" ||
      renderReceipt.checksums?.source !== actualSource ||
      renderReceipt.checksums?.output !== actualOutput ||
      renderReceipt.checksums?.scene !== actualScene
    )
      findings.push({
        code: "mechanism-final-association",
        path: options.finalOutput,
        message:
          "Selected final bytes and render evidence must match the current prepared composition; old revisions or swapped deliveries are not accepted",
      });
    const probe = await runProcess(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        resolve(options.finalOutput),
      ],
      { signal: options.signal },
    );
    finalProbe = JSON.parse(probe.stdout);
    const streams = (
        finalProbe as {
          streams: {
            codec_type: string;
            nb_read_frames?: string;
            width?: number;
            height?: number;
            duration?: string;
            r_frame_rate?: string;
          }[];
        }
      ).streams,
      video = streams.find((item) => item.codec_type === "video");
    if (
      !video ||
      Number(video.nb_read_frames) !== loaded.episode.output.frameCount ||
      video.width !== loaded.episode.output.width ||
      video.height !== loaded.episode.output.height ||
      video.r_frame_rate !== `${loaded.episode.output.fps}/1`
    )
      findings.push({
        code: "mechanism-final-video",
        path: options.finalOutput,
        message:
          "Decoded final video does not match authored size/rate/frame count",
      });
    if (
      loaded.episode.audio &&
      !streams.some((item) => item.codec_type === "audio")
    )
      findings.push({
        code: "mechanism-final-audio",
        path: options.finalOutput,
        message: "Supplied narration is absent from final artifact",
      });
  }
  if (options.finalOutput && loaded.episode.audio && loaded.audioMetadata) {
    audioReport = await verifyMechanismFinalAudio({
      sourcePath: loaded.dependencyPaths[loaded.episode.audio]!,
      finalPath: resolve(options.finalOutput),
      sourceSampleCount: loaded.audioMetadata.sampleCount,
      sourceChannels: loaded.audioMetadata.channels,
      frameCount: loaded.episode.output.frameCount,
      fps: loaded.episode.output.fps,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    findings.push(...audioReport.findings);
  }
  options.signal?.throwIfAborted();
  return {
    schemaVersion: "mechanism-check-result-1" as const,
    wallSeconds: (performance.now() - started) / 1000,
    projectHash: loaded.projectHash,
    checkedFrames,
    findings,
    overlayReport,
    qualityReport,
    finalProbe,
    audioReport,
    mechanicalValid: mechanical.valid,
    mechanicalReport: mechanical,
    valid:
      findings.length === 0 &&
      (!overlayReport || overlayReport.layoutAccepted) &&
      (!qualityReport ||
        qualityReport.diagnostics.every((item) => item.severity !== "error")),
    review: {
      continuousMotion: "pending-human-review",
      listening: "pending-human-review",
    },
  };
}
export async function renderMechanismEpisode(
  path: string,
  options: MechanismPreparationOptions & { backend?: "canvas2d" | "webgl2" },
) {
  const started = performance.now();
  const loadedForRoute = await readMechanismEpisode(path);
  const selection = selectMechanismRoute(loadedForRoute.episode, options.route);
  const backend = mechanismRouteBackend(selection, options.backend);
  if (selection.effectiveRoute === "native3d")
    return renderNativeMechanismEpisode(loadedForRoute, options, selection);
  const outputDirectory = resolve(options.outputDirectory);
  await mkdir(outputDirectory, { recursive: false });
  const prepared = await prepareMechanismEpisode(path, {
    ...options,
    outputDirectory: join(outputDirectory, "prepared"),
  });
  if (prepared.schemaVersion !== "mechanism-prepared-episode-1")
    located(
      "mechanism-route",
      "Bridge preparation changed its selected route",
      path,
    );
  const preparedAt = performance.now();
  const render = await renderComposition({
    compositionPath: prepared.compositionPath,
    outputPath: join(outputDirectory, "episode.mp4"),
    backend,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.cacheDirectory
      ? { cacheDirectory: options.cacheDirectory }
      : {}),
  });
  const renderedAt = performance.now();
  const check = await checkMechanismEpisode(path, {
      preparedDirectory: prepared.outputDirectory,
      finalOutput: render.outputPath,
      ...(options.signal ? { signal: options.signal } : {}),
    }),
    result = {
      schemaVersion: "mechanism-render-result-1" as const,
      status: "rendered",
      valid: check.valid,
      timings: {
        scope: "monotonic-wall-clock-through-final-check",
        prepareWallSeconds: (preparedAt - started) / 1000,
        exportWallSeconds: (renderedAt - preparedAt) / 1000,
        checkWallSeconds: check.wallSeconds,
        throughCheckWallSeconds: (performance.now() - started) / 1000,
      },
      outputPath: render.outputPath,
      projectHash: prepared.projectHash,
      new3dRenders: prepared.new3dRenders,
      cacheHits: prepared.cacheHits,
      prepared,
      render,
      check,
    };
  options.signal?.throwIfAborted();
  await writeMechanismJson(
    join(outputDirectory, "episode.result.json"),
    result,
  );
  if (check.schemaVersion !== "mechanism-check-result-1")
    located(
      "mechanism-route",
      "Bridge final check changed its selected route",
      path,
    );
  const loaded = await readMechanismEpisode(path);
  const openFindings = [
    ...check.findings,
    ...(check.overlayReport?.findings ?? []),
    ...(check.qualityReport?.diagnostics ?? []),
  ];
  const summary = await createMechanismCommandReceipt({
    command: "summary",
    status: check.valid ? "passed" : "failed",
    summary: {
      episode: loaded.episode.id,
      revision: loaded.episode.revision,
      projectHash: prepared.projectHash,
      sourcePath: loaded.sourcePath,
      preparedReceipt: prepared.receiptPath,
      outputPath: render.outputPath,
      resultPath: join(outputDirectory, "episode.result.json"),
      new3dRenders: prepared.new3dRenders,
      cacheHits: prepared.cacheHits,
      openFindings: openFindings.length,
      continuousMotion: "pending-human-review",
      listening: "pending-human-review",
    },
    items: openFindings.map((finding) => ({
      code: finding.code,
      path: JSON.stringify(finding),
      kind: "finding",
    })),
    artifacts: [
      {
        kind: "complete-result",
        path: join(outputDirectory, "episode.result.json"),
      },
    ],
    fullResult: result,
    nextAction:
      "episode inspect --input <episode.json>; episode patch --input <episode.json> --request <revision-aware-patch.json>; episode render --input <episode.json> --output-dir <fresh-directory>",
  });
  options.signal?.throwIfAborted();
  await writeMechanismJson(
    join(outputDirectory, "project.summary.json"),
    summary,
  );
  return result;
}
export {
  packageMechanismEpisode,
  verifyMechanismPackageArtifacts,
} from "./package.ts";
