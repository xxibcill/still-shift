/**
 * Transfer functions: linear light ↔ normalized code value, float64.
 *
 * `encode` maps the stated linear input to a full-range normalized code value
 * (for camera curves, the 10-bit code value / 1023); `decode` is the published
 * inverse. Every function is written from its published document and checked
 * against the CG0 vectors (benchmarks/fixtures/color/cg0/vectors), within
 * 1e-12. Nothing is clamped: values outside 0–1 follow the published segment.
 *
 * Provenance: only sRGB matches chroma-node (b804dc0) and is kept in the same
 * form. chroma-node's BT.1886 (identity), PQ, HLG and Apple Log ("empirical
 * curve fit") fail the CG0 vectors (errors 0.31, 1.0, 0.72 and NaN), so they
 * are rewritten from the specifications; every camera curve is new.
 * Constants are cross-checked with colour-science 0.4.6 (BSD-3-Clause), which
 * produced the CG0 vectors.
 */
import { ColorScienceError } from "./errors.ts";

export type TransferKind = "display" | "working-log" | "camera-log";
export type TransferFunction = {
  id: string;
  name: string;
  kind: TransferKind;
  /** What the linear side means. */
  input: string;
  source: string;
  encode: (linear: number) => number;
  decode: (code: number) => number;
};

const spow = (x: number, p: number) => Math.sign(x) * Math.pow(Math.abs(x), p);

// --- Display ----------------------------------------------------------------

const srgb: TransferFunction = {
  id: "srgb",
  name: "sRGB",
  kind: "display",
  input: "display-linear relative luminance, 0-1",
  source: "IEC 61966-2-1:1999",
  encode: (l) =>
    l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055,
  decode: (v) =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
};

const bt709Break = 4.5 * 0.018;
const bt709: TransferFunction = {
  id: "bt709",
  name: "ITU-R BT.709 OETF",
  kind: "display",
  input: "scene-linear camera signal, 0-1",
  source: "ITU-R BT.709-6, Part 1 item 1.2",
  encode: (l) => (l < 0.018 ? 4.5 * l : 1.099 * spow(l, 0.45) - 0.099),
  decode: (v) =>
    v < bt709Break ? v / 4.5 : spow((v + 0.099) / 1.099, 1 / 0.45),
};

const bt1886: TransferFunction = {
  id: "bt1886",
  name: "ITU-R BT.1886 EOTF (L_W = 1, L_B = 0)",
  kind: "display",
  input: "display-linear relative luminance, 0-1",
  source: "ITU-R BT.1886 (03/2011), Annex 1, with L_B = 0 and L_W = 1",
  encode: (l) => Math.pow(l, 1 / 2.4),
  decode: (v) => Math.pow(Math.max(v, 0), 2.4),
};

const PQ = {
  m1: 2610 / 16384,
  m2: (2523 / 4096) * 128,
  c1: 3424 / 4096,
  c2: (2413 / 4096) * 32,
  c3: (2392 / 4096) * 32,
  peak: 10000,
} as const;
const pq: TransferFunction = {
  id: "pq",
  name: "SMPTE ST 2084 (PQ) inverse EOTF",
  kind: "display",
  input: "absolute display luminance in cd/m2, 0-10000",
  source: "SMPTE ST 2084:2014; ITU-R BT.2100-2, Table 4",
  encode: (c) => {
    const yp = spow(c / PQ.peak, PQ.m1);
    return spow((PQ.c1 + PQ.c2 * yp) / (PQ.c3 * yp + 1), PQ.m2);
  },
  decode: (n) => {
    const vp = spow(n, 1 / PQ.m2);
    const num = Math.max(vp - PQ.c1, 0);
    return PQ.peak * spow(num / (PQ.c2 - PQ.c3 * vp), 1 / PQ.m1);
  },
};

const HLG = { a: 0.17883277, b: 0.28466892, c: 0.559910729529562 } as const;
const hlg: TransferFunction = {
  id: "hlg",
  name: "ITU-R BT.2100 HLG OETF",
  kind: "display",
  input: "normalized scene-linear light E, 0-1",
  source: "ITU-R BT.2100-2, Table 5",
  encode: (e) =>
    e <= 1 / 12
      ? Math.sqrt(3) * spow(e, 0.5)
      : HLG.a * Math.log(12 * e - HLG.b) + HLG.c,
  decode: (v) =>
    v <= 0.5 ? (v * v) / 3 : (Math.exp((v - HLG.c) / HLG.a) + HLG.b) / 12,
};

// --- Working log ------------------------------------------------------------

const CCT = {
  xBreak: 0.0078125,
  yBreak: 0.155251141552511,
  a: 10.5402377416545,
  b: 0.0729055341958355,
} as const;
const acescct: TransferFunction = {
  id: "acescct",
  name: "ACEScct",
  kind: "working-log",
  input: "ACES AP1 scene-linear (0.18 = mid grey)",
  source: "Academy S-2016-001 (2016)",
  encode: (x) =>
    x <= CCT.xBreak ? CCT.a * x + CCT.b : (Math.log2(x) + 9.72) / 17.52,
  decode: (v) =>
    v > CCT.yBreak ? Math.pow(2, v * 17.52 - 9.72) : (v - CCT.b) / CCT.a,
};

// --- Camera log ---------------------------------------------------------------

const camera = (
  id: string,
  name: string,
  source: string,
  encode: (x: number) => number,
  decode: (v: number) => number,
  input = "scene-linear reflectance (0.18 = mid grey)",
): TransferFunction => ({
  id,
  name,
  kind: "camera-log",
  input,
  source,
  encode,
  decode,
});

// ARRI LogC3, SUP 3.x, EI 800, linear scene exposure factor.
const LC3 = {
  cut: 0.010591,
  a: 5.555556,
  b: 0.052272,
  c: 0.24719,
  d: 0.385537,
  e: 5.367655,
  f: 0.092809,
} as const;
const arriLogC3 = camera(
  "arri-logc3",
  "ARRI LogC3 (SUP 3.x, EI 800, linear scene exposure factor)",
  "ARRI (2012), ALEXA Log C Curve - Usage in VFX",
  (x) =>
    x > LC3.cut
      ? LC3.c * Math.log10(LC3.a * x + LC3.b) + LC3.d
      : LC3.e * x + LC3.f,
  (t) =>
    t > LC3.e * LC3.cut + LC3.f
      ? (Math.pow(10, (t - LC3.d) / LC3.c) - LC3.b) / LC3.a
      : (t - LC3.f) / LC3.e,
);

const LC4a = (2 ** 18 - 16) / 117.45,
  LC4b = (1023 - 95) / 1023,
  LC4c = 95 / 1023;
const LC4 = {
  a: LC4a,
  b: LC4b,
  c: LC4c,
  s: (7 * Math.log(2) * 2 ** (7 - (14 * LC4c) / LC4b)) / (LC4a * LC4b),
  t: (2 ** (14 * (-LC4c / LC4b) + 6) - 64) / LC4a,
} as const;
const arriLogC4 = camera(
  "arri-logc4",
  "ARRI LogC4",
  "ARRI (2022), ARRI LogC4 Logarithmic Color Space Specification",
  (e) =>
    e >= LC4.t
      ? ((Math.log2(LC4.a * e + 64) - 6) / 14) * LC4.b + LC4.c
      : (e - LC4.t) / LC4.s,
  (p) =>
    p >= 0
      ? (Math.pow(2, 14 * ((p - LC4.c) / LC4.b) + 6) - 64) / LC4.a
      : p * LC4.s + LC4.t,
);

const sonySLog3 = camera(
  "sony-slog3",
  "Sony S-Log3",
  "Sony, Technical Summary for S-Gamut3.Cine/S-Log3 and S-Gamut3/S-Log3",
  (x) =>
    x >= 0.01125
      ? (420 + Math.log10((x + 0.01) / (0.18 + 0.01)) * 261.5) / 1023
      : ((x * (171.2102946929 - 95)) / 0.01125 + 95) / 1023,
  (y) =>
    y >= 171.2102946929 / 1023
      ? Math.pow(10, (y * 1023 - 420) / 261.5) * (0.18 + 0.01) - 0.01
      : ((y * 1023 - 95) * 0.01125) / (171.2102946929 - 95),
);

const VLOG = {
  cut1: 0.01,
  cut2: 0.181,
  b: 0.00873,
  c: 0.241514,
  d: 0.598206,
} as const;
const panasonicVLog = camera(
  "panasonic-vlog",
  "Panasonic V-Log",
  "Panasonic (2014), VARICAM V-Log/V-Gamut reference manual",
  (l) =>
    l < VLOG.cut1 ? 5.6 * l + 0.125 : VLOG.c * Math.log10(l + VLOG.b) + VLOG.d,
  (v) =>
    v < VLOG.cut2
      ? (v - 0.125) / 5.6
      : Math.pow(10, (v - VLOG.d) / VLOG.c) - VLOG.b,
);

const APPLE = {
  r0: -0.05641088,
  rt: 0.01,
  sigma: 47.28711236,
  beta: 0.00964052,
  gamma: 0.08550479,
  delta: 0.69336945,
} as const;
const appleLog = camera(
  "apple-log",
  "Apple Log",
  "Apple Inc. (2023), Apple Log Profile White Paper",
  (r) =>
    r >= APPLE.rt
      ? APPLE.gamma * Math.log2(r + APPLE.beta) + APPLE.delta
      : r >= APPLE.r0
        ? APPLE.sigma * (r - APPLE.r0) ** 2
        : 0,
  (p) => {
    const pt = APPLE.sigma * (APPLE.rt - APPLE.r0) ** 2;
    return p >= pt
      ? Math.pow(2, (p - APPLE.delta) / APPLE.gamma) - APPLE.beta
      : p >= 0
        ? Math.sqrt(p / APPLE.sigma) + APPLE.r0
        : APPLE.r0;
  },
);

// Canon Log 2 and 3, v1.2 equations; reflection input (x / 0.9 on encode).
const clog2Decode = (v: number) =>
  v < 0.092864125
    ? -(Math.pow(10, (0.092864125 - v) / 0.24136077) - 1) / 87.09937546
    : (Math.pow(10, (v - 0.092864125) / 0.24136077) - 1) / 87.09937546;
const canonLog2 = camera(
  "canon-log2",
  "Canon Log 2 (v1.2 equations)",
  "Canon (2020), Canon Log Gamma Curves (v1.2 equations)",
  (input) => {
    const x = input / 0.9;
    return x < clog2Decode(0.092864125) * 0.9
      ? -(0.24136077 * Math.log10(-x * 87.09937546 + 1) - 0.092864125)
      : 0.24136077 * Math.log10(x * 87.09937546 + 1) + 0.092864125;
  },
  (v) => clog2Decode(v) * 0.9,
);
const clog3Decode = (v: number) =>
  v < 0.097465473
    ? -(Math.pow(10, (0.12783901 - v) / 0.36726845) - 1) / 14.98325
    : v <= 0.15277891
      ? (v - 0.12512219) / 1.9754798
      : (Math.pow(10, (v - 0.12240537) / 0.36726845) - 1) / 14.98325;
const CLOG3_LOW = clog3Decode(0.097465473),
  CLOG3_HIGH = clog3Decode(0.15277891);
const canonLog3 = camera(
  "canon-log3",
  "Canon Log 3 (v1.2 equations)",
  "Canon (2020), Canon Log Gamma Curves (v1.2 equations)",
  (input) => {
    const x = input / 0.9;
    return x < CLOG3_LOW
      ? -0.36726845 * Math.log10(-x * 14.98325 + 1) + 0.12783901
      : x <= CLOG3_HIGH
        ? 1.9754798 * x + 0.12512219
        : 0.36726845 * Math.log10(x * 14.98325 + 1) + 0.12240537;
  },
  (v) => clog3Decode(v) * 0.9,
);

const L3G10 = { a: 0.224282, b: 155.975327, c: 0.01, g: 15.1927 } as const;
const redLog3G10 = camera(
  "red-log3g10",
  "RED Log3G10 (v3, 0.01 offset)",
  "RED Digital Cinema (2017), White Paper on REDWideGamutRGB and Log3G10",
  (input) => {
    const x = input + L3G10.c;
    return x < 0
      ? x * L3G10.g
      : Math.sign(x) * L3G10.a * Math.log10(Math.abs(x) * L3G10.b + 1);
  },
  (y) =>
    y < 0
      ? y / L3G10.g - L3G10.c
      : (Math.sign(y) * (Math.pow(10, Math.abs(y) / L3G10.a) - 1)) / L3G10.b -
        L3G10.c,
  "scene-linear (0.18 = mid grey)",
);

const BMD = {
  A: 0.08692876065491224,
  B: 0.005494072432257808,
  C: 0.5300133392291939,
  D: 8.283605932402494,
  E: 0.09246575342465753,
  linCut: 0.005,
} as const;
const bmdFilmGen5 = camera(
  "bmd-film-gen5",
  "Blackmagic Film Generation 5",
  "Blackmagic Design (2021), Blackmagic Generation 5 Color Science technical reference",
  (x) =>
    x < BMD.linCut ? BMD.D * x + BMD.E : BMD.A * Math.log(x + BMD.B) + BMD.C,
  (y) =>
    y < BMD.D * BMD.linCut + BMD.E
      ? (y - BMD.E) / BMD.D
      : Math.exp((y - BMD.C) / BMD.A) - BMD.B,
  "scene-linear (0.18 = mid grey)",
);

// DJI publishes encode and decode separately; their rounded constants are
// reproduced as published, so decode(encode(x)) differs from x by up to 4.4e-7.
const djiDLog = camera(
  "dji-dlog",
  "DJI D-Log",
  "DJI (2017), White Paper on D-Log and D-Gamut of DJI Cinema Color System",
  (x) =>
    x <= 0.0078
      ? 6.025 * x + 0.0929
      : Math.log10(x * 0.9892 + 0.0108) * 0.256663 + 0.584555,
  (y) =>
    y <= 0.14
      ? (y - 0.0929) / 6.025
      : (Math.pow(10, 3.89616 * y - 2.27752) - 0.0108) / 0.9892,
  "scene-linear (0.18 = mid grey)",
);

const fujiLog = (
  id: string,
  name: string,
  source: string,
  k: {
    cut1: number;
    cut2: number;
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  },
) =>
  camera(
    id,
    name,
    source,
    (x) => (x < k.cut1 ? k.e * x + k.f : k.c * Math.log10(k.a * x + k.b) + k.d),
    (v) =>
      v < k.cut2
        ? (v - k.f) / k.e
        : Math.pow(10, (v - k.d) / k.c) / k.a - k.b / k.a,
  );
const fujiFLog = fujiLog(
  "fujifilm-flog",
  "FUJIFILM F-Log",
  "FUJIFILM (2016), F-Log Data Sheet Ver.1.0",
  {
    cut1: 0.00089,
    cut2: 0.100537775223865,
    a: 0.555556,
    b: 0.009468,
    c: 0.344676,
    d: 0.790453,
    e: 8.735631,
    f: 0.092864,
  },
);
const fujiFLog2 = fujiLog(
  "fujifilm-flog2",
  "FUJIFILM F-Log2",
  "FUJIFILM (2022), F-Log2 Data Sheet Ver.1.0",
  {
    cut1: 0.000889,
    cut2: 0.100686685370811,
    a: 5.555556,
    b: 0.064829,
    c: 0.245281,
    d: 0.384316,
    e: 8.799461,
    f: 0.092864,
  },
);

const NLOG = {
  cut1: 0.328,
  cut2: 0.4418377321603128,
  a: 0.635386119257087,
  b: 0.0075,
  c: 0.1466275659824047,
  d: 0.6050830889540567,
} as const;
const nikonNLog = camera(
  "nikon-nlog",
  "Nikon N-Log",
  "Nikon (2018), N-Log Specification Document Version 1.0.0",
  (y) =>
    y < NLOG.cut1
      ? NLOG.a * spow(y + NLOG.b, 1 / 3)
      : NLOG.c * Math.log(y) + NLOG.d,
  (x) =>
    x < NLOG.cut2
      ? spow(x / NLOG.a, 3) - NLOG.b
      : Math.exp((x - NLOG.d) / NLOG.c),
);

export const TRANSFER_FUNCTIONS: readonly TransferFunction[] = [
  srgb,
  bt709,
  bt1886,
  pq,
  hlg,
  acescct,
  arriLogC3,
  arriLogC4,
  sonySLog3,
  panasonicVLog,
  appleLog,
  canonLog2,
  canonLog3,
  redLog3G10,
  bmdFilmGen5,
  djiDLog,
  fujiFLog,
  fujiFLog2,
  nikonNLog,
];
export const TRANSFER_FUNCTION_IDS = TRANSFER_FUNCTIONS.map((t) => t.id);

export function transferFunction(id: string): TransferFunction {
  const found = TRANSFER_FUNCTIONS.find((t) => t.id === id);
  if (!found)
    throw new ColorScienceError(
      `Unknown transfer function "${id}"; known: ${TRANSFER_FUNCTION_IDS.join(", ")}`,
    );
  return found;
}
