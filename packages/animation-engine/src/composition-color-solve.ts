/**
 * CGA adaptive solver: one static, bounded, key-preserving correction per clip,
 * expressed as ordinary editable effects (`color.white-balance`,
 * `color.levels`, `color.curves`, `color.vibrance`). It solves in stages on
 * the measured frames — white balance, then tone, then saturation — and
 * re-measures the exact predicted result after each stage.
 */
import {
  applyGradeToRgba,
  gradeControls,
  isGradeEffect,
} from "@still-shift/renderer-core";
import { colorEffectPixel } from "../../renderer-core/src/composition/render/color-effects.ts";
import {
  measureColorFrames,
  type ColorFrameLike,
  type ColorStatistics,
} from "./composition-color-measure.ts";

export const COLOR_SOLVER_VERSION = "still-shift-color-solver-1";
export type ColorCorrectionEffect = {
  id: string;
  effect: string;
  params: Record<string, number | number[][]>;
};
export type ColorSolveToggles = {
  exposure: boolean;
  contrast: boolean;
  saturation: boolean;
  whiteBalance: boolean;
};
export type ColorSolveOptions = Partial<ColorSolveToggles> & {
  /** Scales every correction, 0–1 (default 1). */
  strength?: number;
};
export type ColorSolveDecision = {
  correction: keyof ColorSolveToggles | "clipping";
  applied: boolean;
  reason: string;
  values?: Record<string, number>;
};
export type ColorSolution = {
  version: typeof COLOR_SOLVER_VERSION;
  strength: number;
  effects: ColorCorrectionEffect[];
  decisions: ColorSolveDecision[];
  /** Statistics of the exact predicted result on the solver's frames. */
  predicted: ColorStatistics;
};

/**
 * Solver limits and targets. Every correction is bounded and has a dead band,
 * so a balanced clip is left unchanged. Defaults are conservative: the owner's
 * own grade of Flow clips removed about a third of the measured warm cast and
 * kept the median saturation while raising strong colors.
 */
export const COLOR_SOLVER_LIMITS = {
  /**
   * Share of the estimated neutral cast removed, and its bound: from the
   * first value when near-neutral pixels disagree (spread ≥ 15, a mix of real
   * colors such as beige and white) to the second when they share one cast
   * (spread ≤ 5, true neutrals under a colored light).
   */
  whiteBalanceShare: [0.4, 0.9] as const,
  whiteBalanceMax: [20, 35] as const,
  tintMax: [12, 25] as const,
  castSpread: [5, 15] as const,
  whiteBalanceDeadBand: 3,
  /** Minimum near-neutral pixel share to trust the cast estimate. */
  neutralFraction: 0.05,
  /** Clips with a median luma at or above this are high-key: never brightened. */
  highKey: 0.6,
  /** White point is raised only when highlights sit below this. */
  whiteTrigger: 0.9,
  whiteTarget: 0.96,
  /** Largest median-luma rise an exposure fix may cause outside high key. */
  medianRiseMax: 0.08,
  /**
   * Black point target and the largest move. A flat clip (lifted blacks and
   * dim highlights) closes the whole gap; a soft or high-key clip whose
   * highlights already reach closes half of it, so its key barely moves.
   */
  blackTarget: 0.02,
  blackMaxMove: 0.05,
  flatBlack: 0.05,
  flatBlackMaxMove: 0.12,
  /** Largest tonal stretch 1/(w − b), so 8-bit sources do not band visibly. */
  maxStretch: 1.3,
  /** S-curve when the 5–95% spread is still narrower than this. */
  spreadTarget: 0.5,
  sCurveMax: 0.1,
  /** Saturation targets (median and 90th percentile) and boost bounds. */
  saturationTarget: 0.15,
  strongSaturationTarget: 0.3,
  saturationMaxGain: 1.5,
  vibranceMax: 60,
  /** Extra clipped share a correction may add before it is scaled back. */
  clippedBudget: 0.003,
} as const;

const round = (value: number, digits = 4) => {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function solveWhiteBalance(
  stats: ColorStatistics,
  strength: number,
  enabled: boolean,
): [ColorCorrectionEffect[], ColorSolveDecision] {
  const L = COLOR_SOLVER_LIMITS;
  if (!enabled)
    return [
      [],
      { correction: "whiteBalance", applied: false, reason: "disabled" },
    ];
  if (stats.neutral.fraction < L.neutralFraction)
    return [
      [],
      {
        correction: "whiteBalance",
        applied: false,
        reason: `only ${round(stats.neutral.fraction * 100, 1)}% near-neutral pixels; cast estimate not trusted`,
      },
    ];
  const spread = Math.max(
    stats.neutral.temperatureSpread,
    stats.neutral.tintSpread,
  );
  const confidence = clamp(
    (L.castSpread[1] - spread) / (L.castSpread[1] - L.castSpread[0]),
    0,
    1,
  );
  const blend = (range: readonly [number, number]) =>
    range[0] + (range[1] - range[0]) * confidence;
  const share = blend(L.whiteBalanceShare),
    maxTemperature = blend(L.whiteBalanceMax),
    maxTint = blend(L.tintMax);
  let temperature = clamp(
    stats.neutral.temperature * share,
    -maxTemperature,
    maxTemperature,
  );
  let tint = clamp(stats.neutral.tint * share, -maxTint, maxTint);
  if (Math.abs(temperature) < L.whiteBalanceDeadBand) temperature = 0;
  if (Math.abs(tint) < L.whiteBalanceDeadBand) tint = 0;
  temperature = round(temperature * strength, 2);
  tint = round(tint * strength, 2);
  const applied = temperature !== 0 || tint !== 0;
  return [
    applied
      ? [
          {
            id: "auto-white-balance",
            effect: "color.white-balance",
            params: { temperature, tint },
          },
        ]
      : [],
    {
      correction: "whiteBalance",
      applied,
      reason: applied
        ? `near-neutral cast estimate temperature ${stats.neutral.temperature}, tint ${stats.neutral.tint} (spread ${round(spread, 1)}); removing ${round(share * 100, 1)}% within ±${round(maxTemperature, 1)}/±${round(maxTint, 1)}`
        : `cast estimate temperature ${stats.neutral.temperature}, tint ${stats.neutral.tint} within the dead band`,
      values: { temperature, tint, share: round(share, 3) },
    },
  ];
}

function solveTone(
  stats: ColorStatistics,
  strength: number,
  toggles: ColorSolveToggles,
): [ColorCorrectionEffect[], ColorSolveDecision[]] {
  const L = COLOR_SOLVER_LIMITS;
  const luma = stats.luma,
    median = Math.max(0.02, luma.p50);
  const decisions: ColorSolveDecision[] = [];
  let white = 1,
    black = 0;
  if (!toggles.exposure)
    decisions.push({
      correction: "exposure",
      applied: false,
      reason: "disabled",
    });
  else if (median >= L.highKey)
    decisions.push({
      correction: "exposure",
      applied: false,
      reason: `high-key clip (median luma ${luma.p50} ≥ ${L.highKey}); key preserved`,
    });
  else if (luma.p995 >= L.whiteTrigger)
    decisions.push({
      correction: "exposure",
      applied: false,
      reason: `highlights reach ${luma.p995} (≥ ${L.whiteTrigger}); exposure kept`,
    });
  else {
    white = Math.max(
      luma.p995 / L.whiteTarget,
      1 / L.maxStretch,
      median / (median + L.medianRiseMax),
    );
    decisions.push({
      correction: "exposure",
      applied: white < 0.9995,
      reason: `highlights at ${luma.p995}; white point lifts them toward ${L.whiteTarget} (median rise ≤ ${L.medianRiseMax})`,
      values: { inputWhite: round(white) },
    });
  }
  if (!toggles.contrast)
    decisions.push({
      correction: "contrast",
      applied: false,
      reason: "disabled",
    });
  else if (luma.p005 <= L.blackTarget + 0.01)
    decisions.push({
      correction: "contrast",
      applied: false,
      reason: `shadows reach ${luma.p005}; black point kept`,
    });
  else {
    const flat = luma.p005 > L.flatBlack && luma.p995 < L.whiteTrigger;
    black = flat
      ? Math.min(L.flatBlackMaxMove, luma.p005 - L.blackTarget)
      : Math.min(L.blackMaxMove, (luma.p005 - L.blackTarget) * 0.5);
    decisions.push({
      correction: "contrast",
      applied: true,
      reason: flat
        ? `flat clip: darkest 0.5% at ${luma.p005} and highlights at ${luma.p995}; black point moves to ${L.blackTarget} (≤ ${L.flatBlackMaxMove})`
        : `darkest 0.5% at ${luma.p005}; black point closes half the gap to ${L.blackTarget} (≤ ${L.blackMaxMove})`,
      values: { inputBlack: round(black) },
    });
  }
  // Keep the stretch within the banding bound, shrinking both moves alike.
  if (white - black < 1 / L.maxStretch) {
    const deficit = 1 / L.maxStretch - (white - black),
      moved = black + (1 - white);
    black -= (deficit * black) / moved;
    white += (deficit * (1 - white)) / moved;
  }
  black *= strength;
  white = 1 - (1 - white) * strength;
  const target = clamp((median - black) / (white - black), 0.02, 0.98);
  const effects: ColorCorrectionEffect[] = [];
  if (black > 0.0005 || white < 0.9995)
    effects.push({
      id: "auto-levels",
      effect: "color.levels",
      params: {
        inputBlack: round(black),
        inputWhite: round(white),
      },
    });
  const spread = (luma.p95 - luma.p05) / (white - black);
  const sCurve =
    toggles.contrast && spread < L.spreadTarget
      ? Math.min(L.sCurveMax, (L.spreadTarget - spread) * 0.5) * strength
      : 0;
  if (sCurve > 0.005) {
    const m = clamp(target, 0.15, 0.85);
    const lowX = m / 2,
      highX = m + (1 - m) / 2;
    effects.push({
      id: "auto-contrast-curve",
      effect: "color.curves",
      params: {
        curve: [
          [0, 0],
          [round(lowX), round(lowX * (1 - sCurve))],
          [round(m), round(m)],
          [round(highX), round(highX + (1 - highX) * sCurve)],
          [1, 1],
        ],
      },
    });
    decisions.push({
      correction: "contrast",
      applied: true,
      reason: `5–95% spread ${round(spread, 3)} below ${L.spreadTarget}; S-curve pivots on the median`,
      values: { sCurve: round(sCurve) },
    });
  }
  return [effects, decisions];
}

function solveSaturation(
  stats: ColorStatistics,
  strength: number,
  enabled: boolean,
): [ColorCorrectionEffect[], ColorSolveDecision] {
  const L = COLOR_SOLVER_LIMITS;
  if (!enabled)
    return [
      [],
      { correction: "saturation", applied: false, reason: "disabled" },
    ];
  const s50 = Math.max(0.02, stats.saturation.p50),
    s90 = Math.max(0.04, stats.saturation.p90);
  const gain = clamp(
    Math.max(L.saturationTarget / s50, L.strongSaturationTarget / s90),
    1,
    L.saturationMaxGain,
  );
  // Vibrance factor at the median pixel equals the gain.
  const vibrance = round(
    clamp((100 * (gain - 1)) / (1 - s50), 0, L.vibranceMax) * strength,
    2,
  );
  const applied = vibrance >= 2;
  return [
    applied
      ? [
          {
            id: "auto-vibrance",
            effect: "color.vibrance",
            params: { vibrance, saturation: 0, protectSkin: 0.7 },
          },
        ]
      : [],
    {
      correction: "saturation",
      applied,
      reason: applied
        ? `median/90% saturation ${stats.saturation.p50}/${stats.saturation.p90} below ${L.saturationTarget}/${L.strongSaturationTarget}; vibrance (strong colors and skin protected), ≤ ×${L.saturationMaxGain}`
        : `saturation ${stats.saturation.p50}/${stats.saturation.p90} meets the targets`,
      values: { vibrance },
    },
  ];
}

/** Quarter-resolution copies (every second pixel and row) for solving. */
export function colorSolverFrames(
  frames: readonly (ColorFrameLike & { width: number })[],
): { frames: ColorFrameLike[]; width: number } {
  const width = Math.ceil(frames[0]!.width / 2);
  return {
    width,
    frames: frames.map((frame) => {
      const height = frame.rgba.length / 4 / frame.width;
      const rows = Math.ceil(height / 2);
      const rgba = new Uint8Array(width * rows * 4);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < width; x++)
          rgba.set(
            frame.rgba.subarray(
              (y * 2 * frame.width + x * 2) * 4,
              (y * 2 * frame.width + x * 2) * 4 + 4,
            ),
            (y * width + x) * 4,
          );
      return { ordinal: frame.ordinal, rgba };
    }),
  };
}

/**
 * Solve one static correction from frames (straight RGBA8 of one width),
 * optionally after a fixed `prefix` (e.g. a look) that is applied first.
 */
export function solveColorCorrection(
  frames: readonly ColorFrameLike[],
  width: number,
  options: ColorSolveOptions & {
    prefix?: readonly ColorCorrectionEffect[];
  } = {},
): ColorSolution {
  const strength = clamp(options.strength ?? 1, 0, 1);
  const toggles: ColorSolveToggles = {
    exposure: options.exposure ?? true,
    contrast: options.contrast ?? true,
    saturation: options.saturation ?? true,
    whiteBalance: options.whiteBalance ?? true,
  };
  const prefix = options.prefix ?? [];
  const measure = (effects: readonly ColorCorrectionEffect[]) =>
    measureColorFrames(
      frames.map((frame) => ({
        ordinal: frame.ordinal,
        rgba: applyColorEffects([...prefix, ...effects], frame.rgba),
      })),
      width,
      { step: 1 },
    );
  const source = measure([]);
  let scale = 1;
  const decisions: ColorSolveDecision[] = [];
  for (let attempt = 0; ; attempt++) {
    const s = strength * scale;
    const [balance, balanceDecision] = solveWhiteBalance(
      source,
      s,
      toggles.whiteBalance,
    );
    const [tone, toneDecisions] = solveTone(
      measure(balance),
      strength,
      toggles,
    );
    const [vivid, vividDecision] = solveSaturation(
      measure([...balance, ...tone]),
      s,
      toggles.saturation,
    );
    const effects = [...balance, ...tone, ...vivid];
    const predicted = measure(effects);
    const added = predicted.clippedFraction - source.clippedFraction;
    if (
      added > COLOR_SOLVER_LIMITS.clippedBudget &&
      attempt < 4 &&
      (balance.length || vivid.length)
    ) {
      decisions.push({
        correction: "clipping",
        applied: true,
        reason: `corrections added ${round(added * 100, 2)}% clipped pixels (budget ${COLOR_SOLVER_LIMITS.clippedBudget * 100}%); white balance and vibrance scaled ×0.75`,
      });
      scale *= 0.75;
      continue;
    }
    return {
      version: COLOR_SOLVER_VERSION,
      strength,
      effects,
      decisions: [
        balanceDecision,
        ...toneDecisions,
        vividDecision,
        ...decisions,
      ],
      predicted,
    };
  }
}

/**
 * Apply an effect stack to straight opaque RGBA8 exactly as the Canvas
 * backend does: grade effects through their integer reference, per-channel
 * corrections through the color-effect reference as byte tables.
 */
export function applyColorEffects(
  effects: readonly ColorCorrectionEffect[],
  rgba: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(rgba);
  for (const effect of effects) {
    const params = effectParams(effect);
    if (isGradeEffect(effect.effect)) {
      applyGradeToRgba(gradeControls(effect.effect, params), out);
      continue;
    }
    const table = new Uint8Array(256);
    for (let value = 0; value < 256; value++) {
      const result = colorEffectPixel(
        effect.effect,
        [value / 255, value / 255, value / 255, 1],
        params,
        0,
        0,
      );
      table[value] = Math.round(result[0]! * 255);
    }
    for (let i = 0; i < out.length; i += 4) {
      out[i] = table[out[i]!]!;
      out[i + 1] = table[out[i + 1]!]!;
      out[i + 2] = table[out[i + 2]!]!;
    }
  }
  return out;
}
const DEFAULTS: Record<string, Record<string, number | number[][]>> = {
  "color.levels": {
    inputBlack: 0,
    inputWhite: 1,
    gamma: 1,
    outputBlack: 0,
    outputWhite: 1,
  },
  "color.curves": {
    curve: [
      [0, 0],
      [1, 1],
    ],
    amount: 1,
  },
  "color.matrix": {
    rr: 1,
    rg: 0,
    rb: 0,
    gr: 0,
    gg: 1,
    gb: 0,
    br: 0,
    bg: 0,
    bb: 1,
    ro: 0,
    go: 0,
    bo: 0,
    strength: 1,
  },
  "color.white-balance": { temperature: 0, tint: 0 },
  "color.vibrance": { vibrance: 0, saturation: 0, protectSkin: 0.7 },
};
function effectParams(effect: ColorCorrectionEffect) {
  const defaults = DEFAULTS[effect.effect];
  if (!defaults)
    throw Error(
      `comp-auto-color: no measurement reference for ${effect.effect}`,
    );
  return { ...defaults, ...effect.params } as Record<string, never>;
}
