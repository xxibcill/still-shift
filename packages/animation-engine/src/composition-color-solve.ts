/**
 * CGA adaptive solver: one static, bounded, key-preserving correction per clip,
 * expressed as ordinary editable effects (`color.white-balance`,
 * `color.levels`, `color.curves`, `color.vibrance`). It solves in stages on
 * the measured frames — white balance, then tone, then saturation — and
 * re-measures the exact predicted result after each stage.
 *
 * CGA2: with the grade engine (solver 2) the same stages run, and each
 * correction is translated to its float `grade.*` operator
 * (`composition-color-engine.ts`) before it is measured, so every later stage
 * sees what the engine renders.
 */
import { roundTo } from "./composition-color-round.ts";
import {
  applyGradeToRgba,
  gradeControls,
  isGradeEffect,
} from "@still-shift/renderer-core";
import {
  FLOAT_GRADE_EFFECT_IDS,
  GRADE_EFFECT_IDS,
  isFloatGradeEffect,
} from "@still-shift/scene-contract";
import {
  applyGradeRun,
  effectDefaults,
  engineEffects,
  type ColorEngine,
  type WhiteBalanceModel,
} from "./composition-color-engine.ts";
import { colorEffectPixel } from "../../renderer-core/src/composition/render/color-effects.ts";
import {
  measureColorFrames,
  type ColorFrameLike,
  type ColorFrameSet,
  type ColorStatistics,
} from "./composition-color-measure.ts";

export const COLOR_SOLVER_VERSION = "still-shift-color-solver-1";
/** CGA2: the same stages on the grade engine. */
export const COLOR_SOLVER_2_VERSION = "still-shift-color-solver-2";
export const colorSolverVersion = (engine: ColorEngine) =>
  engine === "grade" ? COLOR_SOLVER_2_VERSION : COLOR_SOLVER_VERSION;
/**
 * Effects the solver emits and its measurement reference applies: the CGA
 * grade effects exactly, the per-channel `color.levels` and `color.curves` as
 * byte tables, and runs of float `grade.*` operators as the Canvas backend
 * evaluates them (CGA2).
 */
export const COLOR_CORRECTION_EFFECTS = [
  "color.levels",
  "color.curves",
  ...GRADE_EFFECT_IDS,
  // grade.lut is a look-2 LUT; its effect carries the prepared table.
  ...FLOAT_GRADE_EFFECT_IDS,
] as const;
export type ColorCorrectionEffectId = (typeof COLOR_CORRECTION_EFFECTS)[number];
export type ColorCorrectionEffect = {
  id: string;
  effect: ColorCorrectionEffectId;
  params: Record<string, number | number[][]>;
  /** A look's `grade.lut` asset slot (CGA2 A3). */
  assets?: Record<string, string>;
};
export type ColorSolveToggles = {
  exposure: boolean;
  contrast: boolean;
  saturation: boolean;
  whiteBalance: boolean;
};
/** Per correction: true/false switches it, a 0–1 number scales it. */
export type ColorSolveSettings = {
  [K in keyof ColorSolveToggles]?: boolean | number;
};
/** Targets that replace the defaults, e.g. measured from a look's edit. */
export type ColorSolveTargets = {
  /** Median luma: the midtone range is centered on it. */
  medianLuma?: number | undefined;
  /** Median and 90th-percentile HSV saturation. */
  saturation?: number | undefined;
  strongSaturation?: number | undefined;
};
export type ColorSolveOptions = ColorSolveSettings & {
  /** Scales every correction, 0–1 (default 1). */
  strength?: number;
  targets?: ColorSolveTargets | undefined;
  /** Effects to emit: CGA's 8-bit `color.*` (default) or `grade.*` (CGA2). */
  engine?: ColorEngine | undefined;
  /** Grade engine only: white balance as CGA's gains (default) or Bradford. */
  whiteBalanceModel?: WhiteBalanceModel | undefined;
};
type SolverTargets = {
  midtoneRange: readonly [number, number];
  saturation: number;
  strongSaturation: number;
  source: "default" | "supplied";
};
export type ColorSolveDecision = {
  correction: keyof ColorSolveToggles | "clipping";
  applied: boolean;
  reason: string;
  values?: Record<string, number>;
};
export type ColorSolution = {
  version: typeof COLOR_SOLVER_VERSION | typeof COLOR_SOLVER_2_VERSION;
  strength: number;
  effects: ColorCorrectionEffect[];
  decisions: ColorSolveDecision[];
  /** Statistics of the exact predicted result on the solver's frames. */
  predicted: ColorStatistics;
};

/**
 * Solver limits and targets. Every correction is bounded and has a dead band,
 * so a balanced clip is left unchanged. Defaults were tuned with the owner on
 * flat Flow clips (2026-11-16): the first set was invisible, the second too
 * heavy and too warm; these sit halfway, with a moderate vibrance boost, a
 * median-pivoted S-curve, kept high-key brightness, and at least half of a
 * warm cast removed (the owner's own look is cooler).
 */
export const COLOR_SOLVER_LIMITS = {
  /**
   * Share of the estimated neutral cast removed, and its bound: from the
   * first value when near-neutral pixels disagree (spread ≥ 15, a mix of real
   * colors such as beige and white) to the second when they share one cast
   * (spread ≤ 5, true neutrals under a colored light).
   */
  whiteBalanceShare: [0.5, 0.9] as const,
  whiteBalanceMax: [20, 35] as const,
  tintMax: [12, 25] as const,
  /**
   * Magenta tint per unit of cooling when the cast estimate is not trusted
   * (scaled by 1 − confidence): temperature trades red for blue only, so a
   * partly cooled cream turns lemon-yellow; lowering green with red keeps it
   * beige, as the owner's own (cooler) look does.
   */
  coolingTint: 0.4,
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
   * Midtone placement outside high key: a median below the range is raised
   * toward it (within medianRiseMax, white point included), one above it is
   * lowered by at most medianDropMax, through the levels gamma. Inside the
   * range nothing moves.
   */
  midtoneRange: [0.4, 0.52] as const,
  medianDropMax: 0.05,
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
  /**
   * S-curve, pivoting on the median so the key is kept, when the 5–95% spread
   * is narrower than this; strength 0.75 × (spreadTarget − spread), at most
   * sCurveMax.
   */
  spreadTarget: 0.625,
  sCurveMax: 0.13,
  /** Saturation targets (median and 90th percentile) and boost bounds. */
  saturationTarget: 0.185,
  strongSaturationTarget: 0.36,
  saturationMaxGain: 1.65,
  vibranceMax: 80,
  /** Extra clipped share a correction may add before it is scaled back. */
  clippedBudget: 0.003,
} as const;

const round = (value: number, digits = 4) => roundTo(value, digits);
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
  if (temperature < 0)
    tint = clamp(
      tint - temperature * L.coolingTint * (1 - confidence),
      -maxTint,
      maxTint,
    );
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
  strength: { exposure: number; contrast: number },
  toggles: ColorSolveToggles,
  targets: SolverTargets,
): [ColorCorrectionEffect[], ColorSolveDecision[]] {
  const L = COLOR_SOLVER_LIMITS;
  const luma = stats.luma,
    median = Math.max(0.02, luma.p50);
  const decisions: ColorSolveDecision[] = [];
  let white = 1,
    black = 0,
    gamma = 1;
  const exposure = toggles.exposure && median < L.highKey;
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
      reason: `highlights reach ${luma.p995} (≥ ${L.whiteTrigger}); white point kept`,
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
  black *= strength.contrast;
  white = 1 - (1 - white) * strength.exposure;
  let target = clamp((median - black) / (white - black), 0.02, 0.98);
  if (exposure) {
    // Place the midtones: gamma moves the median after levels into range.
    const [low, high] = targets.midtoneRange;
    const goal =
      target < low
        ? Math.max(target, Math.min(low, median + L.medianRiseMax))
        : target > high
          ? Math.max(high, target - L.medianDropMax)
          : target;
    const placed = target + (goal - target) * strength.exposure;
    const solved = round(Math.log(target) / Math.log(placed));
    if (Math.abs(solved - 1) >= 0.01) {
      gamma = solved;
      decisions.push({
        correction: "exposure",
        applied: true,
        reason: `median ${round(target, 3)} after levels is ${target < low ? "below" : "above"} the ${targets.source === "supplied" ? "supplied" : "default"} midtone range ${round(low, 3)}–${round(high, 3)}; gamma moves it to ${round(placed, 3)}`,
        values: { gamma, median: round(target, 4), placed: round(placed, 4) },
      });
      target = placed;
    }
  }
  const effects: ColorCorrectionEffect[] = [];
  if (black > 0.0005 || white < 0.9995 || gamma !== 1)
    effects.push({
      id: "auto-levels",
      effect: "color.levels",
      params: {
        inputBlack: round(black),
        inputWhite: round(white),
        ...(gamma !== 1 ? { gamma } : {}),
      },
    });
  const spread = (luma.p95 - luma.p05) / (white - black);
  const sCurve =
    toggles.contrast && spread < L.spreadTarget
      ? Math.min(L.sCurveMax, (L.spreadTarget - spread) * 0.75) *
        strength.contrast
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
  targets: SolverTargets,
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
    Math.max(targets.saturation / s50, targets.strongSaturation / s90),
    1,
    L.saturationMaxGain,
  );
  // Vibrance factor at the median pixel equals the gain. A fully saturated
  // median (s50 = 1) has no room to boost, and would otherwise give 0/0.
  const room = 1 - s50;
  const vibrance =
    room > 0
      ? round(clamp((100 * (gain - 1)) / room, 0, L.vibranceMax) * strength, 2)
      : 0;
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
        ? `median/90% saturation ${stats.saturation.p50}/${stats.saturation.p90} below the ${targets.source === "supplied" ? "supplied" : "default"} ${round(targets.saturation, 3)}/${round(targets.strongSaturation, 3)}; vibrance (strong colors and skin protected), ≤ ×${L.saturationMaxGain}`
        : `saturation ${stats.saturation.p50}/${stats.saturation.p90} meets the targets`,
      values: { vibrance },
    },
  ];
}

/**
 * Supplied targets replace the defaults within sane bounds: the midtone range
 * keeps its width around the supplied median (never reaching high key), and
 * saturation targets stay within what vibrance can reach.
 */
function solverTargets(supplied: ColorSolveTargets | undefined): SolverTargets {
  const L = COLOR_SOLVER_LIMITS;
  const [low, high] = L.midtoneRange;
  const half = (high - low) / 2;
  const median =
    supplied?.medianLuma === undefined
      ? undefined
      : clamp(supplied.medianLuma, 0.3, L.highKey - half);
  const saturation = clamp(
      supplied?.saturation ?? L.saturationTarget,
      0.05,
      0.5,
    ),
    strong = clamp(
      supplied?.strongSaturation ?? L.strongSaturationTarget,
      saturation,
      0.8,
    );
  return {
    midtoneRange:
      median === undefined ? L.midtoneRange : [median - half, median + half],
    saturation,
    strongSaturation: strong,
    source:
      supplied && Object.values(supplied).some((value) => value !== undefined)
        ? "supplied"
        : "default",
  };
}

/** Quarter-resolution copies (every second pixel and row) for solving. */
export function colorSolverFrames(
  frames: readonly (ColorFrameLike & { width: number })[],
): ColorFrameSet {
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
  { frames, width }: ColorFrameSet,
  options: ColorSolveOptions & {
    prefix?: readonly ColorCorrectionEffect[];
  } = {},
): ColorSolution {
  const strength = clamp(options.strength ?? 1, 0, 1);
  const setting = (value: boolean | number | undefined) =>
    value === undefined || value === true
      ? 1
      : value === false
        ? 0
        : clamp(value, 0, 1);
  const scales: Record<keyof ColorSolveToggles, number> = {
    exposure: setting(options.exposure),
    contrast: setting(options.contrast),
    saturation: setting(options.saturation),
    whiteBalance: setting(options.whiteBalance),
  };
  const toggles: ColorSolveToggles = {
    exposure: scales.exposure > 0,
    contrast: scales.contrast > 0,
    saturation: scales.saturation > 0,
    whiteBalance: scales.whiteBalance > 0,
  };
  const targets = solverTargets(options.targets);
  const prefix = options.prefix ?? [];
  const engine = options.engine ?? "legacy";
  const forEngine = (effects: readonly ColorCorrectionEffect[]) =>
    engineEffects(engine, effects, {
      whiteBalance: options.whiteBalanceModel,
    }) as ColorCorrectionEffect[];
  const measure = (effects: readonly ColorCorrectionEffect[]) =>
    measureColorFrames(
      {
        frames: frames.map((frame) => ({
          ordinal: frame.ordinal,
          rgba: applyColorEffects(
            [...prefix, ...forEngine(effects)],
            frame.rgba,
          ),
        })),
        width: width,
      },
      { step: 1 },
    );
  const source = measure([]);
  let scale = 1;
  const decisions: ColorSolveDecision[] = [];
  for (let attempt = 0; ; attempt++) {
    const s = strength * scale;
    const [balance, balanceDecision] = solveWhiteBalance(
      source,
      s * scales.whiteBalance,
      toggles.whiteBalance,
    );
    const [tone, toneDecisions] = solveTone(
      measure(balance),
      { exposure: s * scales.exposure, contrast: s * scales.contrast },
      toggles,
      targets,
    );
    const [vivid, vividDecision] = solveSaturation(
      measure([...balance, ...tone]),
      s * scales.saturation,
      toggles.saturation,
      targets,
    );
    const solved = [...balance, ...tone, ...vivid];
    const predicted = measure(solved);
    const effects = forEngine(solved);
    const added = predicted.clippedFraction - source.clippedFraction;
    const over = added > COLOR_SOLVER_LIMITS.clippedBudget && effects.length;
    if (over && attempt < 4) {
      decisions.push({
        correction: "clipping",
        applied: true,
        reason: `corrections added ${round(added * 100, 2)}% clipped pixels (budget ${COLOR_SOLVER_LIMITS.clippedBudget * 100}%); all corrections scaled ×0.75`,
      });
      scale *= 0.75;
      continue;
    }
    if (over)
      decisions.push({
        correction: "clipping",
        applied: false,
        reason: `still ${round(added * 100, 2)}% added clipped pixels after scaling corrections to ×${round(scale, 3)}; over the ${COLOR_SOLVER_LIMITS.clippedBudget * 100}% budget`,
        values: { addedClipped: round(added, 6), scale: round(scale, 4) },
      });
    return {
      version: colorSolverVersion(engine),
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
 * backend does: CGA grade effects through their integer reference, per-channel
 * corrections through the color-effect reference as byte tables, and each run
 * of consecutive float `grade.*` operators in float64 with one quantization.
 */
export function applyColorEffects(
  effects: readonly ColorCorrectionEffect[],
  rgba: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(rgba);
  let run: ColorCorrectionEffect[] = [];
  const flush = () => {
    applyGradeRun(run, out);
    run = [];
  };
  for (const effect of effects) {
    if (!MEASURABLE_EFFECTS.has(effect.effect))
      throw Error(
        `comp-auto-color: no measurement reference for ${effect.effect}`,
      );
    if (isFloatGradeEffect(effect.effect)) {
      run.push(effect);
      continue;
    }
    flush();
    const params = effectDefaults(effect);
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
  flush();
  return out;
}
const MEASURABLE_EFFECTS: ReadonlySet<string> = new Set(
  COLOR_CORRECTION_EFFECTS,
);
