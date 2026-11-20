/**
 * `.cube` LUTs (1D and 3D) and their interpolation, float64.
 *
 * Provenance: the parser's line handling and the trilinear sampler are ported
 * from chroma-node `parseTechnicalLut` / `applyLutTrilinear`
 * (`src/shared/colorEngine.ts`, b804dc0). Changes, each a CG0 failure there:
 * table values are no longer clamped to 0–1, `DOMAIN_MIN`/`DOMAIN_MAX` are
 * honoured (chroma-node ignored them: 0.27 error on the CG0 domain LUT),
 * malformed lines are errors with their line number instead of being skipped,
 * and tetrahedral interpolation is new (chroma-node's "tetrahedral" path was
 * trilinear: 5.5e-3 error).
 */
import { ColorScienceError } from "./errors.ts";
import type { Rgb } from "./matrix.ts";

export type CubeLut = {
  kind: "1d" | "3d";
  title?: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  /** RGB triples; 3D in .cube order (red fastest, then green, then blue). */
  data: Float64Array;
};

export const MAX_LUT_3D_SIZE = 129;
export const MAX_LUT_1D_SIZE = 65536;

function fail(line: number, message: string): never {
  throw new ColorScienceError(`.cube line ${line}: ${message}`);
}

export function parseCubeLut(text: string): CubeLut {
  let kind: "1d" | "3d" | undefined,
    size = 0,
    title: string | undefined;
  let domainMin: [number, number, number] = [0, 0, 0],
    domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const trimmed = lines[index]!.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const [keyword, ...rest] = trimmed.split(/\s+/);
    const triple = () => {
      if (rest.length !== 3) fail(line, `${keyword} needs three numbers`);
      const nums = rest.map(Number);
      if (!nums.every(Number.isFinite))
        fail(line, `${keyword} values must be finite numbers`);
      return nums as [number, number, number];
    };
    if (keyword === "TITLE") {
      const match = /^TITLE\s+"(.*)"$/.exec(trimmed);
      if (!match) fail(line, "TITLE must be a quoted string");
      title = match[1];
    } else if (keyword === "LUT_3D_SIZE" || keyword === "LUT_1D_SIZE") {
      if (kind) fail(line, "only one LUT_3D_SIZE or LUT_1D_SIZE is supported");
      if (values.length) fail(line, `${keyword} must come before the table`);
      kind = keyword === "LUT_3D_SIZE" ? "3d" : "1d";
      size = Number(rest[0]);
      const max = kind === "3d" ? MAX_LUT_3D_SIZE : MAX_LUT_1D_SIZE;
      if (
        rest.length !== 1 ||
        !Number.isInteger(size) ||
        size < 2 ||
        size > max
      )
        fail(
          line,
          `${keyword} size ${rest.join(" ")} must be an integer from 2 to ${max}`,
        );
    } else if (keyword === "DOMAIN_MIN") domainMin = triple();
    else if (keyword === "DOMAIN_MAX") domainMax = triple();
    else if (/^[-+.\d]/.test(keyword!)) {
      if (!kind) fail(line, "table data before LUT_3D_SIZE or LUT_1D_SIZE");
      const nums = trimmed.split(/\s+/).map(Number);
      if (nums.length !== 3 || !nums.every(Number.isFinite))
        fail(line, "table rows must be three finite numbers");
      values.push(...nums);
    } else fail(line, `unknown keyword ${keyword}`);
  }
  if (!kind)
    throw new ColorScienceError(".cube file has no LUT_3D_SIZE or LUT_1D_SIZE");
  const expected = kind === "3d" ? size ** 3 : size;
  if (values.length !== expected * 3)
    throw new ColorScienceError(
      `.cube ${kind.toUpperCase()} size ${size}: expected ${expected} entries, found ${values.length / 3}`,
    );
  for (let c = 0; c < 3; c++)
    if (!(domainMax[c]! > domainMin[c]!))
      throw new ColorScienceError(
        `.cube domain must have DOMAIN_MAX above DOMAIN_MIN on every channel`,
      );
  return {
    kind,
    ...(title === undefined ? {} : { title }),
    size,
    domainMin,
    domainMax,
    data: Float64Array.from(values),
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Scale an input to table index space, clamped to the domain (as OpenColorIO). */
function index(lut: CubeLut, rgb: Rgb): [number, number, number] {
  const n = lut.size - 1;
  return [0, 1, 2].map((c) => {
    const lo = lut.domainMin[c]!,
      hi = lut.domainMax[c]!;
    return ((clamp(rgb[c]!, lo, hi) - lo) / (hi - lo)) * n;
  }) as [number, number, number];
}

function sample1d(lut: CubeLut, rgb: Rgb): [number, number, number] {
  const scaled = index(lut, rgb);
  const n = lut.size - 1;
  return [0, 1, 2].map((c) => {
    const x = scaled[c]!;
    const i = Math.min(Math.floor(x), n - 1);
    const t = x - i;
    const a = lut.data[i * 3 + c]!,
      b = lut.data[(i + 1) * 3 + c]!;
    return a + (b - a) * t;
  }) as [number, number, number];
}

export type LutInterpolation = "tetrahedral" | "trilinear";

export function sampleLut(
  lut: CubeLut,
  rgb: Rgb,
  interpolation: LutInterpolation = "tetrahedral",
): [number, number, number] {
  if (lut.kind === "1d") return sample1d(lut, rgb);
  const n = lut.size - 1;
  const [x, y, z] = index(lut, rgb);
  const r0 = Math.min(Math.floor(x), n - 1),
    g0 = Math.min(Math.floor(y), n - 1),
    b0 = Math.min(Math.floor(z), n - 1);
  const fr = x - r0,
    fg = y - g0,
    fb = z - b0;
  const at = (r: number, g: number, b: number, c: number) =>
    lut.data[((b * lut.size + g) * lut.size + r) * 3 + c]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c000 = at(r0, g0, b0, c),
      c100 = at(r0 + 1, g0, b0, c),
      c010 = at(r0, g0 + 1, b0, c),
      c001 = at(r0, g0, b0 + 1, c);
    const c110 = at(r0 + 1, g0 + 1, b0, c),
      c101 = at(r0 + 1, g0, b0 + 1, c),
      c011 = at(r0, g0 + 1, b0 + 1, c),
      c111 = at(r0 + 1, g0 + 1, b0 + 1, c);
    if (interpolation === "trilinear") {
      const c00 = c000 + (c100 - c000) * fr,
        c10 = c010 + (c110 - c010) * fr;
      const c01 = c001 + (c101 - c001) * fr,
        c11 = c011 + (c111 - c011) * fr;
      const c0 = c00 + (c10 - c00) * fg,
        c1 = c01 + (c11 - c01) * fg;
      out[c] = c0 + (c1 - c0) * fb;
    } else if (fr > fg) {
      if (fg > fb)
        out[c] =
          c000 + fr * (c100 - c000) + fg * (c110 - c100) + fb * (c111 - c110);
      else if (fr > fb)
        out[c] =
          c000 + fr * (c100 - c000) + fb * (c101 - c100) + fg * (c111 - c101);
      else
        out[c] =
          c000 + fb * (c001 - c000) + fr * (c101 - c001) + fg * (c111 - c101);
    } else if (fb > fg)
      out[c] =
        c000 + fb * (c001 - c000) + fg * (c011 - c001) + fr * (c111 - c011);
    else if (fb > fr)
      out[c] =
        c000 + fg * (c010 - c000) + fb * (c011 - c010) + fr * (c111 - c011);
    else
      out[c] =
        c000 + fg * (c010 - c000) + fr * (c110 - c010) + fb * (c111 - c110);
  }
  return out;
}
