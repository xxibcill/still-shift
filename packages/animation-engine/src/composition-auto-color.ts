/**
 * CGA one-command correction: probe a clip, measure it through the media
 * path, apply a fitted look and/or the adaptive solver as ordinary effects on
 * a video layer, keep the source audio, render, and report before/after.
 */
import { ffmpegBytes } from "./composition-color-ffmpeg.ts";
import { roundTo } from "./composition-color-round.ts";
import { access, link, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
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
  type ColorFrame,
  type ColorFrameOptions,
} from "./composition-color-frames.ts";
import {
  COLOR_STATISTICS_VERSION,
  ColorStatisticsSchema,
  measureColorFrames,
  type ColorStatistics,
} from "./composition-color-measure.ts";
import {
  COLOR_SCOPES_VERSION,
  ColorScopesMeasurementSchema,
  colorGradeDiffImages,
  measureColorScopeFrames,
  type ColorScopesMeasurement,
} from "./composition-color-scopes.ts";
import {
  colorLookEffect,
  readColorCodeValueFrames,
} from "./composition-color-look.ts";
import {
  colorLookApplyEffects,
  colorLookLegacyParams,
  type AnyColorLook,
  type ColorLookLut,
} from "./composition-color-look2.ts";
import {
  COLOR_ENGINES,
  DEFAULT_COLOR_ENGINE,
  type ColorEngine,
} from "./composition-color-engine.ts";
import {
  applyColorEffects,
  colorSolverFrames,
  colorSolverVersion,
  solveColorCorrection,
  type ColorCorrectionEffect,
  type ColorSolveDecision,
  type ColorSolveSettings,
} from "./composition-color-solve.ts";

/** CGA's report, unchanged: `--engine legacy` without `--scopes`. */
export const AUTO_COLOR_REPORT_VERSION = "still-shift-auto-color-report-1";
/**
 * CGA2 A2: report 1 plus `engine`, `solver` and `scopes` (the CG3 scope
 * measurement before and predicted after). Every `--engine grade` report,
 * and a legacy report when `scopes` is asked for.
 */
export const AUTO_COLOR_REPORT_2_VERSION = "still-shift-auto-color-report-2";
/** Default look strength, chosen by the owner from a 50–75% ladder. */
export const AUTO_COLOR_LOOK_STRENGTH = 0.6;
const round = (value: number, digits = 4) => roundTo(value, digits);

export type AutoColorRequest = ColorFrameOptions & {
  input: string;
  /** Rendered MP4. Optional when only `writeComposition` is requested. */
  output?: string | undefined;
  /** A look-1 or look-2 document (look 2 other than one mixer needs `grade`). */
  look?: AnyColorLook | undefined;
  /** A look-2 file's LUT assets, read and verified (`loadColorLookLuts`). */
  lookLuts?: ReadonlyMap<string, ColorLookLut> | undefined;
  /** Scales the adaptive corrections, 0–1 (default 1). */
  strength?: number | undefined;
  /** Scales the look, 0–1 (default 0.6; the learned look at 1 is strong). */
  lookStrength?: number | undefined;
  /** Adaptive corrections; defaults on without a look and off with one. */
  adaptive?: boolean | undefined;
  /** Per correction: true/false switches it, a 0–1 number scales it. */
  toggles?: ColorSolveSettings | undefined;
  /**
   * CGA2: `legacy` writes CGA's 8-bit `color.*` effects (solver 1), `grade`
   * the float `grade.*` run (solver 2). Default: `legacy` until A6.
   */
  engine?: ColorEngine | undefined;
  /**
   * Legacy only: write report 2 with the scopes block (grade reports always
   * have it). Default false, so legacy reports stay report 1 byte for byte.
   */
  scopes?: boolean | undefined;
  /**
   * A folder for `comp grade diff`'s split still and contact sheet
   * (`<stem>.still.png`, `<stem>.sheet.png`); after is the rendered output,
   * or the exact prediction without `output`. Files must not exist.
   */
  diff?: string | undefined;
  /** Save the editable composition here (asset paths relative to it). */
  writeComposition?: string | undefined;
  /** Report path (default: beside the output or composition). */
  report?: string | undefined;
  /** Frames sampled for measurement and solving (default 12). */
  sampleFrames?: number | undefined;
  backend?: CompositionBackend | undefined;
  progress?: ((message: string) => void) | undefined;
};
const AutoColorAudioCheckSchema = z
  .object({
    /** Container audio stream durations (seconds), as players see them. */
    sourceDurationSeconds: z.number().nullable(),
    outputDurationSeconds: z.number().nullable(),
    /** Decoded 48 kHz samples; AAC output decodes with its frame padding. */
    sourceSamples: z.number().nonnegative(),
    outputSamples: z.number().nonnegative(),
    channels: z.number().int().positive(),
    /** RMS of (output − source) PCM over the common samples, dBFS. */
    differenceDb: z.number(),
    correlation: z.number(),
  })
  .strict();
export type AutoColorAudioCheck = z.infer<typeof AutoColorAudioCheckSchema>;

/** The CG3 scope measurement of the sampled frames, before and predicted. */
const AutoColorScopesSchema = z
  .object({
    schema: z.literal(COLOR_SCOPES_VERSION),
    before: ColorScopesMeasurementSchema,
    /** The exact Canvas prediction, as `predicted` statistics. */
    predicted: ColorScopesMeasurementSchema,
    change: z
      .object({
        /**
         * |predicted deviation| − |before deviation| from the skin line,
         * degrees: negative moves skin toward the line. Null without skin.
         */
        absoluteSkinDeviation: z.number().nullable(),
        chromaticFraction: z.number(),
      })
      .strict(),
  })
  .strict();
export type AutoColorScopes = z.infer<typeof AutoColorScopesSchema>;

const reportFields = {
  statisticsVersion: z.literal(COLOR_STATISTICS_VERSION),
  input: z
    .object({
      name: z.string(),
      sha256: z.string(),
      frameCount: z.number().int().positive(),
      fps: z.number().positive(),
    })
    .strict(),
  look: z
    .object({
      sha256s: z.array(z.string()),
      strength: z.number().min(0).max(1),
    })
    .strict()
    .optional(),
  adaptive: z.boolean(),
  strength: z.number().min(0).max(1),
  effects: z.array(
    z
      .object({
        id: z.string(),
        effect: z.string(),
        params: z.record(z.string(), z.unknown()),
        /** A look's grade.lut asset slot (CGA2 A3). */
        assets: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
  ),
  decisions: z.array(
    z
      .object({
        correction: z.enum([
          "exposure",
          "contrast",
          "saturation",
          "whiteBalance",
          "clipping",
        ]),
        applied: z.boolean(),
        reason: z.string(),
        values: z.record(z.string(), z.number()).optional(),
      })
      .strict(),
  ),
  sampledOrdinals: z.array(z.number().int().nonnegative()).min(1),
  before: ColorStatisticsSchema,
  /** Exact Canvas prediction on the sampled frames. */
  predicted: ColorStatisticsSchema,
  change: z
    .object({
      medianLuma: z.number(),
      meanLuma: z.number(),
      medianSaturation: z.number(),
      clippedFraction: z.number(),
      crushedFraction: z.number(),
    })
    .strict(),
  composition: z.string().optional(),
  output: z
    .object({
      name: z.string(),
      frameCount: z.number().int().positive(),
      durationSeconds: z.number().positive(),
      /** Output code values (the export tags sRGB-encoded pixels BT.709). */
      measured: ColorStatisticsSchema,
      /** Rendered vs predicted pixels on the sampled frames (codec loss). */
      predictedRms: z.number().nonnegative(),
      audio: AutoColorAudioCheckSchema.nullable(),
    })
    .strict()
    .optional(),
};
/**
 * The auto-color report (`<output>.auto-color.json`). Report 1 is CGA's
 * shape; report 2 adds the engine, the solver and the scopes block. Reports
 * are validated before they are written.
 */
export const AutoColorReportSchema = z.discriminatedUnion("schemaVersion", [
  z
    .object({
      schemaVersion: z.literal(AUTO_COLOR_REPORT_VERSION),
      ...reportFields,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(AUTO_COLOR_REPORT_2_VERSION),
      ...reportFields,
      engine: z.enum(COLOR_ENGINES),
      /** The solver, when one ran (`look apply` runs none). */
      solver: z.string().optional(),
      scopes: AutoColorScopesSchema,
    })
    .strict(),
]);
/**
 * The report's fields shared by both versions. The two members of
 * `AutoColorReport` follow `AutoColorReportSchema`'s two branches (checked
 * against the schema where the report is validated), so a report 1 cannot
 * carry `engine`, `solver` or `scopes`.
 */
type AutoColorReportFields = {
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
export type AutoColorReport =
  /** Report 1: CGA's shape, unchanged. */
  | ({
      schemaVersion: typeof AUTO_COLOR_REPORT_VERSION;
      engine?: undefined;
      solver?: undefined;
      scopes?: undefined;
    } & AutoColorReportFields)
  /** Report 2 (CGA2 A2): adds the engine, the solver and the scopes block. */
  | ({
      schemaVersion: typeof AUTO_COLOR_REPORT_2_VERSION;
      engine: ColorEngine;
      solver?: string | undefined;
      scopes: AutoColorScopes;
    } & AutoColorReportFields);

/** `--diff` file names for one clip: `<stem>.still.png`, `<stem>.sheet.png`. */
export function autoColorDiffPaths(directory: string, input: string) {
  const stem = basename(input, extname(input));
  return {
    still: join(resolve(directory), `${stem}.still.png`),
    sheet: join(resolve(directory), `${stem}.sheet.png`),
  };
}

function scopesChange(
  before: ColorScopesMeasurement,
  predicted: ColorScopesMeasurement,
): AutoColorScopes["change"] {
  const b = before.skin.deviation,
    p = predicted.skin.deviation;
  return {
    absoluteSkinDeviation:
      b === null || p === null ? null : round(Math.abs(p) - Math.abs(b), 3),
    chromaticFraction: round(
      predicted.hue.chromaticFraction - before.hue.chromaticFraction,
      6,
    ),
  };
}

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

/** A look's LUT assets with absolute paths (the effects bind them by id). */
function lookLutAssets(request: AutoColorRequest): CompositionAsset[] {
  return [...(request.lookLuts?.values() ?? [])].map((entry) => ({
    ...entry.asset,
    path: entry.path,
  }));
}

export function autoColorComposition(
  clip: ColorClip,
  audio: ClipAudio | undefined,
  effects: readonly ColorCorrectionEffect[],
  compositionDirectory: string | undefined,
  /** LUT assets the effects bind, with absolute paths. */
  luts: readonly CompositionAsset[] = [],
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
  const assets: CompositionAsset[] = [
    { ...clip.asset, path },
    ...luts
      .filter((asset) =>
        effects.some((effect) =>
          Object.values(effect.assets ?? {}).includes(asset.id),
        ),
      )
      .map((asset) => ({
        ...asset,
        path: compositionDirectory
          ? relative(compositionDirectory, asset.path)
          : asset.path,
      })),
  ];
  const video: Extract<CompositionLayer, { type: "video" }> = {
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
      ...(effect.assets ? { assets: effect.assets } : {}),
    })),
  };
  const layers: CompositionLayer[] = [video];
  if (audio) {
    const sound: Extract<CompositionAsset, { type: "audio" }> = {
      id: "source-audio",
      type: "audio",
      path,
      sha256: audio.sha256,
      sampleRate: 48000,
      sampleCount: audio.sampleCount,
      channels: audio.channels,
    };
    const track: Extract<CompositionLayer, { type: "audio" }> = {
      id: "source-audio",
      type: "audio",
      asset: "source-audio",
    };
    assets.push(sound);
    layers.push(track);
  }
  // No colorManagement: the effects were predicted for a legacy-srgb
  // composition (gradeRunSegments), which is what renders them.
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
  const engine = request.engine ?? DEFAULT_COLOR_ENGINE;
  if (engine === "grade" && request.scopes === false)
    passageError(
      "comp-auto-color-scopes",
      "Grade-engine reports always include scopes; --scopes false applies to --engine legacy only",
      { path: "scopes" },
    );
  // Report 2 (with scopes) for the grade engine, or when asked for.
  const scoped = engine === "grade" || request.scopes === true;
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
  const diffPaths = request.diff
    ? autoColorDiffPaths(request.diff, request.input)
    : undefined;
  for (const [path, option] of [
    [request.output, "output"],
    [request.writeComposition, "write-composition"],
    [reportTarget, "report"],
    [diffPaths?.still, "diff"],
    [diffPaths?.sheet, "diff"],
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
  // The `--diff` folder is made now, so a path that cannot be a folder (an
  // existing file, or one under a file) fails before any work, never after
  // the output is published.
  if (diffPaths) {
    const folder = dirname(diffPaths.still);
    await mkdir(folder, { recursive: true }).catch(() =>
      passageError(
        "comp-auto-color-output",
        `${folder} is not a folder that can be written; choose another --diff`,
        { path: "diff" },
      ),
    );
  }
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
  const lookLuts = lookLutAssets(request);
  if (request.look && engine === "legacy")
    effects.push(
      colorLookEffect(
        { params: colorLookLegacyParams(request.look) },
        lookStrength,
      ),
    );
  // Look 1 reads as a one-entry grade.rgb-mixer look (A1's mapping).
  else if (request.look)
    effects.push(
      ...(colorLookApplyEffects(request.look, lookStrength, request.lookLuts, {
        closed: adaptive,
      }) as ColorCorrectionEffect[]),
    );
  let decisions: ColorSolveDecision[] = [];
  if (adaptive) {
    const small = colorSolverFrames(frames);
    const solution = solveColorCorrection(small, {
      ...request.toggles,
      strength,
      engine,
      prefix: effects,
      // A look measured from a graded edit supplies the solver's targets.
      ...(request.look?.targets ? { targets: request.look.targets } : {}),
    });
    effects.push(...solution.effects);
    decisions = solution.decisions;
  }
  const predictedFrames: ColorFrame[] = frames.map((frame) => ({
    ordinal: frame.ordinal,
    width: frame.width,
    height: frame.height,
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
  // Key order is the report's byte order: report 2 adds `engine` and
  // `solver` after `look` and `scopes` after `change`, so a legacy report 1
  // stays byte-identical.
  const head: Pick<
    AutoColorReportFields,
    "statisticsVersion" | "input" | "look"
  > = {
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
  };
  const body: Omit<
    AutoColorReportFields,
    "statisticsVersion" | "input" | "look" | "composition" | "output"
  > = {
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
  let report: AutoColorReport;
  if (scoped) {
    const scopesBefore = measureColorScopeFrames(frames),
      scopesPredicted = measureColorScopeFrames(predictedFrames);
    report = {
      schemaVersion: AUTO_COLOR_REPORT_2_VERSION,
      ...head,
      engine,
      // The solver is named only when one ran (`look apply` runs none).
      ...(adaptive ? { solver: colorSolverVersion(engine) } : {}),
      ...body,
      scopes: {
        schema: COLOR_SCOPES_VERSION,
        before: scopesBefore,
        predicted: scopesPredicted,
        change: scopesChange(scopesBefore, scopesPredicted),
      },
    };
  } else
    report = { schemaVersion: AUTO_COLOR_REPORT_VERSION, ...head, ...body };
  // `--diff`'s after frames: the rendered output's, else the prediction.
  let diffAfter: readonly ColorFrame[] = predictedFrames;
  // Render and verify into a staged file first; publish the output, the
  // composition and the report only once everything succeeded, so a failed
  // run leaves nothing behind that would block its retry.
  let publish: (() => Promise<void>) | undefined;
  let staged: string | undefined;
  // `--diff` images staged beside their targets and linked into place before
  // the output is published; a run that fails removes the ones it linked, so
  // they never block its retry.
  const stagedDiff: string[] = [];
  const linkedDiff: string[] = [];
  const unlinkDiff = async () => {
    for (const path of linkedDiff.splice(0)) await rm(path, { force: true });
  };
  let published = false;
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
          JSON.stringify(
            autoColorComposition(clip, audio, effects, undefined, lookLuts),
          ),
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
      diffAfter = frames.map((frame) => ({
        ...frame,
        rgba: codeValues.get(frame.ordinal)!,
      }));
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
    // Check the report's shape and build the `--diff` images before anything
    // is published, so neither can fail a run whose output already exists.
    AutoColorReportSchema.parse(
      report satisfies z.input<typeof AutoColorReportSchema>,
    );
    if (diffPaths) {
      const images = colorGradeDiffImages(frames, diffAfter);
      const files = [
        [diffPaths.still, images.still],
        [diffPaths.sheet, images.sheet],
      ] as const;
      for (const [target, bytes] of files) {
        const temp = join(
          dirname(target),
          `.${basename(target)}.${randomUUID()}`,
        );
        stagedDiff.push(temp);
        await writeFile(temp, bytes, { flag: "wx" });
      }
      // Like the output, a hard link never replaces a file that appeared
      // since the check at the start.
      for (const [index, [target]] of files.entries()) {
        try {
          await link(stagedDiff[index]!, target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST")
            passageError(
              "comp-auto-color-output",
              `${target} already exists; choose a new path`,
              { path: "diff" },
            );
          throw error;
        }
        linkedDiff.push(target);
      }
    }
    await publish?.();
    published = true;
  } finally {
    for (const path of stagedDiff) await rm(path, { force: true });
    if (!published) await unlinkDiff();
    // The staged render and the renderer's sidecars never stay behind.
    if (staged)
      for (const path of [
        staged,
        `${staged}.scene.json`,
        `${staged}.result.json`,
      ])
        await rm(path, { force: true });
  }
  try {
    if (compositionPath) {
      await mkdir(dirname(compositionPath), { recursive: true });
      const composition = autoColorComposition(
        clip,
        audio,
        effects,
        dirname(compositionPath),
        lookLuts,
      );
      await writeFile(
        compositionPath,
        JSON.stringify(composition, null, 2) + "\n",
        { flag: "wx" },
      );
      report.composition = compositionPath;
    }
    // Validate first: a report that does not match its schema is never written.
    AutoColorReportSchema.parse(report);
    await mkdir(dirname(reportTarget), { recursive: true });
    await writeFile(reportTarget, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
  } catch (error) {
    await unlinkDiff();
    throw error;
  }
  return report;
}
