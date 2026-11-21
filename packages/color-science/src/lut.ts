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
  /** CG5: a 1D shaper applied before the 3D table (Resolve `.cube`). */
  shaper?: {
    kind: "1d";
    size: number;
    domainMin: [number, number, number];
    domainMax: [number, number, number];
    data: Float64Array;
  };
};

export const MAX_LUT_3D_SIZE = 129;
export const MAX_LUT_1D_SIZE = 65536;

function fail(line: number, message: string): never {
  throw new ColorScienceError(`.cube line ${line}: ${message}`);
}

type Triple = [number, number, number];

/**
 * Parse a `.cube` file: Adobe/Iridas (one `LUT_1D_SIZE` or `LUT_3D_SIZE`,
 * optional `DOMAIN_MIN`/`DOMAIN_MAX`) or Resolve (CG5: both sizes, the 1D
 * shaper's rows first, with `LUT_1D_INPUT_RANGE` / `LUT_3D_INPUT_RANGE`).
 */
export function parseCubeLut(text: string): CubeLut {
  let size1 = 0,
    size3 = 0,
    title: string | undefined;
  let domainMin: Triple | undefined, domainMax: Triple | undefined;
  let range1: [number, number] | undefined,
    range3: [number, number] | undefined;
  const values: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const trimmed = lines[index]!.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const [keyword, ...rest] = trimmed.split(/\s+/);
    const numbers = (count: number) => {
      if (rest.length !== count)
        fail(line, `${keyword} needs ${count} numbers`);
      const nums = rest.map(Number);
      if (!nums.every(Number.isFinite))
        fail(line, `${keyword} values must be finite numbers`);
      return nums;
    };
    const header = () => {
      if (values.length) fail(line, `${keyword} must come before the table`);
    };
    if (keyword === "TITLE") {
      const match = /^TITLE\s+"(.*)"$/.exec(trimmed);
      if (!match) fail(line, "TITLE must be a quoted string");
      title = match[1];
    } else if (keyword === "LUT_3D_SIZE" || keyword === "LUT_1D_SIZE") {
      header();
      const three = keyword === "LUT_3D_SIZE";
      if (three ? size3 : size1) fail(line, `${keyword} is given twice`);
      const size = Number(rest[0]);
      const max = three ? MAX_LUT_3D_SIZE : MAX_LUT_1D_SIZE;
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
      if (three) size3 = size;
      else size1 = size;
    } else if (keyword === "DOMAIN_MIN") {
      header();
      domainMin = numbers(3) as Triple;
    } else if (keyword === "DOMAIN_MAX") {
      header();
      domainMax = numbers(3) as Triple;
    } else if (keyword === "LUT_1D_INPUT_RANGE") {
      header();
      range1 = numbers(2) as [number, number];
    } else if (keyword === "LUT_3D_INPUT_RANGE") {
      header();
      range3 = numbers(2) as [number, number];
    } else if (/^[-+.\d]/.test(keyword!)) {
      if (!size1 && !size3)
        fail(line, "table data before LUT_3D_SIZE or LUT_1D_SIZE");
      const nums = trimmed.split(/\s+/).map(Number);
      if (nums.length !== 3 || !nums.every(Number.isFinite))
        fail(line, "table rows must be three finite numbers");
      values.push(...nums);
    } else fail(line, `unknown keyword ${keyword}`);
  }
  if (!size1 && !size3)
    throw new ColorScienceError(".cube file has no LUT_3D_SIZE or LUT_1D_SIZE");
  const shaped = size1 > 0 && size3 > 0;
  if (shaped && (domainMin || domainMax))
    throw new ColorScienceError(
      ".cube with a shaper uses LUT_1D_INPUT_RANGE and LUT_3D_INPUT_RANGE, not DOMAIN_MIN/MAX",
    );
  const expected = size1 + size3 ** 3;
  if (values.length !== expected * 3)
    throw new ColorScienceError(
      shaped
        ? `.cube shaper size ${size1} and 3D size ${size3}: expected ${expected} entries, found ${values.length / 3}`
        : `.cube ${size3 ? "3D" : "1D"} size ${size3 || size1}: expected ${expected} entries, found ${values.length / 3}`,
    );
  const domain = (
    range: [number, number] | undefined,
    min = range
      ? ([range[0], range[0], range[0]] as Triple)
      : ([0, 0, 0] as Triple),
    max = range
      ? ([range[1], range[1], range[1]] as Triple)
      : ([1, 1, 1] as Triple),
  ) => {
    for (let c = 0; c < 3; c++)
      if (!(max[c]! > min[c]!))
        throw new ColorScienceError(
          ".cube domain must have its maximum above its minimum on every channel",
        );
    return { domainMin: min, domainMax: max };
  };
  const data = Float64Array.from(values);
  const main = size3
    ? {
        kind: "3d" as const,
        size: size3,
        ...(shaped ? domain(range3) : domain(range3, domainMin, domainMax)),
        data: shaped ? data.slice(size1 * 3) : data,
      }
    : {
        kind: "1d" as const,
        size: size1,
        ...domain(range1, domainMin, domainMax),
        data,
      };
  return {
    ...main,
    ...(title === undefined ? {} : { title }),
    ...(shaped
      ? {
          shaper: {
            kind: "1d" as const,
            size: size1,
            ...domain(range1),
            data: data.slice(0, size1 * 3),
          },
        }
      : {}),
  };
}

/** Deterministic `.cube` text (10 decimals); shapers use the Resolve form. */
export function writeCubeLut(lut: CubeLut): string {
  const f = (v: number) => (Object.is(v, -0) ? 0 : v).toFixed(10);
  const lines = [
    ...(lut.title !== undefined
      ? [`TITLE "${lut.title.replace(/"/g, "'")}"`]
      : []),
  ];
  // One push per row: a 65³ table is too many arguments for one call.
  const triples = (data: Float64Array) => {
    for (let i = 0; i < data.length; i += 3)
      lines.push(`${f(data[i]!)} ${f(data[i + 1]!)} ${f(data[i + 2]!)}`);
  };
  const uniform = (min: Triple, max: Triple) =>
    min.every((v) => v === min[0]) && max.every((v) => v === max[0]);
  if (lut.shaper) {
    if (
      !uniform(lut.shaper.domainMin, lut.shaper.domainMax) ||
      !uniform(lut.domainMin, lut.domainMax)
    )
      throw new ColorScienceError(
        "A shaper LUT needs the same range on every channel",
      );
    lines.push(
      `LUT_1D_SIZE ${lut.shaper.size}`,
      `LUT_3D_SIZE ${lut.size}`,
      `LUT_1D_INPUT_RANGE ${f(lut.shaper.domainMin[0])} ${f(lut.shaper.domainMax[0])}`,
      `LUT_3D_INPUT_RANGE ${f(lut.domainMin[0])} ${f(lut.domainMax[0])}`,
    );
    triples(lut.shaper.data);
  } else {
    lines.push(
      `${lut.kind === "3d" ? "LUT_3D_SIZE" : "LUT_1D_SIZE"} ${lut.size}`,
    );
    if (
      lut.domainMin.some((v) => v !== 0) ||
      lut.domainMax.some((v) => v !== 1)
    )
      lines.push(
        `DOMAIN_MIN ${lut.domainMin.map(f).join(" ")}`,
        `DOMAIN_MAX ${lut.domainMax.map(f).join(" ")}`,
      );
  }
  triples(lut.data);
  return lines.join("\n") + "\n";
}

/** A `size`³ 3D LUT over 0–1 holding `transform` at every node. */
export function bakeCubeLut(
  transform: (rgb: Rgb) => Rgb,
  size: number,
  options: { title?: string } = {},
): CubeLut {
  if (!Number.isInteger(size) || size < 2 || size > MAX_LUT_3D_SIZE)
    throw new ColorScienceError(
      `Bake size ${size} must be an integer from 2 to ${MAX_LUT_3D_SIZE}`,
    );
  const data = new Float64Array(size ** 3 * 3);
  const n = size - 1;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const out = transform([r / n, g / n, b / n]);
        data.set(out, ((b * size + g) * size + r) * 3);
      }
  return {
    kind: "3d",
    ...(options.title === undefined ? {} : { title: options.title }),
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
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
  if (lut.shaper) rgb = sample1d(lut.shaper as CubeLut, rgb);
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
