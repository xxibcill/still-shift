/**
 * CG3 measurement: `comp scopes` and `comp grade diff`.
 *
 * A clip is read through the engine's media path (`readColorFrames`), in
 * batches no larger than the composition media limit for live decoded
 * pictures, so any frame range fits the documented memory. The report embeds
 * CGA's `ColorStatistics` unchanged (the same numbers `comp color-stats`
 * prints for the same frames) and adds per-channel black and white points,
 * a hue histogram, the skin-tone line, false-color and exposure-zone shares.
 * Scope images are optional PNGs. Reports are deterministic and validated by
 * `ColorScopesReportSchema` before they are returned.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  binOf,
  cieHistogram,
  encodedLuma,
  exposureZone,
  FALSE_COLOR_RANGES,
  falseColorClass,
  forEachPixel,
  frameRegion,
  hsv,
  lumaWaveform,
  rgbParade,
  ycbcrParade,
  SKIN_LINE_DEGREES,
  vectorscope,
  vectorscopeAngle,
  type Histogram2D,
  type Region,
  type RgbaFrame,
} from "@still-shift/color-science";
import { resolveCompositionMediaLimits } from "@still-shift/scene-contract";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import {
  colorSampleOrdinals,
  openColorClip,
  readColorFrames,
  type ColorClip,
  type ColorFrame,
  type ColorFrameOptions,
} from "./composition-color-frames.ts";
import {
  colorStatisticsAccumulator,
  type ColorStatistics,
} from "./composition-color-measure.ts";
import { encodeColorPng } from "./composition-color-png.ts";
import { roundTo } from "./composition-color-round.ts";

export const COLOR_SCOPES_VERSION = "still-shift-color-scopes-1" as const;
export const COLOR_GRADE_DIFF_VERSION = "still-shift-color-grade-diff-1";
const round = (value: number, digits = 6) => roundTo(value, digits);

/** Which frames and pixels to measure. */
export type ColorScopeSelection = {
  /** Evenly sampled frame count (default 12); ignored with `range`. */
  frames?: number | undefined;
  /** Original ordinals [start, end), end exclusive. */
  range?: readonly [number, number] | undefined;
  region?: Region | undefined;
};

/** Skin-like pixels: HSV hue 0–50°, saturation 0.15–0.75, luma 0.15–0.95. */
export const SKIN_SELECTION = {
  hue: [0, 50],
  saturation: [0.15, 0.75],
  luma: [0.15, 0.95],
} as const;

const channelSchema = z
  .object({ black: z.number(), white: z.number(), mean: z.number() })
  .strict();
const fractions = (length: number) =>
  z.array(z.number().min(0).max(1)).length(length);
export const ColorScopesMeasurementSchema = z
  .object({
    channels: z
      .object({ red: channelSchema, green: channelSchema, blue: channelSchema })
      .strict(),
    hue: z
      .object({
        binDegrees: z.literal(10),
        /** Shares of chromatic pixels per 10° of HSV hue. */
        shares: fractions(36),
        chromaticFraction: z.number().min(0).max(1),
      })
      .strict(),
    skin: z
      .object({
        selection: z.literal(
          "hsv hue 0-50, saturation 0.15-0.75, luma 0.15-0.95",
        ),
        pixels: z.number().int().nonnegative(),
        fraction: z.number().min(0).max(1),
        lineDegrees: z.literal(SKIN_LINE_DEGREES),
        meanAngle: z.number().nullable(),
        deviation: z.number().nullable(),
        spread: z.number().nullable(),
      })
      .strict(),
    falseColor: z
      .array(
        z
          .object({ label: z.string(), share: z.number().min(0).max(1) })
          .strict(),
      )
      .length(FALSE_COLOR_RANGES.length),
    exposureZones: fractions(10),
  })
  .strict();
export type ColorScopesMeasurement = z.infer<
  typeof ColorScopesMeasurementSchema
>;

const regionSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
const inputSchema = z
  .object({
    name: z.string(),
    sha256: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frameCount: z.number().int().positive(),
    color: z.record(z.string(), z.string()),
  })
  .strict();
export const ColorScopesReportSchema = z
  .object({
    schema: z.literal(COLOR_SCOPES_VERSION),
    input: inputSchema,
    selection: z
      .object({
        ordinals: z.array(z.number().int().nonnegative()).min(1),
        region: regionSchema.nullable(),
        batchFrames: z.number().int().positive(),
      })
      .strict(),
    /** CGA's statistics (`comp color-stats`), unchanged. */
    statistics: z.record(z.string(), z.unknown()),
    measurement: ColorScopesMeasurementSchema,
    images: z.array(z.string()),
  })
  .strict();
export type ColorScopesReport = Omit<
  z.infer<typeof ColorScopesReportSchema>,
  "statistics"
> & {
  statistics: ColorStatistics;
};

/** Accumulates the CG3 measurement over frames (region-aware, every pixel). */
function measurementAccumulator(region: Region | undefined) {
  const channels = [
    new Float64Array(256),
    new Float64Array(256),
    new Float64Array(256),
  ];
  const hue = new Float64Array(36);
  const falseColor = new Float64Array(FALSE_COLOR_RANGES.length);
  const zones = new Float64Array(10);
  let samples = 0,
    chromatic = 0,
    skin = 0,
    sx = 0,
    sy = 0;
  const add = (frame: RgbaFrame) =>
    forEachPixel(
      frame,
      (r, g, b) => {
        samples++;
        channels[0]![r]!++;
        channels[1]![g]!++;
        channels[2]![b]!++;
        falseColor[falseColorClass(r, g, b)]!++;
        zones[exposureZone(r, g, b)]!++;
        const h = hsv(r, g, b);
        if (h.hue === null) return;
        chromatic++;
        hue[binOf(h.hue / 360, 36)]!++;
        const y = encodedLuma(r, g, b);
        if (
          h.hue <= SKIN_SELECTION.hue[1] &&
          h.saturation >= SKIN_SELECTION.saturation[0] &&
          h.saturation <= SKIN_SELECTION.saturation[1] &&
          y >= SKIN_SELECTION.luma[0] &&
          y <= SKIN_SELECTION.luma[1]
        ) {
          skin++;
          const angle = (vectorscopeAngle(r, g, b) * Math.PI) / 180;
          sx += Math.cos(angle);
          sy += Math.sin(angle);
        }
      },
      region,
    );
  const finish = (): ColorScopesMeasurement => {
    const channel = (counts: Float64Array) => {
      const at = (q: number) => {
        const target = Math.max(1, Math.ceil(q * samples));
        let seen = 0;
        for (let v = 0; v < 256; v++)
          if ((seen += counts[v]!) >= target) return v / 255;
        return 1;
      };
      let sum = 0;
      for (let v = 0; v < 256; v++) sum += v * counts[v]!;
      return {
        black: round(at(0.005)),
        white: round(at(0.995)),
        mean: round(samples ? sum / samples / 255 : 0),
      };
    };
    const share = (count: number, of: number) => round(of ? count / of : 0);
    let meanAngle: number | null = null,
      spread: number | null = null;
    if (skin) {
      meanAngle = round(((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360, 3);
      const resultant = Math.min(1, Math.hypot(sx, sy) / skin);
      spread = round(
        (Math.sqrt(-2 * Math.log(Math.max(resultant, 1e-12))) * 180) / Math.PI,
        3,
      );
    }
    return {
      channels: {
        red: channel(channels[0]!),
        green: channel(channels[1]!),
        blue: channel(channels[2]!),
      },
      hue: {
        binDegrees: 10,
        shares: [...hue].map((c) => share(c, chromatic)),
        chromaticFraction: share(chromatic, samples),
      },
      skin: {
        selection: "hsv hue 0-50, saturation 0.15-0.75, luma 0.15-0.95",
        pixels: skin,
        fraction: share(skin, samples),
        lineDegrees: SKIN_LINE_DEGREES,
        meanAngle,
        deviation:
          meanAngle === null
            ? null
            : round(((meanAngle - SKIN_LINE_DEGREES + 540) % 360) - 180, 3),
        spread,
      },
      falseColor: FALSE_COLOR_RANGES.map((range, i) => ({
        label: range.label,
        share: share(falseColor[i]!, samples),
      })),
      exposureZones: [...zones].map((c) => share(c, samples)),
    };
  };
  return { add, finish };
}

/**
 * The CG3 measurement of frames already in memory (every pixel, no region):
 * the numbers `comp scopes` reports for the same frames. CGA2 embeds it in
 * the auto-color report for the source and the predicted result.
 */
export function measureColorScopeFrames(
  frames: readonly RgbaFrame[],
): ColorScopesMeasurement {
  const measurement = measurementAccumulator(undefined);
  for (const frame of frames) measurement.add(frame);
  return measurement.finish();
}

const crop = (frame: ColorFrame, region: Region | undefined): ColorFrame => {
  if (!region) return frame;
  const rgba = new Uint8Array(region.width * region.height * 4);
  for (let y = 0; y < region.height; y++)
    rgba.set(
      frame.rgba.subarray(
        ((region.y + y) * frame.width + region.x) * 4,
        ((region.y + y) * frame.width + region.x + region.width) * 4,
      ),
      y * region.width * 4,
    );
  return {
    ordinal: frame.ordinal,
    width: region.width,
    height: region.height,
    rgba,
  };
};

/** Ordinals for a selection, validated against the clip. */
export function colorScopeOrdinals(
  frameCount: number,
  selection: ColorScopeSelection,
): number[] {
  if (selection.range) {
    const [start, end] = selection.range;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end > frameCount ||
      end <= start
    )
      passageError(
        "comp-scope-range",
        `Frame range ${start}:${end} must be whole frames within 0:${frameCount}`,
        {
          path: "frame-range",
        },
      );
    return Array.from({ length: end - start }, (_, i) => start + i);
  }
  return colorSampleOrdinals(frameCount, selection.frames ?? 12);
}

/**
 * Frames per batch so decoded pictures stay within the media limit for live
 * decoded frames; one frame over the limit fails before anything is decoded.
 */
export function colorScopeBatch(
  width: number,
  height: number,
  options: ColorFrameOptions,
) {
  const limit = resolveCompositionMediaLimits(options.limits).decodedFrameBytes;
  const frameBytes = width * height * 4;
  if (frameBytes > limit)
    passageError(
      "comp-scope-limit",
      `One ${width}x${height} frame needs ${frameBytes} decoded bytes, over the media limit of ${limit} (mediaLimits.decodedFrameBytes); measure a smaller source`,
      { path: "input" },
    );
  return Math.max(1, Math.floor(limit / frameBytes));
}

async function forEachBatch(
  clip: ColorClip,
  ordinals: readonly number[],
  options: ColorFrameOptions,
  use: (frames: ColorFrame[]) => void,
) {
  const batch = colorScopeBatch(clip.probe.width, clip.probe.height, options);
  for (let i = 0; i < ordinals.length; i += batch) {
    options.signal?.throwIfAborted();
    use(await readColorFrames(clip, ordinals.slice(i, i + batch), options));
  }
  return batch;
}

type ScopeImages = {
  waveform: Histogram2D;
  parade: [Histogram2D, Histogram2D, Histogram2D];
  ycbcr: [Histogram2D, Histogram2D, Histogram2D];
  vectorscope: Histogram2D;
  cie: Histogram2D;
};
const addInto = (into: Histogram2D, from: Histogram2D) => {
  for (let i = 0; i < into.counts.length; i++)
    into.counts[i]! += from.counts[i]!;
  into.samples += from.samples;
};

/** Log-scaled scope image: brightness log(1 + count) / log(1 + peak). */
function scopeImage(
  histograms: readonly Histogram2D[],
  tints: readonly (readonly [number, number, number])[],
  guides?: (rgba: Uint8Array, size: number) => void,
) {
  const h = histograms[0]!;
  const width = h.columns * histograms.length,
    height = h.rows;
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < rgba.length; p += 4) rgba[p + 3] = 255;
  histograms.forEach((hist, panel) => {
    let peak = 0;
    for (const c of hist.counts) peak = Math.max(peak, c);
    const scale = peak ? 1 / Math.log1p(peak) : 0;
    for (let row = 0; row < hist.rows; row++)
      for (let column = 0; column < hist.columns; column++) {
        const value =
          Math.log1p(hist.counts[row * hist.columns + column]!) * scale;
        const at = (row * width + panel * hist.columns + column) * 4;
        for (let c = 0; c < 3; c++)
          rgba[at + c] = Math.round(value * tints[panel]![c]!);
      }
  });
  guides?.(rgba, width);
  return encodeColorPng(width, height, rgba);
}

/** Skin-tone line on the vectorscope image, in a dim orange. */
function skinLine(rgba: Uint8Array, size: number) {
  const radians = (SKIN_LINE_DEGREES * Math.PI) / 180;
  for (let t = 0; t <= size / 2; t++) {
    const column = Math.round(size / 2 + Math.cos(radians) * t),
      row = Math.round(size / 2 - Math.sin(radians) * t);
    if (column < 0 || column >= size || row < 0 || row >= size) continue;
    const at = (row * size + column) * 4;
    rgba[at] = Math.max(rgba[at]!, 160);
    rgba[at + 1] = Math.max(rgba[at + 1]!, 90);
  }
}

export type ColorScopesOptions = ColorFrameOptions & {
  /** A new directory for waveform, RGB/YRGB/YCbCr parade, vectorscope and CIE PNGs. */
  imagesDirectory?: string | undefined;
};

export async function measureColorScopes(
  input: string,
  selection: ColorScopeSelection = {},
  options: ColorScopesOptions = {},
): Promise<ColorScopesReport> {
  const clip = await openColorClip(input, options);
  const { width, height } = clip.probe;
  const region = selection.region
    ? frameRegion(
        { width, height, rgba: new Uint8Array(width * height * 4) },
        selection.region,
      )
    : undefined;
  const ordinals = colorScopeOrdinals(clip.probe.frameCount, selection);
  const statistics = colorStatisticsAccumulator(region?.width ?? width);
  const measurement = measurementAccumulator(region);
  const empty = (): Histogram2D => ({
    columns: 256,
    rows: 256,
    counts: new Uint32Array(256 * 256),
    samples: 0,
  });
  const images: ScopeImages | undefined = options.imagesDirectory
    ? {
        waveform: empty(),
        parade: [empty(), empty(), empty()],
        ycbcr: [empty(), empty(), empty()],
        vectorscope: empty(),
        cie: empty(),
      }
    : undefined;
  const batchFrames = await forEachBatch(clip, ordinals, options, (frames) => {
    for (const frame of frames) {
      statistics.add(crop(frame, region));
      measurement.add(frame);
      if (images) {
        addInto(images.waveform, lumaWaveform(frame, 256, 256, region));
        rgbParade(frame, 256, 256, region).forEach((h, c) =>
          addInto(images.parade[c]!, h),
        );
        ycbcrParade(frame, 256, 256, region).forEach((h, c) =>
          addInto(images.ycbcr[c]!, h),
        );
        addInto(images.vectorscope, vectorscope(frame, 256, region));
        addInto(images.cie, cieHistogram(frame, 256, region));
      }
    }
  });
  const written: string[] = [];
  if (images && options.imagesDirectory) {
    await mkdir(options.imagesDirectory, { recursive: false });
    const files: [string, Buffer][] = [
      ["waveform.png", scopeImage([images.waveform], [[230, 230, 230]])],
      [
        "parade.png",
        scopeImage(images.parade, [
          [255, 70, 70],
          [70, 255, 70],
          [90, 120, 255],
        ]),
      ],
      [
        "parade-yrgb.png",
        scopeImage(
          [images.waveform, ...images.parade],
          [
            [230, 230, 230],
            [255, 70, 70],
            [70, 255, 70],
            [90, 120, 255],
          ],
        ),
      ],
      [
        "parade-ycbcr.png",
        scopeImage(images.ycbcr, [
          [230, 230, 230],
          [90, 120, 255],
          [255, 70, 70],
        ]),
      ],
      [
        "vectorscope.png",
        scopeImage([images.vectorscope], [[230, 230, 230]], skinLine),
      ],
      ["cie1931.png", scopeImage([images.cie], [[230, 230, 230]])],
    ];
    for (const [name, bytes] of files) {
      await writeFile(join(options.imagesDirectory, name), bytes, {
        flag: "wx",
      });
      written.push(name);
    }
  }
  const report = {
    schema: COLOR_SCOPES_VERSION,
    input: {
      name: clip.name,
      sha256: clip.probe.sourceHash,
      width,
      height,
      frameCount: clip.probe.frameCount,
      color: clip.probe.color as Record<string, string>,
    },
    selection: { ordinals, region: region ?? null, batchFrames },
    statistics: statistics.finish(),
    measurement: measurement.finish(),
    images: written,
  };
  ColorScopesReportSchema.parse(report);
  return report;
}

// --- comp grade diff ---------------------------------------------------------

export type ColorGradeDiffOptions = ColorFrameOptions & {
  frames?: number | undefined;
  /** PNG: the middle sampled frame, before on the left half, after on the right. */
  still?: string | undefined;
  /** PNG: one row per sampled frame, before | after, each cell `cellWidth` wide. */
  sheet?: string | undefined;
  cellWidth?: number | undefined;
};

/** Box-average downscale of straight RGBA8 to `width` (height keeps the aspect). */
function downscale(frame: ColorFrame, width: number) {
  const scale = frame.width / width;
  const height = Math.max(1, Math.round(frame.height / scale));
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * scale),
        x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      const y0 = Math.floor((y * frame.height) / height),
        y1 = Math.max(y0 + 1, Math.floor(((y + 1) * frame.height) / height));
      const sum = [0, 0, 0, 0];
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++)
          for (let c = 0; c < 4; c++)
            sum[c]! += frame.rgba[(yy * frame.width + xx) * 4 + c]!;
      const n = (x1 - x0) * (y1 - y0);
      for (let c = 0; c < 4; c++)
        out[(y * width + x) * 4 + c] = Math.round(sum[c]! / n);
    }
  return { width, height, rgba: out };
}

/** PNG: before on the left half, after on the right, a white seam between. */
function splitStill(b: ColorFrame, a: ColorFrame) {
  const rgba = new Uint8Array(b.rgba);
  const half = Math.floor(b.width / 2);
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const at = (y * b.width + x) * 4;
      if (x >= half) rgba.set(a.rgba.subarray(at, at + 4), at);
      if (x === half - 1 || x === half) rgba.set([255, 255, 255, 255], at);
    }
  return encodeColorPng(b.width, b.height, rgba);
}

/** PNG: one row per cell pair, before | after, 4 px black gaps. */
function contactSheet(
  before: readonly ColorFrame[],
  after: readonly ColorFrame[],
) {
  const cell = before[0]!;
  const gap = 4;
  const width = cell.width * 2 + gap,
    height = before.length * (cell.height + gap) - gap;
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 3; p < rgba.length; p += 4) rgba[p] = 255;
  [before, after].forEach((column, side) =>
    column.forEach((f, row) => {
      for (let y = 0; y < f.height; y++)
        rgba.set(
          f.rgba.subarray(y * f.width * 4, (y + 1) * f.width * 4),
          ((row * (cell.height + gap) + y) * width +
            side * (cell.width + gap)) *
            4,
        );
    }),
  );
  return encodeColorPng(width, height, rgba);
}

const diffCell = (frame: ColorFrame, cellWidth: number): ColorFrame => ({
  ordinal: frame.ordinal,
  ...downscale(frame, Math.min(cellWidth, frame.width)),
});

/**
 * `comp grade diff`'s split still and contact sheet from frames already in
 * memory (CGA2 `--diff`): the same images `diffColorGrade` writes for the
 * same before and after frames. Frames pair by position and share one size;
 * the still shows the middle pair. Returns the PNG bytes; the caller writes
 * them (never over an existing file).
 */
export function colorGradeDiffImages(
  before: readonly ColorFrame[],
  after: readonly ColorFrame[],
  options: { cellWidth?: number | undefined } = {},
): { still: Buffer; sheet: Buffer } {
  if (
    !before.length ||
    before.length !== after.length ||
    before.some(
      (frame, i) =>
        frame.width !== after[i]!.width || frame.height !== after[i]!.height,
    )
  )
    passageError(
      "comp-grade-diff-size",
      "Before and after need the same number of frames of one size",
      { path: "after" },
    );
  const cellWidth = options.cellWidth ?? 320;
  const middle = Math.floor(before.length / 2);
  return {
    still: splitStill(before[middle]!, after[middle]!),
    sheet: contactSheet(
      before.map((frame) => diffCell(frame, cellWidth)),
      after.map((frame) => diffCell(frame, cellWidth)),
    ),
  };
}

const DIFF_FIELDS = [
  ["luma", "p05"],
  ["luma", "p50"],
  ["luma", "p95"],
  ["luma", "mean"],
  ["saturation", "p50"],
  ["saturation", "p90"],
  ["neutral", "temperature"],
  ["neutral", "tint"],
] as const;

export async function diffColorGrade(
  before: string,
  after: string,
  options: ColorGradeDiffOptions = {},
) {
  const clips = [
    await openColorClip(before, options),
    await openColorClip(after, options),
  ] as const;
  if (
    clips[0].probe.width !== clips[1].probe.width ||
    clips[0].probe.height !== clips[1].probe.height
  )
    passageError(
      "comp-grade-diff-size",
      `Before is ${clips[0].probe.width}x${clips[0].probe.height} and after is ${clips[1].probe.width}x${clips[1].probe.height}; compare clips of one size`,
      { path: "after" },
    );
  const frameCount = Math.min(
    clips[0].probe.frameCount,
    clips[1].probe.frameCount,
  );
  const ordinals = colorSampleOrdinals(frameCount, options.frames ?? 12);
  const cellWidth = options.cellWidth ?? 320;
  const middle = ordinals[Math.floor(ordinals.length / 2)]!;
  const results: {
    name: string;
    sha256: string;
    statistics: ColorStatistics;
    measurement: ColorScopesMeasurement;
  }[] = [];
  /** Full-size middle frame (for the still) and downscaled cells (sheet). */
  const stills: ColorFrame[] = [];
  const cells: ColorFrame[][] = [[], []];
  for (const [side, clip] of clips.entries()) {
    const statistics = colorStatisticsAccumulator(clip.probe.width);
    const measurement = measurementAccumulator(undefined);
    await forEachBatch(clip, ordinals, options, (frames) => {
      for (const frame of frames) {
        statistics.add(frame);
        measurement.add(frame);
        if (options.still && frame.ordinal === middle) stills[side] = frame;
        if (options.sheet) cells[side]!.push(diffCell(frame, cellWidth));
      }
    });
    results.push({
      name: clip.name,
      sha256: clip.probe.sourceHash,
      statistics: statistics.finish(),
      measurement: measurement.finish(),
    });
  }
  const pick = (s: ColorStatistics, group: string, key: string) =>
    (s as unknown as Record<string, Record<string, number>>)[group]![key]!;
  const changes = Object.fromEntries(
    DIFF_FIELDS.map(([group, key]) => [
      `${group}.${key}`,
      round(
        pick(results[1]!.statistics, group, key) -
          pick(results[0]!.statistics, group, key),
        group === "neutral" ? 3 : 6,
      ),
    ]),
  );
  const outputs: Record<string, string> = {};
  if (options.still) {
    await writeFile(options.still, splitStill(stills[0]!, stills[1]!), {
      flag: "wx",
    });
    outputs.still = options.still;
  }
  if (options.sheet) {
    await writeFile(options.sheet, contactSheet(cells[0]!, cells[1]!), {
      flag: "wx",
    });
    outputs.sheet = options.sheet;
  }
  return {
    schema: COLOR_GRADE_DIFF_VERSION,
    ordinals,
    before: results[0]!,
    after: results[1]!,
    changes,
    outputs,
  };
}
