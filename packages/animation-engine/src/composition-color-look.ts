/**
 * CGA "look from an example": align a graded edit with its raw clips, fit one
 * encoded-sRGB 3×3 + offset transform and report its residuals through the
 * exact `color.matrix` integer path.
 */
import { spawn } from "node:child_process";
import { z } from "zod";
import {
  COLOR_MATRIX_COEFFICIENTS,
  COLOR_MATRIX_OFFSETS,
} from "@still-shift/scene-contract";
import { gradeBytes, gradeControls } from "@still-shift/renderer-core";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { compositionMediaColorFilter } from "./composition-media-color.ts";
import {
  openColorClip,
  readColorFrames,
  type ColorClip,
  type ColorFrameOptions,
} from "./composition-color-frames.ts";

export const COLOR_LOOK_VERSION = "still-shift-look-1";
const round = (value: number, digits = 6) => {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const Residual = z
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
export type ColorLookResidual = z.infer<typeof Residual>;
const MatrixParams = z
  .object(
    Object.fromEntries(
      [...COLOR_MATRIX_COEFFICIENTS.flat(), ...COLOR_MATRIX_OFFSETS].map(
        (name) => [name, z.number().finite()],
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

/** Binary FFmpeg stdout, bounded. */
async function ffmpegBytes(
  args: string[],
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  signal?.throwIfAborted();
  return new Promise((accept, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let size = 0,
      errors = "";
    const abort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) child.kill("SIGKILL");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errors = (errors + String(chunk)).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(signal.reason);
      if (code !== 0 || size > maxBytes)
        return reject(
          Error(
            `comp-look-decode: FFmpeg proxy decode failed (${code}): ${errors}`,
          ),
        );
      accept(Buffer.concat(chunks));
    });
  });
}

/**
 * Frames as display code values: the media path's range/matrix conversion
 * without its BT.709-transfer re-encoding. A graded edit tagged BT.709 transfer
 * is compared in the code values its player shows and Still Shift's export
 * writes (export tags its sRGB-encoded pixels BT.709 without conversion).
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

const PROXY_WIDTH = 36;
/**
 * Small luma proxies of every frame, converted with the media path's color
 * filter, as zero-mean unit vectors for gain/offset-invariant correlation.
 */
export async function colorLumaProxies(
  clip: ColorClip,
  signal?: AbortSignal,
): Promise<Float64Array[]> {
  const width = PROXY_WIDTH,
    height = Math.max(
      8,
      Math.round((PROXY_WIDTH * clip.probe.height) / clip.probe.width),
    );
  const bytes = await ffmpegBytes(
    [
      "-v",
      "error",
      "-nostdin",
      "-i",
      clip.path,
      "-map",
      "0:v:0",
      "-vf",
      `${compositionMediaColorFilter(clip.probe.color)},scale=${width}:${height}:flags=area,format=rgb24`,
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    width * height * 3 * (clip.probe.frameCount + 8),
    signal,
  );
  const size = width * height,
    frames: Float64Array[] = [];
  for (let at = 0; at + size * 3 <= bytes.length; at += size * 3) {
    const vector = new Float64Array(size);
    let mean = 0;
    for (let i = 0; i < size; i++) {
      vector[i] =
        0.2126 * bytes[at + i * 3]! +
        0.7152 * bytes[at + i * 3 + 1]! +
        0.0722 * bytes[at + i * 3 + 2]!;
      mean += vector[i]!;
    }
    mean /= size;
    let norm = 0;
    for (let i = 0; i < size; i++) {
      vector[i]! -= mean;
      norm += vector[i]! ** 2;
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < size; i++) vector[i]! /= norm;
    frames.push(vector);
  }
  return frames;
}
const correlation = (a: Float64Array, b: Float64Array) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
};

/** Hard cuts: consecutive proxy correlation below the threshold. */
export function detectColorShots(
  proxies: readonly Float64Array[],
  threshold = 0.9,
  minimumLength = 3,
): [number, number][] {
  const shots: [number, number][] = [];
  let start = 0;
  for (let i = 1; i < proxies.length; i++)
    if (
      correlation(proxies[i]!, proxies[i - 1]!) < threshold &&
      i - start >= minimumLength
    ) {
      shots.push([start, i]);
      start = i;
    }
  if (proxies.length) shots.push([start, proxies.length]);
  return shots;
}

/** 4×4 pixel blocks: the 16 before and 16 after RGB pixels of each block. */
export type ColorBlockSet = {
  shot: number;
  count: number;
  before: Uint8Array;
  after: Uint8Array;
};
const BLOCK = 4,
  BLOCK_BYTES = BLOCK * BLOCK * 3;
/** Blocks on a `step` grid; frames are straight RGBA8 of one size. */
export function colorBlocks(
  shot: number,
  before: Uint8Array,
  after: Uint8Array,
  width: number,
  height: number,
  step: number,
): ColorBlockSet {
  const columns = Math.floor((width - BLOCK) / step) + 1,
    rows = Math.floor((height - BLOCK) / step) + 1;
  const count = columns * rows;
  const set: ColorBlockSet = {
    shot,
    count,
    before: new Uint8Array(count * BLOCK_BYTES),
    after: new Uint8Array(count * BLOCK_BYTES),
  };
  let at = 0;
  for (let by = 0; by < rows; by++)
    for (let bx = 0; bx < columns; bx++)
      for (let y = 0; y < BLOCK; y++)
        for (let x = 0; x < BLOCK; x++) {
          const i = ((by * step + y) * width + bx * step + x) * 4;
          for (let c = 0; c < 3; c++) {
            set.before[at] = before[i + c]!;
            set.after[at++] = after[i + c]!;
          }
        }
  return set;
}
type BlockMeans = {
  before: Float64Array;
  after: Float64Array;
  usable: Uint8Array;
};
function blockMeans(sets: readonly ColorBlockSet[]): BlockMeans {
  const total = sets.reduce((sum, set) => sum + set.count, 0);
  const means: BlockMeans = {
    before: new Float64Array(total * 3),
    after: new Float64Array(total * 3),
    usable: new Uint8Array(total),
  };
  let block = 0;
  for (const set of sets)
    for (let b = 0; b < set.count; b++, block++) {
      let usable = 1;
      for (let p = 0; p < BLOCK * BLOCK; p++)
        for (let c = 0; c < 3; c++) {
          const i = b * BLOCK_BYTES + p * 3 + c;
          const x = set.before[i]!,
            y = set.after[i]!;
          means.before[block * 3 + c]! += x / (BLOCK * BLOCK * 255);
          means.after[block * 3 + c]! += y / (BLOCK * BLOCK * 255);
          if (x >= 250 || y >= 250 || x <= 4 || y <= 4) usable = 0;
        }
      means.usable[block] = usable;
    }
  return means;
}
/** 4-parameter least squares per output channel over selected blocks. */
function fitMatrix(means: BlockMeans, selected: ArrayLike<number>) {
  const rows: number[][] = [];
  for (let channel = 0; channel < 3; channel++) {
    const a = Array.from({ length: 4 }, () => new Float64Array(4)),
      v = new Float64Array(4);
    const x = [0, 0, 0, 1];
    for (let k = 0; k < selected.length; k++) {
      const block = selected[k]!;
      x[0] = means.before[block * 3]!;
      x[1] = means.before[block * 3 + 1]!;
      x[2] = means.before[block * 3 + 2]!;
      const y = means.after[block * 3 + channel]!;
      for (let i = 0; i < 4; i++) {
        v[i]! += x[i]! * y;
        for (let j = 0; j < 4; j++) a[i]![j]! += x[i]! * x[j]!;
      }
    }
    rows.push(solve4(a, v));
  }
  return rows;
}
function solve4(a: Float64Array[], v: Float64Array): number[] {
  const m = a.map((row, i) => [...row, v[i]!]);
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++)
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-12)
      passageError(
        "comp-look-fit",
        "Look fit is degenerate: the matched frames have too little color variation",
        { path: "before" },
      );
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const factor = m[row]![col]! / p;
      for (let k = col; k < 5; k++) m[row]![k]! -= factor * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[4]! / row[i]!);
}
export function colorMatrixParams(rows: number[][]): Record<string, number> {
  const params: Record<string, number> = {};
  rows.forEach((row, output) => {
    COLOR_MATRIX_COEFFICIENTS[output]!.forEach((name, input) => {
      params[name] = round(row[input]!);
    });
    params[COLOR_MATRIX_OFFSETS[output]!] = round(row[3]!);
  });
  return params;
}
/**
 * Robust fit on 4×4 block means (codec noise and sub-pixel softening average
 * out; the affine map commutes with averaging): least squares over unclipped
 * blocks, drop the worst 5% by residual, refit twice.
 */
function robustFit(sets: readonly ColorBlockSet[]) {
  const means = blockMeans(sets);
  const total = means.usable.length;
  let selected: number[] = [];
  for (let block = 0; block < total; block++)
    if (means.usable[block]) selected.push(block);
  if (selected.length < 64)
    selected = Array.from({ length: total }, (_, block) => block);
  let rows = fitMatrix(means, selected);
  for (let pass = 0; pass < 2; pass++) {
    const errors = selected.map((block) => {
      let error = 0;
      for (let c = 0; c < 3; c++) {
        const predicted =
          rows[c]![0]! * means.before[block * 3]! +
          rows[c]![1]! * means.before[block * 3 + 1]! +
          rows[c]![2]! * means.before[block * 3 + 2]! +
          rows[c]![3]!;
        error += (predicted - means.after[block * 3 + c]!) ** 2;
      }
      return error;
    });
    const order = selected
      .map((block, index) => [block, errors[index]!] as const)
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    selected = order
      .slice(0, Math.max(64, Math.floor(order.length * 0.95)))
      .map(([block]) => block);
    rows = fitMatrix(means, selected);
  }
  return colorMatrixParams(rows);
}
/**
 * Residuals of `color.matrix` (strength 1) through its exact integer path:
 * per pixel (code values) and per 4×4 block mean.
 */
export function colorLookResidual(
  params: Record<string, number>,
  sets: readonly ColorBlockSet[],
): ColorLookResidual {
  const controls = gradeControls("color.matrix", { ...params, strength: 1 });
  const histogram = new Float64Array(256);
  const blockErrors: number[] = [];
  const out = [0, 0, 0];
  let squares = 0,
    blockSquares = 0,
    pixels = 0;
  for (const set of sets)
    for (let b = 0; b < set.count; b++) {
      const predicted = [0, 0, 0],
        target = [0, 0, 0];
      for (let p = 0; p < BLOCK * BLOCK; p++) {
        const i = b * BLOCK_BYTES + p * 3;
        gradeBytes(
          controls,
          set.before[i]!,
          set.before[i + 1]!,
          set.before[i + 2]!,
          out,
        );
        for (let c = 0; c < 3; c++) {
          const error = Math.abs(out[c]! - set.after[i + c]!);
          histogram[error]!++;
          squares += error * error;
          predicted[c]! += out[c]!;
          target[c]! += set.after[i + c]!;
        }
        pixels++;
      }
      for (let c = 0; c < 3; c++) {
        const error = Math.abs(predicted[c]! - target[c]!) / (BLOCK * BLOCK);
        blockErrors.push(error);
        blockSquares += error * error;
      }
    }
  if (!pixels)
    return {
      pixels: 0,
      rms: 0,
      p95: 0,
      p99: 0,
      max: 0,
      blockRms: 0,
      blockP95: 0,
      blockP99: 0,
    };
  const values = pixels * 3;
  const at = (q: number) => {
    let seen = 0;
    for (let error = 0; error < 256; error++) {
      seen += histogram[error]!;
      if (seen >= q * values) return error;
    }
    return 255;
  };
  let max = 0;
  for (let error = 0; error < 256; error++) if (histogram[error]) max = error;
  blockErrors.sort((a, b) => a - b);
  const blockAt = (q: number) =>
    round(
      blockErrors[
        Math.min(blockErrors.length - 1, Math.floor(q * blockErrors.length))
      ]!,
      3,
    );
  return {
    pixels,
    rms: round(Math.sqrt(squares / values), 4),
    p95: at(0.95),
    p99: at(0.99),
    max,
    blockRms: round(Math.sqrt(blockSquares / blockErrors.length), 4),
    blockP95: blockAt(0.95),
    blockP99: blockAt(0.99),
  };
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
            correlation(afterProxies[frame]!, candidate),
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
        const value = correlation(afterProxies[frame]!, candidate);
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
  progress(
    `fitting ${sets.reduce((sum, set) => sum + set.count, 0)} 4×4 blocks`,
  );
  const params = robustFit(sets);
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
      heldOut: others.length ? colorLookResidual(robustFit(others), own) : null,
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
  let lumaBefore = 0,
    lumaAfter = 0;
  const ratios: number[] = [];
  for (const set of sets)
    for (let i = 0; i < set.count * BLOCK_BYTES; i += 3) {
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
  return parseColorLook({
    schemaVersion: COLOR_LOOK_VERSION,
    kind: "color-matrix",
    space: "encoded-srgb",
    params,
    summary: {
      neutralGains,
      lumaChange: round(lumaAfter / lumaBefore - 1, 4),
      saturationScale: round(
        ratios.length ? ratios[ratios.length >> 1]! : 1,
        4,
      ),
    },
    fit: {
      afterInterpretation:
        after.probe.color.transfer === "iec61966-2-1"
          ? "media-path"
          : afterInterpretation,
      afterTransfer: after.probe.color.transfer,
      method:
        "trimmed least squares (95%, 2 passes) on 4x4 block means of encoded-sRGB code values; residuals through the color.matrix integer path",
      pairs: matches.reduce((count, match) => count + match.pairs.length, 0),
      pixels: sets.reduce((sum, set) => sum + set.count * BLOCK * BLOCK, 0),
      residual: colorLookResidual(params, sets),
      heldOut: heldOut.length
        ? {
            rmsMean: round(
              heldOut.reduce((sum, value) => sum + value.rms, 0) /
                heldOut.length,
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
        : null,
      shots: shotsReport,
      unmatchedShots: unmatched,
    },
    sources: {
      before: befores.map((clip) => ({
        name: clip.name,
        sha256: clip.probe.sourceHash,
      })),
      after: { name: after.name, sha256: after.probe.sourceHash },
    },
  });
}

/** `color.matrix` effect parameters for a look at a 0–1 strength. */
export function colorLookEffectParams(look: ColorLook, strength = 1) {
  return {
    ...look.params,
    strength: round(Math.max(0, Math.min(1, strength))),
  };
}
