/**
 * CGA one-command correction: probe a clip, measure it through the media
 * path, apply a fitted look and/or the adaptive solver as ordinary effects on
 * a video layer, keep the source audio, render, and report before/after.
 */
import { ffmpegBytes } from "./composition-color-ffmpeg.ts";
import { roundTo } from "./composition-color-round.ts";
import { access, link, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Composition,
  CompositionAsset,
  CompositionLayer,
} from "@still-shift/scene-contract";
import type { CompositionBackend } from "@still-shift/renderer-core";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { compositionMediaChecksum } from "./composition-media-probe.ts";
import { probeCompositionVideo } from "./composition-media-probe.ts";
import { renderComposition } from "./composition-render.ts";
import {
  colorSampleOrdinals,
  openColorClip,
  readColorFrames,
  type ColorClip,
  type ColorFrameOptions,
} from "./composition-color-frames.ts";
import {
  COLOR_STATISTICS_VERSION,
  measureColorFrames,
  type ColorStatistics,
} from "./composition-color-measure.ts";
import {
  colorLookEffectParams,
  readColorCodeValueFrames,
  type ColorLook,
} from "./composition-color-look.ts";
import {
  applyColorEffects,
  colorSolverFrames,
  solveColorCorrection,
  type ColorCorrectionEffect,
  type ColorSolveDecision,
  type ColorSolveSettings,
} from "./composition-color-solve.ts";

export const AUTO_COLOR_REPORT_VERSION = "still-shift-auto-color-report-1";
/** Default look strength, chosen by the owner from a 50–75% ladder. */
export const AUTO_COLOR_LOOK_STRENGTH = 0.6;
const round = (value: number, digits = 4) => roundTo(value, digits);

export type AutoColorRequest = ColorFrameOptions & {
  input: string;
  /** Rendered MP4. Optional when only `writeComposition` is requested. */
  output?: string | undefined;
  look?: ColorLook | undefined;
  /** Scales the adaptive corrections, 0–1 (default 1). */
  strength?: number | undefined;
  /** Scales the look, 0–1 (default 0.6; the learned look at 1 is strong). */
  lookStrength?: number | undefined;
  /** Adaptive corrections; defaults on without a look and off with one. */
  adaptive?: boolean | undefined;
  /** Per correction: true/false switches it, a 0–1 number scales it. */
  toggles?: ColorSolveSettings | undefined;
  /** Save the editable composition here (asset paths relative to it). */
  writeComposition?: string | undefined;
  /** Report path (default: beside the output or composition). */
  report?: string | undefined;
  /** Frames sampled for measurement and solving (default 12). */
  sampleFrames?: number | undefined;
  backend?: CompositionBackend | undefined;
  progress?: ((message: string) => void) | undefined;
};
export type AutoColorReport = {
  schemaVersion: typeof AUTO_COLOR_REPORT_VERSION;
  statisticsVersion: typeof COLOR_STATISTICS_VERSION;
  input: { name: string; sha256: string; frameCount: number; fps: number };
  look?: { sha256s: string[]; strength: number } | undefined;
  adaptive: boolean;
  strength: number;
  effects: ColorCorrectionEffect[];
  decisions: ColorSolveDecision[];
  sampledOrdinals: number[];
  before: ColorStatistics;
  /** Exact Canvas prediction on the sampled frames. */
  predicted: ColorStatistics;
  change: {
    medianLuma: number;
    meanLuma: number;
    medianSaturation: number;
    clippedFraction: number;
    crushedFraction: number;
  };
  composition?: string | undefined;
  output?:
    | {
        name: string;
        frameCount: number;
        durationSeconds: number;
        /** Output code values (the export tags sRGB-encoded pixels BT.709). */
        measured: ColorStatistics;
        /** Rendered vs predicted pixels on the sampled frames (codec loss). */
        predictedRms: number;
        audio: AutoColorAudioCheck | null;
      }
    | undefined;
};
export type AutoColorAudioCheck = {
  /** Container audio stream durations (seconds), as players see them. */
  sourceDurationSeconds: number | null;
  outputDurationSeconds: number | null;
  /** Decoded 48 kHz samples; AAC output decodes with its frame padding. */
  sourceSamples: number;
  outputSamples: number;
  channels: number;
  /** RMS of (output − source) PCM over the common samples, dBFS. */
  differenceDb: number;
  correlation: number;
};

type ClipAudio = { channels: 1 | 2; sampleCount: number; sha256: string };
const AudioStreams = z.object({
  streams: z.array(z.object({ channels: z.number().int() })),
});
/** One mono/stereo audio stream decoded at 48 kHz, as the audio decoder does. */
async function decodeAudio(
  path: string,
  channels: number,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const bytes = await ffmpegBytes(
    [
      "-v",
      "error",
      "-nostdin",
      "-threads",
      "1",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-vn",
      "-ar",
      "48000",
      "-ac",
      String(channels),
      "-codec:a",
      "pcm_f32le",
      "-f",
      "f32le",
      "pipe:1",
    ],
    2 ** 31,
    "comp-auto-color: audio decode failed",
    signal,
  );
  return new Float32Array(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + (bytes.length & ~3),
    ),
  );
}
async function clipAudio(
  path: string,
  signal?: AbortSignal,
): Promise<ClipAudio | undefined> {
  const { stdout } = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=channels",
      "-of",
      "json",
      path,
    ],
    { signal, maxBuffer: 1024 * 1024 },
  );
  const streams = AudioStreams.parse(JSON.parse(stdout)).streams;
  if (!streams.length) return undefined;
  if (
    streams.length > 1 ||
    (streams[0]!.channels !== 1 && streams[0]!.channels !== 2)
  )
    passageError(
      "comp-auto-color-audio",
      "Source audio must be one mono or stereo stream to be kept",
      { path },
    );
  const channels = streams[0]!.channels as 1 | 2;
  const pcm = await decodeAudio(path, channels, signal);
  return {
    channels,
    sampleCount: pcm.length / channels,
    sha256: await compositionMediaChecksum(path, signal),
  };
}

export function autoColorComposition(
  clip: ColorClip,
  audio: ClipAudio | undefined,
  effects: readonly ColorCorrectionEffect[],
  compositionDirectory: string | undefined,
): Composition {
  const fps = clip.probe.frameRate;
  if (fps.denominator !== 1 || fps.numerator > 60)
    passageError(
      "comp-auto-color-rate",
      `Composition output needs an integer rate up to 60 fps; ${clip.name} is ${fps.numerator}/${fps.denominator}`,
      { path: clip.path },
    );
  const path = compositionDirectory
    ? relative(compositionDirectory, clip.path)
    : clip.path;
  const assets: CompositionAsset[] = [{ ...clip.asset, path }];
  const layers: CompositionLayer[] = [
    {
      id: "clip",
      type: "video",
      asset: "clip",
      size: [clip.probe.width, clip.probe.height],
      fit: "stretch",
      transform: { anchor: [0, 0], position: [0, 0] },
      effects: effects.map((effect) => ({
        id: effect.id,
        effect: effect.effect,
        params: effect.params,
      })),
    } as CompositionLayer,
  ];
  if (audio) {
    assets.push({
      id: "source-audio",
      type: "audio",
      path,
      sha256: audio.sha256,
      sampleRate: 48000,
      sampleCount: audio.sampleCount,
      channels: audio.channels,
    } as CompositionAsset);
    layers.push({
      id: "source-audio",
      type: "audio",
      asset: "source-audio",
    } as CompositionLayer);
  }
  return {
    schemaVersion: "composition-1",
    id: "auto-color",
    width: clip.probe.width,
    height: clip.probe.height,
    fps: fps.numerator,
    frameCount: clip.probe.frameCount,
    background: "#000000",
    assets,
    layers,
  };
}

function rmsDifference(a: Uint8Array, b: Uint8Array) {
  let squares = 0,
    count = 0;
  for (let i = 0; i < a.length; i += 4)
    for (let c = 0; c < 3; c++) {
      squares += (a[i + c]! - b[i + c]!) ** 2;
      count++;
    }
  return Math.sqrt(squares / count);
}
async function audioDuration(path: string, signal?: AbortSignal) {
  const { stdout } = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=duration",
      "-of",
      "csv=p=0",
      path,
    ],
    { signal, maxBuffer: 1024 * 1024 },
  );
  const value = Number(stdout.trim());
  return Number.isFinite(value) && stdout.trim() ? value : null;
}
export async function compareClipAudio(
  source: string,
  output: string,
  signal?: AbortSignal,
): Promise<AutoColorAudioCheck | null> {
  const audio = await clipAudio(source, signal);
  if (!audio) return null;
  const a = await decodeAudio(source, audio.channels, signal),
    b = await decodeAudio(output, audio.channels, signal);
  const n = Math.min(a.length, b.length);
  let difference = 0,
    ab = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < n; i++) {
    difference += (b[i]! - a[i]!) ** 2;
    ab += a[i]! * b[i]!;
    aa += a[i]! ** 2;
    bb += b[i]! ** 2;
  }
  return {
    sourceDurationSeconds: await audioDuration(source, signal),
    outputDurationSeconds: await audioDuration(output, signal),
    sourceSamples: a.length / audio.channels,
    outputSamples: b.length / audio.channels,
    channels: audio.channels,
    differenceDb: round(
      10 * Math.log10(difference / Math.max(1, n) || 1e-12),
      2,
    ),
    // Two silent tracks are identical; one silent track does not correlate.
    correlation:
      aa === 0 && bb === 0 ? 1 : round(ab / Math.sqrt(aa * bb || 1), 5),
  };
}

export async function autoColorClip(
  request: AutoColorRequest,
): Promise<AutoColorReport> {
  const progress = request.progress ?? (() => undefined);
  const strength = Math.max(0, Math.min(1, request.strength ?? 1));
  const lookStrength = Math.max(
    0,
    Math.min(1, request.lookStrength ?? AUTO_COLOR_LOOK_STRENGTH),
  );
  const adaptive = request.adaptive ?? !request.look;
  if (!request.output && !request.writeComposition)
    passageError(
      "comp-auto-color-output",
      "Specify --output, --write-composition, or both",
      { path: "output" },
    );
  // Never overwrite: outputs, compositions and reports must be new paths.
  const reportTarget = request.report
    ? resolve(request.report)
    : resolve(request.output ?? request.writeComposition!).replace(
        /\.[^./]+$/,
        "",
      ) + ".auto-color.json";
  for (const [path, option] of [
    [request.output, "output"],
    [request.writeComposition, "write-composition"],
    [reportTarget, "report"],
  ] as const)
    if (
      path !== undefined &&
      (await access(resolve(path)).then(
        () => true,
        () => false,
      ))
    )
      passageError(
        "comp-auto-color-output",
        `${resolve(path)} already exists; choose a new path`,
        { path: option },
      );
  const clip = await openColorClip(request.input, request);
  const ordinals = colorSampleOrdinals(
    clip.probe.frameCount,
    request.sampleFrames ?? 12,
  );
  progress(`measuring ${clip.name} (${ordinals.length} frames)`);
  const frames = await readColorFrames(clip, ordinals, request);
  const before = measureColorFrames({
    frames: frames,
    width: clip.probe.width,
  });
  const effects: ColorCorrectionEffect[] = [];
  if (request.look)
    effects.push({
      id: "look",
      effect: "color.matrix",
      params: colorLookEffectParams(request.look, lookStrength),
    });
  let decisions: ColorSolveDecision[] = [];
  if (adaptive) {
    const small = colorSolverFrames(frames);
    const solution = solveColorCorrection(small, {
      ...request.toggles,
      strength,
      prefix: effects,
      // A look measured from a graded edit supplies the solver's targets.
      ...(request.look?.targets ? { targets: request.look.targets } : {}),
    });
    effects.push(...solution.effects);
    decisions = solution.decisions;
  }
  const predictedFrames = frames.map((frame) => ({
    ordinal: frame.ordinal,
    rgba: applyColorEffects(effects, frame.rgba),
  }));
  const predicted = measureColorFrames({
    frames: predictedFrames,
    width: clip.probe.width,
  });
  const audio = await clipAudio(clip.path, request.signal);
  const compositionPath = request.writeComposition
    ? resolve(request.writeComposition)
    : undefined;
  const report: AutoColorReport = {
    schemaVersion: AUTO_COLOR_REPORT_VERSION,
    statisticsVersion: COLOR_STATISTICS_VERSION,
    input: {
      name: clip.name,
      sha256: clip.probe.sourceHash,
      frameCount: clip.probe.frameCount,
      fps: clip.probe.frameRate.numerator / clip.probe.frameRate.denominator,
    },
    ...(request.look
      ? {
          look: {
            sha256s: [
              ...request.look.sources.before.map((source) => source.sha256),
              request.look.sources.after.sha256,
            ],
            strength: lookStrength,
          },
        }
      : {}),
    adaptive,
    strength,
    effects,
    decisions,
    sampledOrdinals: ordinals,
    before,
    predicted,
    change: {
      medianLuma: round(predicted.luma.p50 - before.luma.p50, 6),
      meanLuma: round(predicted.luma.mean - before.luma.mean, 6),
      medianSaturation: round(
        predicted.saturation.p50 - before.saturation.p50,
        6,
      ),
      clippedFraction: round(
        predicted.clippedFraction - before.clippedFraction,
        6,
      ),
      crushedFraction: round(
        predicted.crushedFraction - before.crushedFraction,
        6,
      ),
    },
  };
  // Render and verify into a staged file first; publish the output, the
  // composition and the report only once everything succeeded, so a failed
  // run leaves nothing behind that would block its retry.
  let publish: (() => Promise<void>) | undefined;
  let staged: string | undefined;
  try {
    if (request.output) {
      const output = resolve(request.output);
      await mkdir(dirname(output), { recursive: true });
      staged = join(
        dirname(output),
        `.${basename(output)}.${randomUUID()}.mp4`,
      );
      const work = await mkdtemp(join(tmpdir(), "still-shift-auto-color-"));
      try {
        const path = join(work, "composition.json");
        await writeFile(
          path,
          JSON.stringify(autoColorComposition(clip, audio, effects, undefined)),
        );
        progress(`rendering ${basename(output)}`);
        await renderComposition({
          compositionPath: path,
          outputPath: staged,
          backend: request.backend ?? "canvas2d",
          ...(request.cacheDirectory
            ? { cacheDirectory: request.cacheDirectory }
            : {}),
          signal: request.signal,
        });
      } finally {
        await rm(work, { recursive: true, force: true });
      }
      progress(`verifying ${basename(output)}`);
      const rendered = await probeCompositionVideo(staged, {
        signal: request.signal,
      });
      const outputClip = await openColorClip(staged, request);
      const codeValues = await readColorCodeValueFrames(
        outputClip,
        ordinals,
        request.signal,
      );
      const measured = measureColorFrames({
        frames: ordinals.map((ordinal) => ({
          ordinal,
          rgba: codeValues.get(ordinal)!,
        })),
        width: clip.probe.width,
      });
      let squares = 0;
      for (const frame of predictedFrames)
        squares +=
          rmsDifference(frame.rgba, codeValues.get(frame.ordinal)!) ** 2;
      report.output = {
        name: basename(output),
        frameCount: rendered.frameCount,
        durationSeconds: rendered.durationSeconds,
        measured,
        predictedRms: round(Math.sqrt(squares / predictedFrames.length)),
        audio: await compareClipAudio(clip.path, staged, request.signal),
      };
      const verified = staged;
      // A hard link publishes atomically and fails if the output appeared.
      publish = () => link(verified, output);
    }
    request.signal?.throwIfAborted();
    await publish?.();
  } finally {
    // The staged render and the renderer's sidecars never stay behind.
    if (staged)
      for (const path of [
        staged,
        `${staged}.scene.json`,
        `${staged}.result.json`,
      ])
        await rm(path, { force: true });
  }
  if (compositionPath) {
    await mkdir(dirname(compositionPath), { recursive: true });
    const composition = autoColorComposition(
      clip,
      audio,
      effects,
      dirname(compositionPath),
    );
    await writeFile(
      compositionPath,
      JSON.stringify(composition, null, 2) + "\n",
      { flag: "wx" },
    );
    report.composition = compositionPath;
  }
  await mkdir(dirname(reportTarget), { recursive: true });
  await writeFile(reportTarget, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  return report;
}
