/**
 * CG3: scope statistics on the CG0 synthetic stills against analytically
 * known values.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import {
  chroma709,
  chromaticity,
  cieHistogram,
  exposureZone,
  falseColorClass,
  FALSE_COLOR_RANGES,
  forEachPixel,
  histograms,
  hsv,
  lumaWaveform,
  pixelCoordinates,
  rgbParade,
  suggestQualifier,
  vectorscope,
  vectorscopeAngle,
  ycbcrParade,
  type RgbaFrame,
} from "@still-shift/color-science";

const still = (id: string): RgbaFrame =>
  decodeCompositionRgbaPng(
    readFileSync(
      join(
        import.meta.dirname,
        `../../benchmarks/fixtures/color/cg0/stills/${id}.png`,
      ),
    ),
  );
const manifest = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "../../benchmarks/fixtures/color/cg0/manifest.json",
    ),
    "utf8",
  ),
) as { files: { id: string; values?: Record<string, unknown> }[] };
const values = (id: string) => manifest.files.find((f) => f.id === id)!.values!;

describe("waveform, parade and histograms on ramps", () => {
  const ramp = still("gray-ramp-256");
  it("the gray ramp's waveform is the diagonal: column x holds 32 samples at level x", () => {
    const w = lumaWaveform(ramp);
    expect(w.samples).toBe(256 * 32);
    for (let x = 0; x < 256; x++)
      expect(w.counts[(255 - x) * 256 + x]).toBe(32);
  });
  it("the gray ramp's luma histogram is flat (32 per code value)", () => {
    const h = histograms(ramp);
    expect([...h.luma].every((c) => c === 32)).toBe(true);
    expect(h.chromatic).toBe(0);
    expect(h.saturation[0]).toBe(256 * 32);
  });
  it("RGB ramps: each parade channel traces its own band and zero elsewhere", () => {
    const frame = still("rgb-ramps");
    const parade = rgbParade(frame);
    for (let c = 0; c < 3; c++) {
      // Level x in column x: 32 from the channel's own band (+64 more at 0).
      for (let x = 1; x < 256; x++)
        expect(parade[c]!.counts[(255 - x) * 256 + x]).toBe(32);
      expect(parade[c]!.counts[255 * 256 + 5]).toBe(64);
    }
    const h = histograms(frame);
    expect(h.red[0]).toBe(32 + 64 * 256);
    expect(h.red[200]).toBe(32);
  });
  it("YCbCr parade: the gray ramp's Y′ is the diagonal and its chroma sits at neutral", () => {
    const [y, cb, cr] = ycbcrParade(ramp);
    for (let x = 0; x < 256; x++) {
      expect(y.counts[(255 - x) * 256 + x]).toBe(32);
      // Cb = Cr = 0 → 0.5 → bin 128, drawn at row 127.
      expect(cb.counts[127 * 256 + x]).toBe(32);
      expect(cr.counts[127 * 256 + x]).toBe(32);
    }
    expect(cb.samples).toBe(256 * 32);
  });
  it("YCbCr parade: BT.709 primaries land at their analytic Cb/Cr", () => {
    const rgba = new Uint8Array(3 * 4);
    rgba.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const [y, cb, cr] = ycbcrParade({ width: 3, height: 1, rgba }, 3, 256);
    const rowOf = (h: typeof y, column: number) => {
      for (let row = 0; row < 256; row++)
        if (h.counts[row * 3 + column]) return row;
      return -1;
    };
    // Red: Y′ 0.2126, Cr +0.5 (top row); blue: Cb +0.5 (top row).
    expect(rowOf(y, 0)).toBe(255 - Math.floor(0.2126 * 256));
    expect(rowOf(cr, 0)).toBe(0);
    expect(rowOf(cb, 2)).toBe(0);
    // Green: Cb and Cr both negative.
    expect(rowOf(cb, 1)).toBeGreaterThan(127);
    expect(rowOf(cr, 1)).toBeGreaterThan(127);
  });
});

describe("hue, saturation and vectorscope on sweeps", () => {
  it("hue sweep: every pixel's hue is its column within byte rounding", () => {
    const frame = still("hue-sweep");
    let worst = 0;
    forEachPixel(frame, (r, g, b, x) => {
      const hue = hsv(r, g, b).hue!;
      worst = Math.max(worst, Math.abs(((hue - x + 540) % 360) - 180));
    });
    expect(worst).toBeLessThan(0.6);
    const h = histograms(frame);
    expect(h.chromatic).toBe(360 * 64);
    // One degree per bin: each bin gets about 64 pixels.
    expect(Math.max(...h.hue)).toBeLessThanOrEqual(128);
  });
  it("saturation sweep: HSV saturation of column x is x/255 within byte rounding", () => {
    const frame = still("saturation-sweep");
    let worst = 0;
    forEachPixel(frame, (r, g, b, x) => {
      worst = Math.max(worst, Math.abs(hsv(r, g, b).saturation - x / 255));
    });
    expect(worst).toBeLessThan(1 / (255 * 0.8) + 1e-12);
  });
  it("BT.709 primaries sit at their analytic vectorscope positions", () => {
    expect(chroma709(255, 0, 0)[1]).toBeCloseTo(0.5, 12);
    expect(chroma709(0, 0, 255)[0]).toBeCloseTo(0.5, 12);
    expect(vectorscopeAngle(255, 0, 0)).toBeCloseTo(103, 0);
    const v = vectorscope({
      width: 1,
      height: 1,
      rgba: new Uint8Array([128, 128, 128, 255]),
    });
    // Neutral: the centre cell.
    expect(v.counts[(255 - 128) * 256 + 128]).toBe(1);
  });
  it("skin tones fall near the skin-tone line", () => {
    const frame = still("skin-tones");
    const angles: number[] = [];
    forEachPixel(frame, (r, g, b) => angles.push(vectorscopeAngle(r, g, b)));
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
    expect(Math.abs(mean - 123)).toBeLessThan(15);
  });
});

describe("chromaticity, false color and exposure zones", () => {
  it("the chart's neutral patches are D65", () => {
    const chart = still("chart-24");
    const encoded = values("chart-24").encoded as number[][];
    for (const patch of encoded.slice(18)) {
      const xy = chromaticity(patch[0]!, patch[1]!, patch[2]!)!;
      expect(xy[0]).toBeCloseTo(0.3127, 4);
      expect(xy[1]).toBeCloseTo(0.329, 4);
    }
    expect(chromaticity(0, 0, 0)).toBeNull();
    expect(cieHistogram(chart).samples).toBe(384 * 256);
  });
  it("gray ramp shares per false-color class follow the class bounds", () => {
    const counts = new Array(FALSE_COLOR_RANGES.length).fill(0);
    for (let x = 0; x < 256; x++) counts[falseColorClass(x, x, x)]++;
    // blacks: luma×100 < 10 → x ≤ 25; whites: ≥ 90 → x ≥ 230 (and 255).
    expect(counts[0]).toBe(26);
    expect(counts[FALSE_COLOR_RANGES.length - 1]).toBe(256 - 230);
    for (let x = 0; x < 256; x++)
      expect(exposureZone(x, x, x)).toBe(
        Math.min(9, Math.floor((x / 255) * 10)),
      );
  });
});

describe("pixel coordinates and qualifier suggestion", () => {
  it("white, mid grey and red in linear, HSL, CIELAB and OKLab", () => {
    const white = pixelCoordinates([1, 1, 1]);
    expect(white.linear).toEqual([1, 1, 1]);
    expect(white.lab[0]).toBeCloseTo(100, 3);
    expect(Math.abs(white.lab[1])).toBeLessThan(1e-3);
    expect(white.oklab[0]).toBeCloseTo(1, 4);
    const grey = pixelCoordinates([0.4613561295, 0.4613561295, 0.4613561295]);
    expect(grey.linear[0]).toBeCloseTo(0.18, 9);
    expect(grey.lab[0]).toBeCloseTo(116 * Math.cbrt(0.18) - 16, 3);
    const red = pixelCoordinates([1, 0, 0]);
    expect(red.hsl).toEqual([0, 1, 0.5]);
    expect(red.oklab[0]).toBeCloseTo(0.62796, 4);
  });
  it("a single chart patch suggests a narrow qualifier around its own values", () => {
    const chart = still("chart-24");
    const encoded = values("chart-24").encoded as number[][];
    const patch = encoded[6]!; // orange
    const q = suggestQualifier(chart, {
      x: 6 * 64 * 0 + 10,
      y: 64 + 10,
      width: 40,
      height: 40,
    });
    const hue = hsv(patch[0]!, patch[1]!, patch[2]!).hue!;
    expect(q.hue!.center).toBeCloseTo(hue, 6);
    expect(q.hue!.width).toBe(1);
    expect(q.luminance.min).toBe(q.luminance.max);
  });
  it("rejects regions outside the frame", () => {
    expect(() =>
      histograms(
        still("gray-ramp-256"),
        {},
        { x: 250, y: 0, width: 10, height: 1 },
      ),
    ).toThrow(/inside/);
  });
});
