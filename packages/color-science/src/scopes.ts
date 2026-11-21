/**
 * Scopes and pixel coordinates over straight encoded-sRGB RGBA8 frames.
 *
 * Provenance: ported from chroma-node `src/renderer/scopes/scopeAnalysis.ts`
 * at b804dc0 (GPL-3.0 by the owner's decision, 2026-11-20): luma waveform,
 * RGB parade, vectorscope (BT.709 Cb/Cr), RGB/luma/hue/saturation histograms,
 * CIE 1931 xy, the SDR false-color ranges and the exposure zones.
 * Changes: bins are `floor(v · bins)` clamped (chroma-node scaled by
 * `bins − 1`, so the last bin held one value); the hue histogram skips
 * achromatic pixels (chroma-node counted greys as hue 0, red); frames accept a
 * region and alpha-0 pixels are skipped. The skin-tone line, pixel coordinates
 * (linear, HSL, CIELAB, OKLab) and qualifier suggestions are new.
 */
import { ColorScienceError } from "./errors.ts";
import { transferFunction } from "./transfer.ts";

export type RgbaFrame = {
  width: number;
  height: number;
  rgba: Uint8Array | Uint8ClampedArray;
};
/** Pixel rectangle: x, y of the top-left pixel, width and height in pixels. */
export type Region = { x: number; y: number; width: number; height: number };

const LUMA = [0.2126, 0.7152, 0.0722] as const;
const srgb = transferFunction("srgb");
/** Encoded byte → linear light, by table. */
export const SRGB_LINEAR_TABLE = Float64Array.from({ length: 256 }, (_, v) =>
  srgb.decode(v / 255),
);

export function frameRegion(frame: RgbaFrame, region?: Region): Region {
  const area = region ?? {
    x: 0,
    y: 0,
    width: frame.width,
    height: frame.height,
  };
  if (
    ![area.x, area.y, area.width, area.height].every(Number.isInteger) ||
    area.width < 1 ||
    area.height < 1 ||
    area.x < 0 ||
    area.y < 0 ||
    area.x + area.width > frame.width ||
    area.y + area.height > frame.height
  )
    throw new ColorScienceError(
      `Region ${area.x},${area.y},${area.width},${area.height} must be whole pixels inside the ${frame.width}x${frame.height} frame`,
    );
  if (frame.rgba.length !== frame.width * frame.height * 4)
    throw new ColorScienceError("Frame bytes do not match its size");
  return area;
}

/** Visit every pixel with nonzero alpha inside `region` (whole frame by default). */
export function forEachPixel(
  frame: RgbaFrame,
  visit: (r: number, g: number, b: number, x: number, y: number) => void,
  region?: Region,
) {
  const area = frameRegion(frame, region);
  for (let y = area.y; y < area.y + area.height; y++)
    for (let x = area.x; x < area.x + area.width; x++) {
      const i = (y * frame.width + x) * 4;
      if (frame.rgba[i + 3] === 0) continue;
      visit(frame.rgba[i]!, frame.rgba[i + 1]!, frame.rgba[i + 2]!, x, y);
    }
}

export const binOf = (value: number, bins: number) =>
  Math.min(bins - 1, Math.max(0, Math.floor(value * bins)));

/**
 * Encoded Rec.709 luma Y′ of bytes, 0–1. Neutrals return their value exactly
 * (the three weights sum to 0.9999999999999999 in float64).
 */
export const encodedLuma = (r: number, g: number, b: number) =>
  r === g && g === b
    ? r / 255
    : (LUMA[0] * r + LUMA[1] * g + LUMA[2] * b) / 255;

/** BT.709 Cb, Cr of encoded bytes (each −0.5…0.5). */
export function chroma709(r: number, g: number, b: number): [number, number] {
  const y = encodedLuma(r, g, b);
  return [(b / 255 - y) / 1.8556, (r / 255 - y) / 1.5748];
}

/** HSV hue (degrees, null when achromatic), saturation and value of bytes. */
export function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  let hue: number | null = null;
  if (delta > 0) {
    const h =
      max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
    hue = (((h * 60) % 360) + 360) % 360;
  }
  return { hue, saturation: max ? delta / max : 0, value: max / 255 };
}

export type Histogram2D = {
  columns: number;
  rows: number;
  counts: Uint32Array;
  samples: number;
};
const histogram2D = (columns: number, rows: number): Histogram2D => ({
  columns,
  rows,
  counts: new Uint32Array(columns * rows),
  samples: 0,
});

/** Luma waveform: `columns` across the region; row 0 is Y′ = 1 (as displayed). */
export function lumaWaveform(
  frame: RgbaFrame,
  columns = 256,
  levels = 256,
  region?: Region,
): Histogram2D {
  const area = frameRegion(frame, region);
  const out = histogram2D(columns, levels);
  forEachPixel(
    frame,
    (r, g, b, x) => {
      const column = binOf((x - area.x) / area.width, columns);
      const row = levels - 1 - binOf(encodedLuma(r, g, b), levels);
      out.counts[row * columns + column]!++;
      out.samples++;
    },
    area,
  );
  return out;
}

/** RGB parade: waveforms of the encoded red, green and blue channels. */
export function rgbParade(
  frame: RgbaFrame,
  columns = 256,
  levels = 256,
  region?: Region,
): [Histogram2D, Histogram2D, Histogram2D] {
  const area = frameRegion(frame, region);
  const out: [Histogram2D, Histogram2D, Histogram2D] = [
    histogram2D(columns, levels),
    histogram2D(columns, levels),
    histogram2D(columns, levels),
  ];
  forEachPixel(
    frame,
    (r, g, b, x) => {
      const column = binOf((x - area.x) / area.width, columns);
      const values = [r, g, b];
      for (let c = 0; c < 3; c++) {
        const row = levels - 1 - binOf(values[c]! / 255, levels);
        out[c]!.counts[row * columns + column]!++;
        out[c]!.samples++;
      }
    },
    area,
  );
  return out;
}

/** Vectorscope: Cb across, Cr up (row 0 is Cr = +0.5), −0.5…0.5 each. */
export function vectorscope(
  frame: RgbaFrame,
  size = 256,
  region?: Region,
): Histogram2D {
  const out = histogram2D(size, size);
  forEachPixel(
    frame,
    (r, g, b) => {
      const [cb, cr] = chroma709(r, g, b);
      out.counts[
        (size - 1 - binOf(cr + 0.5, size)) * size + binOf(cb + 0.5, size)
      ]!++;
      out.samples++;
    },
    region,
  );
  return out;
}

/**
 * The conventional vectorscope skin-tone line: 123° counter-clockwise from
 * +Cb (the NTSC I axis), near which most skin tones fall.
 */
export const SKIN_LINE_DEGREES = 123;
/** Vectorscope angle of encoded bytes: degrees from +Cb, counter-clockwise. */
export function vectorscopeAngle(r: number, g: number, b: number): number {
  const [cb, cr] = chroma709(r, g, b);
  return ((Math.atan2(cr, cb) * 180) / Math.PI + 360) % 360;
}

export type Histograms = {
  red: Uint32Array;
  green: Uint32Array;
  blue: Uint32Array;
  luma: Uint32Array;
  /** HSV hue of chromatic pixels only. */
  hue: Uint32Array;
  saturation: Uint32Array;
  samples: number;
  chromatic: number;
};
export function histograms(
  frame: RgbaFrame,
  options: { hueBins?: number; saturationBins?: number } = {},
  region?: Region,
): Histograms {
  const hueBins = options.hueBins ?? 360,
    satBins = options.saturationBins ?? 100;
  const out: Histograms = {
    red: new Uint32Array(256),
    green: new Uint32Array(256),
    blue: new Uint32Array(256),
    luma: new Uint32Array(256),
    hue: new Uint32Array(hueBins),
    saturation: new Uint32Array(satBins),
    samples: 0,
    chromatic: 0,
  };
  forEachPixel(
    frame,
    (r, g, b) => {
      out.red[r]!++;
      out.green[g]!++;
      out.blue[b]!++;
      out.luma[binOf(encodedLuma(r, g, b), 256)]!++;
      const h = hsv(r, g, b);
      out.saturation[binOf(h.saturation, satBins)]!++;
      if (h.hue !== null) {
        out.hue[binOf(h.hue / 360, hueBins)]!++;
        out.chromatic++;
      }
      out.samples++;
    },
    region,
  );
  return out;
}

/** CIE 1931 xy of encoded sRGB bytes (BT.709 primaries, D65); null for black. */
export function chromaticity(
  r: number,
  g: number,
  b: number,
): [number, number] | null {
  const rl = SRGB_LINEAR_TABLE[r]!,
    gl = SRGB_LINEAR_TABLE[g]!,
    bl = SRGB_LINEAR_TABLE[b]!;
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;
  const sum = x + y + z;
  return sum > 0 ? [x / sum, y / sum] : null;
}
/** CIE 1931 xy histogram over x 0–0.8, y 0–0.9; row 0 is y = 0.9. */
export function cieHistogram(
  frame: RgbaFrame,
  size = 256,
  region?: Region,
): Histogram2D {
  const out = histogram2D(size, size);
  forEachPixel(
    frame,
    (r, g, b) => {
      const xy = chromaticity(r, g, b);
      if (!xy) return;
      out.counts[
        (size - 1 - binOf(xy[1] / 0.9, size)) * size + binOf(xy[0] / 0.8, size)
      ]!++;
      out.samples++;
    },
    region,
  );
  return out;
}

/** SDR false-color ranges over encoded luma ×100 (from chroma-node). */
export const FALSE_COLOR_RANGES = [
  { min: 0, max: 10, label: "blacks", rgb: [30, 30, 80] },
  { min: 10, max: 25, label: "shadows", rgb: [0, 0, 120] },
  { min: 25, max: 45, label: "dark-mid", rgb: [0, 60, 120] },
  { min: 45, max: 55, label: "midtones", rgb: [0, 100, 0] },
  { min: 55, max: 70, label: "light-mid", rgb: [120, 120, 0] },
  { min: 70, max: 90, label: "highlights", rgb: [180, 0, 0] },
  { min: 90, max: 100, label: "whites", rgb: [255, 255, 255] },
] as const;
/** False-color class of encoded bytes (luma 100 counts as whites). */
export function falseColorClass(r: number, g: number, b: number): number {
  const ire = encodedLuma(r, g, b) * 100;
  const index = FALSE_COLOR_RANGES.findIndex(
    (range) => ire >= range.min && ire < range.max,
  );
  return index < 0 ? FALSE_COLOR_RANGES.length - 1 : index;
}

/** Ten exposure zones: zone k covers k/10 ≤ Y′ < (k + 1)/10. */
export const exposureZone = (r: number, g: number, b: number) =>
  binOf(encodedLuma(r, g, b), 10);

// --- Pixel coordinates (probe) ------------------------------------------------

export type PixelCoordinates = {
  encoded: [number, number, number];
  linear: [number, number, number];
  /** Hue degrees (0 when achromatic), saturation and lightness 0–1. */
  hsl: [number, number, number];
  /** CIE 1976 L*a*b*, D65, from linear BT.709. */
  lab: [number, number, number];
  /** OKLab (Ottosson 2020), from linear BT.709. */
  oklab: [number, number, number];
};

/** Encoded 0–1 floats → every coordinate the probe reports. */
export function pixelCoordinates(
  encoded: readonly [number, number, number],
): PixelCoordinates {
  const linear = encoded.map((v) => srgb.decode(v)) as [number, number, number];
  const [r, g, b] = encoded;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  let h = 0;
  if (d > 0) {
    h =
      max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h = (((h * 60) % 360) + 360) % 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const [rl, gl, bl] = linear;
  const X = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const Y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const Z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;
  const e = (6 / 29) ** 3;
  const f = (t: number) =>
    t > e ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
  const fx = f(X / 0.95047),
    fy = f(Y),
    fz = f(Z / 1.08883);
  const lab: [number, number, number] = [
    116 * fy - 16,
    500 * (fx - fy),
    200 * (fy - fz),
  ];
  const lms = [
    0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl,
    0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl,
    0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl,
  ].map(Math.cbrt) as [number, number, number];
  const oklab: [number, number, number] = [
    0.2104542553 * lms[0] + 0.793617785 * lms[1] - 0.0040720468 * lms[2],
    1.9779984951 * lms[0] - 2.428592205 * lms[1] + 0.4505937099 * lms[2],
    0.0259040371 * lms[0] + 0.7827717662 * lms[1] - 0.808675766 * lms[2],
  ];
  return {
    encoded: [r, g, b],
    linear,
    hsl: [h, s, l],
    lab,
    oklab,
  };
}

const percentileOf = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.round(q * (sorted.length - 1))),
    )
  ]!;
};

/**
 * HSL qualifier ranges that select a sampled region: hue center and width
 * from the circular 5–95% spread of chromatic pixels (HSL saturation > 0.05),
 * saturation and luma from their 5–95% percentiles; softness is a quarter of
 * each width. Names follow chroma-node's `HslQualifier`; CG6 defines the key.
 */
export function suggestQualifier(frame: RgbaFrame, region?: Region) {
  const hues: number[] = [],
    sats: number[] = [],
    lumas: number[] = [];
  forEachPixel(
    frame,
    (r, g, b) => {
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        l = (max + min) / 510,
        d = (max - min) / 255;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      sats.push(s);
      lumas.push(encodedLuma(r, g, b));
      const h = hsv(r, g, b).hue;
      if (h !== null && s > 0.05) hues.push(h);
    },
    region,
  );
  if (!lumas.length)
    throw new ColorScienceError("The region has no visible pixels to sample");
  let hue: { center: number; width: number; softness: number } | null = null;
  if (hues.length) {
    const sx = hues.reduce((a, h) => a + Math.cos((h * Math.PI) / 180), 0),
      sy = hues.reduce((a, h) => a + Math.sin((h * Math.PI) / 180), 0);
    const mean = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
    const offsets = hues.map((h) => ((h - mean + 540) % 360) - 180);
    const lo = percentileOf(offsets, 0.05),
      hi = percentileOf(offsets, 0.95);
    const width = Math.max(1, hi - lo);
    hue = {
      center: (mean + (lo + hi) / 2 + 360) % 360,
      width,
      softness: width * 0.25,
    };
  }
  const span = (values: number[]) => {
    const min = percentileOf(values, 0.05),
      max = percentileOf(values, 0.95);
    return { min, max, softness: Math.max(0.01, (max - min) * 0.25) };
  };
  return {
    samples: lumas.length,
    hue,
    saturation: span(sats),
    luminance: span(lumas),
  };
}
