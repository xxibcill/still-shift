/**
 * CGA "look from an example": align a graded edit with its raw clips, fit one
 * encoded-sRGB 3×3 + offset transform and report its residuals through the
 * exact `color.matrix` integer path.
 */
import { ffmpegBytes } from "./composition-color-ffmpeg.ts";
import { roundTo } from "./composition-color-round.ts";
import { z } from "zod";
import {
  COLOR_MATRIX_COEFFICIENTS,
  COLOR_MATRIX_OFFSETS,
  compositionEffectDefinition,
} from "@still-shift/scene-contract";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { compositionMediaColorFilter } from "./composition-media-color.ts";
import { measureColorFrames } from "./composition-color-measure.ts";
import {
  openColorClip,
  readColorFrames,
  type ColorClip,
  type ColorFrameOptions,
} from "./composition-color-frames.ts";
import {
  colorLumaProxies,
  colorProxyCorrelation,
  detectColorShots,
} from "./composition-color-shots.ts";
import {
  COLOR_BLOCK,
  COLOR_BLOCK_BYTES,
  colorBlocks,
  colorLookResidual,
  fitColorMatrix,
  type ColorBlockSet,
} from "./composition-color-matrix-fit.ts";

export const COLOR_LOOK_VERSION = "still-shift-look-1";
const round = (value: number, digits = 6) => roundTo(value, digits);

export const ColorLookResidualSchema = z
  .object({
    pixels: z.number().int().min(0),
    /** Per-pixel code-value error (0–255 scale). */
    rms: z.number(),
    p95: z.number(),
    p99: z.number(),
    max: z.number(),
    /** Error of 4×4 block means: color, without codec noise and softening. */
    blockRms: z.number(),
    blockP95: z.number(),
    blockP99: z.number(),
  })
  .strict();
export type ColorLookResidual = z.infer<typeof ColorLookResidualSchema>;
const Residual = ColorLookResidualSchema;
const MatrixParams = z
  .object(
    Object.fromEntries(
      [...COLOR_MATRIX_COEFFICIENTS.flat(), ...COLOR_MATRIX_OFFSETS].map(
        (name) => {
          // The contract's `color.matrix` bounds, so every valid look renders.
          const property =
            compositionEffectDefinition("color.matrix")!.properties[name]!;
          if (property.type !== "scalar")
            throw Error("comp-look: color.matrix parameters are scalars");
          return [name, z.number().min(property.min).max(property.max)];
        },
      ),
    ) as Record<string, z.ZodNumber>,
  )
  .strict();
export const ColorLookSchema = z
  .object({
    schemaVersion: z.literal(COLOR_LOOK_VERSION),
    kind: z.literal("color-matrix"),
    space: z.literal("encoded-srgb"),
    /** `color.matrix` parameters at strength 1. */
    params: MatrixParams,
    summary: z
      .object({
        neutralGains: z.tuple([z.number(), z.number(), z.number()]),
        lumaChange: z.number(),
        saturationScale: z.number(),
      })
      .strict(),
    fit: z
      .object({
        method: z.string(),
        afterInterpretation: z.enum(["code-values", "media-path"]),
        afterTransfer: z.string(),
        pairs: z.number().int().min(1),
        pixels: z.number().int().min(1),
        residual: Residual,
        /** Leave-one-shot-out residuals; null with fewer than two shots. */
        heldOut: z
          .object({
            rmsMean: z.number(),
            rmsMax: z.number(),
            p99Max: z.number(),
            blockRmsMean: z.number(),
            blockRmsMax: z.number(),
          })
          .strict()
          .nullable(),
        shots: z.array(
          z
            .object({
              after: z.tuple([z.number().int(), z.number().int()]),
              before: z.string(),
              correlation: z.number(),
              pairs: z.array(z.tuple([z.number(), z.number(), z.number()])),
              residual: Residual,
              heldOut: Residual.nullable(),
            })
            .strict(),
        ),
        unmatchedShots: z.array(z.tuple([z.number().int(), z.number().int()])),
      })
      .strict(),
    /**
     * Statistics of the graded edit's matched frames. The adaptive solver
     * uses them as its targets when it runs with this look.
     */
    targets: z
      .object({
        medianLuma: z.number().min(0).max(1),
        saturation: z.number().min(0).max(1),
        strongSaturation: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    sources: z
      .object({
        before: z.array(
          z.object({ name: z.string(), sha256: z.string() }).strict(),
        ),
        after: z.object({ name: z.string(), sha256: z.string() }).strict(),
      })
      .strict(),
  })
  .strict();
export type ColorLook = z.infer<typeof ColorLookSchema>;

export function parseColorLook(value: unknown): ColorLook {
  const parsed = ColorLookSchema.safeParse(value);
  if (!parsed.success)
    passageError(
      "comp-look-format",
      `Look file is not a valid ${COLOR_LOOK_VERSION} document`,
      { path: parsed.error.issues[0]?.path.join(".") || "look" },
    );
  return parsed.data;
}

/**
 * Frames as display code values: the media path's range/matrix conversion
 * with the transfer forced to sRGB. Since decoder 3 (D-colour) the media path
 * no longer converts BT.709 transfer either, so the two readings agree; this
 * stays explicit so a future transfer rule cannot change it. A graded edit
 * tagged BT.709 transfer is compared in the code values its player shows and
 * Still Shift's export writes (export tags its sRGB-encoded pixels BT.709
 * without conversion).
 */
export async function readColorCodeValueFrames(
  clip: ColorClip,
  ordinals: readonly number[],
  signal?: AbortSignal,
): Promise<Map<number, Uint8Array>> {
  const unique = [...new Set(ordinals)].sort((a, b) => a - b);
  const size = clip.probe.width * clip.probe.height * 4;
  const frames = new Map<number, Uint8Array>();
  for (let start = 0; start < unique.length; start += 64) {
    const selected = unique.slice(start, start + 64);
    const bytes = await ffmpegBytes(
      [
        "-v",
        "error",
        "-nostdin",
        "-noautorotate",
        "-i",
        clip.path,
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        `select='${selected.map((frame) => `eq(n,${frame})`).join("+")}',${compositionMediaColorFilter({ ...clip.probe.color, transfer: "iec61966-2-1" })}`,
        "-fps_mode",
        "passthrough",
        "-frames:v",
        String(selected.length),
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      size * selected.length,
      "comp-look-decode: FFmpeg proxy decode failed",
      signal,
    );
    if (bytes.length !== size * selected.length)
      passageError("comp-look-decode", "Code-value frames are incomplete", {
        path: clip.path,
      });
    selected.forEach((ordinal, index) =>
      frames.set(
        ordinal,
        new Uint8Array(bytes.buffer, bytes.byteOffset + index * size, size),
      ),
    );
  }
  return frames;
}

export type ColorLookFitOptions = ColorFrameOptions & {
  /** Matched frame pairs used per shot (default 4). */
  pairsPerShot?: number;
  /** Grid step in pixels between sampled 4×4 blocks (default 8). */
  step?: number;
  /** Minimum proxy correlation for a matched pair (default 0.98). */
  minimumCorrelation?: number;
  /**
   * How to read a graded edit tagged BT.709 transfer: `code-values` (default)
   * compares the code values a player shows and the export writes;
   * `media-path` converts its transfer to sRGB as composition video does.
   */
  afterInterpretation?: "code-values" | "media-path";
  progress?: (message: string) => void;
};

/** Shots of a graded edit matched to before clips, read as 4×4 block pairs. */
export type ColorLookPairs = {
  after: ColorClip;
  befores: ColorClip[];
  matches: {
    shot: [number, number];
    clip: number;
    correlation: number;
    pairs: [number, number, number][];
  }[];
  unmatched: [number, number][];
  /** Block pairs per matched frame pair; `shot` indexes `matches`. */
  sets: ColorBlockSet[];
  /** Every fourth pixel and row of the graded frames, for the look's targets. */
  graded: { ordinal: number; rgba: Uint8Array }[];
  gradedWidth: number;
  afterInterpretation: "code-values" | "media-path";
};

/**
 * Align a graded `after` edit (possibly a concatenation of shots cut from the
 * before clips, same framing) with its raw clips and read the matched frame
 * pairs as 4×4 block pairs.
 */
export async function matchColorLookPairs(
  beforePaths: readonly string[],
  afterPath: string,
  options: ColorLookFitOptions = {},
): Promise<ColorLookPairs> {
  const progress = options.progress ?? (() => undefined);
  const pairsPerShot = options.pairsPerShot ?? 4,
    step = options.step ?? 8,
    minimumCorrelation = options.minimumCorrelation ?? 0.98;
  const afterInterpretation = options.afterInterpretation ?? "code-values";
  if (!beforePaths.length)
    passageError("comp-look-fit", "At least one before clip is required", {
      path: "before",
    });
  const after = await openColorClip(afterPath, options);
  const befores: ColorClip[] = [];
  for (const path of [...beforePaths].sort())
    befores.push(await openColorClip(path, options));
  for (const clip of befores)
    if (
      clip.probe.width !== after.probe.width ||
      clip.probe.height !== after.probe.height
    )
      passageError(
        "comp-look-fit",
        `Before clip ${clip.name} is ${clip.probe.width}×${clip.probe.height}; the graded edit is ${after.probe.width}×${after.probe.height}. Framing must match.`,
        { path: "before" },
      );
  progress(`proxies: ${after.name} and ${befores.length} before clip(s)`);
  const afterProxies = await colorLumaProxies(after, options.signal);
  const beforeProxies: Float64Array[][] = [];
  for (const clip of befores)
    beforeProxies.push(await colorLumaProxies(clip, options.signal));
  const shots = detectColorShots(afterProxies);
  progress(`${shots.length} shot(s) detected`);
  type Match = {
    shot: [number, number];
    clip: number;
    correlation: number;
    pairs: [number, number, number][];
  };
  const matches: Match[] = [],
    unmatched: [number, number][] = [];
  for (const shot of shots) {
    const [start, end] = shot;
    const probes = [0.2, 0.4, 0.6, 0.8].map((q) =>
      Math.min(end - 1, start + Math.floor(q * (end - start))),
    );
    let best = -1,
      bestScore = -Infinity;
    for (const [index, proxies] of beforeProxies.entries()) {
      let score = 0;
      for (const frame of probes) {
        let maximum = -1;
        for (const candidate of proxies)
          maximum = Math.max(
            maximum,
            colorProxyCorrelation(afterProxies[frame]!, candidate),
          );
        score += maximum / probes.length;
      }
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    }
    if (best < 0 || bestScore < 0.95) {
      unmatched.push(shot);
      continue;
    }
    const candidates: [number, number, number][] = [];
    for (let frame = start; frame < end; frame++) {
      let maximum = -1,
        ordinal = 0;
      for (const [j, candidate] of beforeProxies[best]!.entries()) {
        const value = colorProxyCorrelation(afterProxies[frame]!, candidate);
        if (value > maximum) {
          maximum = value;
          ordinal = j;
        }
      }
      if (maximum >= minimumCorrelation)
        candidates.push([frame, ordinal, maximum]);
    }
    candidates.sort((a, b) => b[2] - a[2] || a[0] - b[0]);
    const pairs: [number, number, number][] = [];
    for (const candidate of candidates) {
      if (pairs.length >= pairsPerShot) break;
      if (pairs.every((pair) => Math.abs(pair[0] - candidate[0]) >= 3))
        pairs.push(candidate);
    }
    if (!pairs.length) {
      unmatched.push(shot);
      continue;
    }
    pairs.sort((a, b) => a[0] - b[0]);
    matches.push({
      shot,
      clip: best,
      correlation: round(bestScore, 4),
      pairs: pairs.map(([a, b, c]) => [a, b, round(c, 4)]),
    });
  }
  if (!matches.length)
    passageError(
      "comp-look-fit",
      "No shot of the graded edit matched a before clip; framing or content differs",
      { path: "after" },
    );
  progress(`${matches.length} shot(s) matched; reading full-resolution pairs`);
  const width = after.probe.width,
    height = after.probe.height;
  const sets: ColorBlockSet[] = [];
  // Every fourth pixel and row of the graded frames, for the look's targets.
  const graded: { ordinal: number; rgba: Uint8Array }[] = [];
  const gradedWidth = Math.ceil(width / 4);
  for (const [shotIndex, match] of matches.entries()) {
    options.signal?.throwIfAborted();
    const afterOrdinals = match.pairs.map((pair) => pair[0]);
    const afterFrames =
      afterInterpretation === "code-values"
        ? await readColorCodeValueFrames(after, afterOrdinals, options.signal)
        : new Map(
            (await readColorFrames(after, afterOrdinals, options)).map(
              (frame) => [frame.ordinal, frame.rgba] as const,
            ),
          );
    const beforeFrames = new Map(
      (
        await readColorFrames(
          befores[match.clip]!,
          match.pairs.map((pair) => pair[1]),
          options,
        )
      ).map((frame) => [frame.ordinal, frame.rgba] as const),
    );
    for (const [afterOrdinal] of match.pairs) {
      const rgba = afterFrames.get(afterOrdinal)!,
        rows = Math.ceil(height / 4),
        small = new Uint8Array(gradedWidth * rows * 4);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < gradedWidth; x++)
          small.set(
            rgba.subarray(
              (y * 4 * width + x * 4) * 4,
              (y * 4 * width + x * 4) * 4 + 4,
            ),
            (y * gradedWidth + x) * 4,
          );
      graded.push({ ordinal: afterOrdinal, rgba: small });
    }
    for (const [afterOrdinal, beforeOrdinal] of match.pairs)
      sets.push(
        colorBlocks(
          shotIndex,
          beforeFrames.get(beforeOrdinal)!,
          afterFrames.get(afterOrdinal)!,
          width,
          height,
          step,
        ),
      );
  }
  return {
    after,
    befores,
    matches,
    unmatched,
    sets,
    graded,
    gradedWidth,
    afterInterpretation,
  };
}

/** Targets for the adaptive solver: statistics of the graded frames. */
export function colorLookTargets(pairs: ColorLookPairs) {
  const stats = measureColorFrames(
    { frames: pairs.graded, width: pairs.gradedWidth },
    { step: 1 },
  );
  return {
    medianLuma: stats.luma.p50,
    saturation: stats.saturation.p50,
    strongSaturation: stats.saturation.p90,
  };
}

/** Pinned names and hashes of a look's before clips and graded edit. */
export const colorLookSources = (pairs: ColorLookPairs) => ({
  before: pairs.befores.map((clip) => ({
    name: clip.name,
    sha256: clip.probe.sourceHash,
  })),
  after: { name: pairs.after.name, sha256: pairs.after.probe.sourceHash },
});

/** How the graded edit was read, as the fit records it. */
export const colorLookAfterInterpretation = (pairs: ColorLookPairs) =>
  pairs.after.probe.color.transfer === "iec61966-2-1"
    ? "media-path"
    : pairs.afterInterpretation;

/**
 * What a look does to the matched pairs' data: the luma change and the
 * median chroma ratio of the after and before blocks (model-independent).
 */
export function colorLookDataSummary(sets: readonly ColorBlockSet[]) {
  let lumaBefore = 0,
    lumaAfter = 0;
  const ratios: number[] = [];
  for (const set of sets)
    for (let i = 0; i < set.count * COLOR_BLOCK_BYTES; i += 3) {
      const b = set.before,
        a = set.after;
      lumaBefore += 0.2126 * b[i]! + 0.7152 * b[i + 1]! + 0.0722 * b[i + 2]!;
      lumaAfter += 0.2126 * a[i]! + 0.7152 * a[i + 1]! + 0.0722 * a[i + 2]!;
      const cb =
        Math.max(b[i]!, b[i + 1]!, b[i + 2]!) -
        Math.min(b[i]!, b[i + 1]!, b[i + 2]!);
      const ca =
        Math.max(a[i]!, a[i + 1]!, a[i + 2]!) -
        Math.min(a[i]!, a[i + 1]!, a[i + 2]!);
      if (cb >= 12 && i % 48 === 0) ratios.push(ca / cb);
    }
  ratios.sort((a, b) => a - b);
  return {
    lumaChange: round(lumaAfter / lumaBefore - 1, 4),
    saturationScale: round(ratios.length ? ratios[ratios.length >> 1]! : 1, 4),
  };
}

/** Mean of leave-one-shot-out residuals, or null without any. */
export function colorLookHeldOutSummary(heldOut: readonly ColorLookResidual[]) {
  return heldOut.length
    ? {
        rmsMean: round(
          heldOut.reduce((sum, value) => sum + value.rms, 0) / heldOut.length,
          4,
        ),
        rmsMax: Math.max(...heldOut.map((value) => value.rms)),
        p99Max: Math.max(...heldOut.map((value) => value.p99)),
        blockRmsMean: round(
          heldOut.reduce((sum, value) => sum + value.blockRms, 0) /
            heldOut.length,
          4,
        ),
        blockRmsMax: Math.max(...heldOut.map((value) => value.blockRms)),
      }
    : null;
}

/**
 * Fit a look from raw `before` clips and one graded `after` edit, which may be
 * a concatenation of shots cut from those clips (same framing).
 */
export async function fitColorLook(
  beforePaths: readonly string[],
  afterPath: string,
  options: ColorLookFitOptions = {},
): Promise<ColorLook> {
  const progress = options.progress ?? (() => undefined);
  const pairs = await matchColorLookPairs(beforePaths, afterPath, options);
  const { matches, sets, befores } = pairs;
  progress(
    `fitting ${sets.reduce((sum, set) => sum + set.count, 0)} 4×4 blocks`,
  );
  const params = fitColorMatrix(sets);
  const shotsReport = matches.map((match, shotIndex) => {
    const own = sets.filter((set) => set.shot === shotIndex);
    const others = sets.filter((set) => set.shot !== shotIndex);
    return {
      after: match.shot,
      before: befores[match.clip]!.name,
      correlation: match.correlation,
      pairs: match.pairs,
      residual: colorLookResidual(params, own),
      // With one shot there is nothing to hold it out against: an in-sample
      // residual reported as held-out would overstate the look's accuracy.
      heldOut: others.length
        ? colorLookResidual(fitColorMatrix(others), own)
        : null,
    };
  });
  const heldOut = shotsReport.flatMap((shot) =>
    shot.heldOut ? [shot.heldOut] : [],
  );
  // Descriptive summary of what the look does.
  const row = (c: number) => [
    params[COLOR_MATRIX_COEFFICIENTS[c]![0]!]!,
    params[COLOR_MATRIX_COEFFICIENTS[c]![1]!]!,
    params[COLOR_MATRIX_COEFFICIENTS[c]![2]!]!,
    params[COLOR_MATRIX_OFFSETS[c]!]!,
  ];
  const neutralGains = [0, 1, 2].map((c) => {
    const [r, g, b, o] = row(c);
    return round(r! + g! + b! + o! / 0.5, 4);
  }) as [number, number, number];
  return parseColorLook({
    schemaVersion: COLOR_LOOK_VERSION,
    kind: "color-matrix",
    space: "encoded-srgb",
    params,
    summary: { neutralGains, ...colorLookDataSummary(sets) },
    fit: {
      afterInterpretation: colorLookAfterInterpretation(pairs),
      afterTransfer: pairs.after.probe.color.transfer,
      method:
        "trimmed least squares (95%, 2 passes) on 4x4 block means of encoded-sRGB code values; residuals through the color.matrix integer path",
      pairs: matches.reduce((count, match) => count + match.pairs.length, 0),
      pixels: sets.reduce(
        (sum, set) => sum + set.count * COLOR_BLOCK * COLOR_BLOCK,
        0,
      ),
      residual: colorLookResidual(params, sets),
      heldOut: colorLookHeldOutSummary(heldOut),
      shots: shotsReport,
      unmatchedShots: pairs.unmatched,
    },
    targets: colorLookTargets(pairs),
    sources: colorLookSources(pairs),
  });
}

/** A look as the `color.matrix` effect CGA applies first (id `look`). */
export const colorLookEffect = (
  look: Pick<ColorLook, "params">,
  strength = 1,
) => ({
  id: "look",
  effect: "color.matrix" as const,
  params: colorLookEffectParams(look, strength),
});

/** `color.matrix` effect parameters for a look at a 0–1 strength. */
export function colorLookEffectParams(
  look: Pick<ColorLook, "params">,
  strength = 1,
) {
  return {
    ...look.params,
    strength: round(Math.max(0, Math.min(1, strength))),
  };
}
