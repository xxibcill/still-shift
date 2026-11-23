/**
 * CG7: working spaces, explicit color-space conversions and media input
 * transforms, float64. New code (nothing from chroma-node); every piece is a
 * composition of the CG0-validated transfer functions, primaries and input
 * transforms, checked against the CG0 vectors (OpenColorIO utility transforms
 * use Bradford for a white change, as here) and BT.2408 reference points.
 *
 * Design: docs/color-grading-cg7-decisions.md. A color-managed composition
 * grades in its working space; every value leaves it through the CG7 display
 * transform (to encoded sRGB, BT.709 primaries), whose clip to 0–1 is the
 * quantizer's clamp on exit. A legacy composition's working space is encoded
 * sRGB itself, so nothing converts.
 */
import { ColorScienceError } from "./errors.ts";
import { apply, IDENTITY, invert, type Mat3, type Rgb } from "./matrix.ts";
import {
  colorSpace,
  lumaCoefficients,
  rgbConversionMatrix,
} from "./primaries.ts";
import { inputTransform, INPUT_TRANSFORMS } from "./input-transforms.ts";
import { transferFunction } from "./transfer.ts";

/** A composition's working space; `legacy-srgb` is today's (no color management). */
export const WORKING_SPACES = [
  "legacy-srgb",
  "acescct",
  "acescg",
  "linear-bt709",
] as const;
export type WorkingSpace = (typeof WORKING_SPACES)[number];
/** The owner's default for a color-managed composition (2026-11-23). */
export const DEFAULT_MANAGED_WORKING_SPACE: WorkingSpace = "acescct";

/**
 * Spaces `grade.color-space-transform` and LUT assets name. The index is the
 * effect's integer code; append only.
 */
export const COLOR_SPACE_TRANSFORM_SPACES = [
  "acescct",
  "acescg",
  "aces2065-1",
  "linear-bt709",
  "srgb",
  "linear-bt2020",
  "linear-p3-d65",
] as const;
export type ConversionSpace = (typeof COLOR_SPACE_TRANSFORM_SPACES)[number];

/** A space as its RGB primaries (a `primaries.ts` id) and an optional curve. */
export type SpaceEncoding = {
  readonly gamut: string;
  readonly curve: string | null;
};
const SPACES: Readonly<Record<ConversionSpace, SpaceEncoding>> = {
  acescct: { gamut: "aces-ap1", curve: "acescct" },
  acescg: { gamut: "aces-ap1", curve: null },
  "aces2065-1": { gamut: "aces-ap0", curve: null },
  "linear-bt709": { gamut: "bt709", curve: null },
  srgb: { gamut: "srgb", curve: "srgb" },
  "linear-bt2020": { gamut: "bt2020", curve: null },
  "linear-p3-d65": { gamut: "p3-d65", curve: null },
};

export function spaceEncoding(id: string): SpaceEncoding {
  const found = SPACES[id as ConversionSpace];
  if (!found)
    throw new ColorScienceError(
      `Unknown color space "${id}"; known: ${COLOR_SPACE_TRANSFORM_SPACES.join(", ")}`,
    );
  return found;
}

/** The conversion space a working space's values are in. */
export const workingEncoding = (space: WorkingSpace): ConversionSpace =>
  space === "legacy-srgb" ? "srgb" : space;

/** The CG7 display: encoded sRGB, BT.709 primaries, D65. */
export const DISPLAY_SPACE: ConversionSpace = "srgb";

/**
 * A conversion between two spaces as its three stages: decode the source
 * curve, one 3×3 (Bradford when the whites differ), encode the target curve.
 * Same spaces: identity (`identity` true, every stage absent).
 */
export type SpaceConversion = {
  readonly from: ConversionSpace;
  readonly to: ConversionSpace;
  readonly identity: boolean;
  readonly decode: string | null;
  readonly matrix: Mat3;
  readonly encode: string | null;
  apply(v: Rgb): Rgb;
};

const isIdentityMatrix = (m: Mat3) =>
  m.every((v, i) => v === (i % 4 === 0 ? 1 : 0));

function gamutMatrix(from: string, to: string): Mat3 {
  if (from === to) return IDENTITY;
  const a = colorSpace(from).white,
    b = colorSpace(to).white;
  return rgbConversionMatrix(
    from,
    to,
    a[0] === b[0] && a[1] === b[1] ? undefined : "bradford",
  );
}

export function spaceConversion(from: string, to: string): SpaceConversion {
  const a = spaceEncoding(from),
    b = spaceEncoding(to);
  if (from === to)
    return {
      from: from as ConversionSpace,
      to: to as ConversionSpace,
      identity: true,
      decode: null,
      matrix: IDENTITY,
      encode: null,
      apply: (v) => [v[0], v[1], v[2]],
    };
  const matrix = gamutMatrix(a.gamut, b.gamut);
  const decode = a.curve ? transferFunction(a.curve).decode : null;
  const encode = b.curve ? transferFunction(b.curve).encode : null;
  const linear = isIdentityMatrix(matrix);
  return {
    from: from as ConversionSpace,
    to: to as ConversionSpace,
    identity: false,
    decode: a.curve,
    matrix,
    encode: b.curve,
    apply(v) {
      let x: Rgb = decode ? [decode(v[0]), decode(v[1]), decode(v[2])] : v;
      if (!linear) x = apply(matrix, x);
      return encode
        ? [encode(x[0]), encode(x[1]), encode(x[2])]
        : [x[0], x[1], x[2]];
    },
  };
}

/** Display (encoded sRGB) → working; identity for `legacy-srgb`. */
export const displayToWorking = (space: WorkingSpace) =>
  spaceConversion(DISPLAY_SPACE, workingEncoding(space));
/**
 * Working → display, unclipped: the 0–1 clip is the quantizer's clamp (the
 * sRGB encode is monotonic with 0 → 0 and 1 → 1, so clipping before or after
 * it is the same). Identity for `legacy-srgb`.
 */
export const workingToDisplay = (space: WorkingSpace) =>
  spaceConversion(workingEncoding(space), DISPLAY_SPACE);

// --- Media input transforms --------------------------------------------------

/**
 * How a source's code values are encoded, resolved from its color descriptor:
 * a declared camera encoding, or display primaries and transfer.
 */
export type SourceEncoding =
  | { readonly kind: "camera"; readonly id: string }
  | {
      readonly kind: "display";
      readonly primaries: "bt709" | "bt2020" | "p3-d65";
      readonly transfer: "srgb" | "pq" | "hlg";
    };

/** PQ: 1.0 scene-linear = 100 cd/m² (the ACES and OpenColorIO convention). */
export const PQ_UNIT_LUMINANCE = 100;
/** HLG: BT.2100 reference OOTF at a 1000 cd/m² nominal peak (γ 1.2), black 0. */
export const HLG_NOMINAL_PEAK = 1000;
export const HLG_SYSTEM_GAMMA = 1.2;

/**
 * Code values → linear light in the source primaries (`gamut`) and back,
 * float64. Camera curves follow their validated input transform; display
 * transfers follow D-colour (BT.709 and sRGB are decoded as sRGB, as players
 * show them), PQ and HLG BT.2100.
 */
type SourceLinear = {
  /** The primaries `toLinear` lands in (a `primaries.ts` id). */
  gamut: string;
  toLinear(v: Rgb): Rgb;
  fromLinear(v: Rgb): Rgb;
};

function sourceLinear(source: SourceEncoding): SourceLinear {
  if (source.kind === "camera") {
    const entry = INPUT_TRANSFORMS.find((t) => t.id === source.id);
    if (!entry)
      throw new ColorScienceError(`Unknown input transform "${source.id}"`);
    if (entry.status === "unavailable")
      throw new ColorScienceError(
        `Input transform "${source.id}" is unavailable: ${entry.reason}`,
      );
    // The camera transform goes to ACES2065-1 with its own adaptation; expose
    // it in AP0 so the caller's matrix starts there.
    const forward = inputTransform(source.id).toAces2065;
    const curve = transferFunction(entry.curve);
    const toCamera = invert(
      rgbConversionMatrix(entry.gamut, "aces-ap0", entry.adaptation),
    );
    return {
      gamut: "aces-ap0",
      toLinear: forward,
      fromLinear(v) {
        const c = apply(toCamera, v);
        return [curve.encode(c[0]), curve.encode(c[1]), curve.encode(c[2])];
      },
    };
  }
  const gamut = source.primaries;
  if (source.transfer === "srgb") {
    const t = transferFunction("srgb");
    return {
      gamut,
      toLinear: (v) => [t.decode(v[0]), t.decode(v[1]), t.decode(v[2])],
      fromLinear: (v) => [t.encode(v[0]), t.encode(v[1]), t.encode(v[2])],
    };
  }
  if (source.transfer === "pq") {
    const t = transferFunction("pq");
    const s = PQ_UNIT_LUMINANCE;
    return {
      gamut,
      toLinear: (v) => [
        t.decode(v[0]) / s,
        t.decode(v[1]) / s,
        t.decode(v[2]) / s,
      ],
      fromLinear: (v) => [
        t.encode(v[0] * s),
        t.encode(v[1] * s),
        t.encode(v[2] * s),
      ],
    };
  }
  const t = transferFunction("hlg");
  const k = lumaCoefficients(gamut === "bt2020" ? "bt2020" : "bt709");
  const luma = (e: Rgb) => k[0] * e[0] + k[1] * e[1] + k[2] * e[2];
  const g = HLG_SYSTEM_GAMMA;
  const scale = HLG_NOMINAL_PEAK / PQ_UNIT_LUMINANCE;
  return {
    gamut,
    toLinear(v) {
      const e: Rgb = [t.decode(v[0]), t.decode(v[1]), t.decode(v[2])];
      const ys = luma(e);
      const f = ys > 0 ? scale * Math.pow(ys, g - 1) : 0;
      return [f * e[0], f * e[1], f * e[2]];
    },
    fromLinear(d) {
      // Inverse OOTF (BT.2100 Table 5 note): Ys = (Yd / α)^(1/γ).
      const yd = luma(d);
      const ys = yd > 0 ? Math.pow(yd / scale, 1 / g) : 0;
      const f = ys > 0 ? 1 / (scale * Math.pow(ys, g - 1)) : 0;
      return [t.encode(f * d[0]), t.encode(f * d[1]), t.encode(f * d[2])];
    },
  };
}

/**
 * A source's code values ↔ a working space, float64: `toWorking` is the input
 * transform, `fromWorking` its inverse (for round trips and re-encoding).
 */
export type SourceTransform = {
  readonly source: SourceEncoding;
  readonly working: WorkingSpace;
  toWorking(v: Rgb): Rgb;
  fromWorking(v: Rgb): Rgb;
};

export function sourceTransform(
  source: SourceEncoding,
  working: WorkingSpace,
): SourceTransform {
  const linear = sourceLinear(source);
  const target = spaceEncoding(workingEncoding(working));
  const toTarget = gamutMatrix(linear.gamut, target.gamut);
  const fromTarget = invert(toTarget);
  const curve = target.curve ? transferFunction(target.curve) : null;
  return {
    source,
    working,
    toWorking(v) {
      const x = apply(toTarget, linear.toLinear(v));
      return curve
        ? [curve.encode(x[0]), curve.encode(x[1]), curve.encode(x[2])]
        : x;
    },
    fromWorking(v) {
      const x: Rgb = curve
        ? [curve.decode(v[0]), curve.decode(v[1]), curve.decode(v[2])]
        : v;
      return linear.fromLinear(apply(fromTarget, x));
    },
  };
}

/** The 3×3 product, exposed for GPU kernels that fuse conversions. */
export const conversionMatrix = (from: string, to: string): Mat3 =>
  gamutMatrix(spaceEncoding(from).gamut, spaceEncoding(to).gamut);
