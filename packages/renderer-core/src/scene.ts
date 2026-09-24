import type { AnimationWarning } from "@still-shift/scene-contract";

import type { SafetySignals } from "./safety.ts";

export const RENDERER_VERSION = "preview-render-0.5.0" as const;
export const SLOW_PUSH_VERSION = "slow_push@0.3.0" as const;
export const PRESET_VERSIONS = {
  slow_push: SLOW_PUSH_VERSION,
  horizontal_drift: "horizontal_drift@0.4.0",
  cinematic_float: "cinematic_float@0.4.0",
} as const;

export type PreviewPreset = keyof typeof PRESET_VERSIONS;
export type PreviewIntensity = "subtle" | "standard" | "strong";
export type PreviewWarning = AnimationWarning;

export type PreviewQuality = {
  analysisVersion: string;
  riskScore: number;
  fallback: boolean;
  fallbackReason: PreviewWarning["code"] | null;
  signals: SafetySignals;
};

export const PREVIEW_LIMITS = {
  fps: 30,
  minimumDurationMs: 3000,
  maximumDurationMs: 8000,
  maximumTravel: 0.035,
  maximumDepthStrength: 0.035,
  maximumLateralTravel: 0.035,
  maximumRollDegrees: 0.3,
  minimumOverscan: 0.1,
  maximumCrop: 0.14,
  gridColumns: 128,
  gridRows: 72,
} as const;

type MotionParameters = {
  travel: number;
  depthStrength: number;
  lateralTravel: number;
  rollDegrees: number;
};

export const maximumCropFor = (
  motion: MotionParameters & { preset: PreviewPreset },
): number =>
  (motion.travel +
    motion.depthStrength +
    motion.lateralTravel * (motion.preset === "cinematic_float" ? 1.3 : 1) +
    (motion.rollDegrees * Math.PI) / 180) /
  (1 + motion.travel);

export const PRESET_LIMITS: Record<PreviewPreset, MotionParameters> = {
  slow_push: {
    travel: 0.035,
    depthStrength: 0.035,
    lateralTravel: 0,
    rollDegrees: 0,
  },
  horizontal_drift: {
    travel: 0.026,
    depthStrength: 0.03,
    lateralTravel: 0.035,
    rollDegrees: 0,
  },
  cinematic_float: {
    travel: 0.03,
    depthStrength: 0.03,
    lateralTravel: 0.035,
    rollDegrees: 0.3,
  },
};

const PRESET_DEFAULTS: Record<
  PreviewPreset,
  Record<PreviewIntensity, MotionParameters>
> = {
  slow_push: {
    subtle: {
      travel: 0.025,
      depthStrength: 0.025,
      lateralTravel: 0,
      rollDegrees: 0,
    },
    standard: {
      travel: 0.03,
      depthStrength: 0.03,
      lateralTravel: 0,
      rollDegrees: 0,
    },
    strong: {
      travel: 0.035,
      depthStrength: 0.035,
      lateralTravel: 0,
      rollDegrees: 0,
    },
  },
  horizontal_drift: {
    subtle: {
      travel: 0.012,
      depthStrength: 0.018,
      lateralTravel: 0.015,
      rollDegrees: 0,
    },
    standard: {
      travel: 0.018,
      depthStrength: 0.024,
      lateralTravel: 0.025,
      rollDegrees: 0,
    },
    strong: {
      travel: 0.024,
      depthStrength: 0.028,
      lateralTravel: 0.032,
      rollDegrees: 0,
    },
  },
  cinematic_float: {
    subtle: {
      travel: 0.016,
      depthStrength: 0.018,
      lateralTravel: 0.018,
      rollDegrees: 0.14,
    },
    standard: {
      travel: 0.022,
      depthStrength: 0.023,
      lateralTravel: 0.028,
      rollDegrees: 0.22,
    },
    strong: {
      travel: 0.028,
      depthStrength: 0.027,
      lateralTravel: 0.035,
      rollDegrees: 0.3,
    },
  },
};

export type PreviewInput = {
  sourceWidth: number;
  sourceHeight: number;
  depthWidth: number;
  depthHeight: number;
  durationMs: number;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  preset: PreviewPreset;
  intensity: PreviewIntensity;
  seed?: number;
  overscan?: number;
  requestedTravel?: number;
  requestedDepthStrength?: number;
  requestedLateralTravel?: number;
  requestedRollDegrees?: number;
};

export type PreviewScene = {
  rendererVersion: typeof RENDERER_VERSION;
  presetVersion: (typeof PRESET_VERSIONS)[PreviewPreset];
  timeline: { durationMs: number; fps: number; frameCount: number };
  source: { width: number; height: number };
  canvas: { width: number; height: number };
  motion: {
    mode: "depth" | "fallback_2d";
    preset: PreviewPreset;
    intensity: PreviewIntensity;
    seed: number;
    travel: number;
    depthStrength: number;
    lateralTravel: number;
    rollDegrees: number;
    overscan: number;
    maximumCrop: number;
  };
  quality: PreviewQuality | null;
  warnings: PreviewWarning[];
};

export type EvaluatedFrame = {
  frameIndex: number;
  timeSeconds: number;
  progress: number;
  scale: number;
  cameraTravel: number;
  depthStrength: number;
  translationX: number;
  translationY: number;
  rollDegrees: number;
};

const requirePositive = (name: string, value: number): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(name + " must be a finite positive number");
  }
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const resolveLimit = (
  name: string,
  requested: number | undefined,
  fallback: number,
  maximum: number,
  warnings: PreviewWarning[],
): number => {
  const value = requested ?? fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(name + " must be finite and nonnegative");
  }
  const resolved = clamp(value, 0, maximum);
  if (resolved !== value)
    warnings.push({
      code: "MOTION_CLAMPED",
      message: name + " clamped to " + maximum,
    });
  return resolved;
};

const validateInput = (input: PreviewInput): void => {
  for (const [name, value] of Object.entries({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    depthWidth: input.depthWidth,
    depthHeight: input.depthHeight,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    fps: input.fps,
  })) {
    requirePositive(name, value);
    if (!Number.isInteger(value)) throw new Error(name + " must be an integer");
  }
  if (
    input.sourceWidth !== input.depthWidth ||
    input.sourceHeight !== input.depthHeight
  ) {
    throw new Error("Depth dimensions must match the normalized source");
  }
  if (input.fps !== PREVIEW_LIMITS.fps)
    throw new Error("Preview requires 30 fps");
  if (
    !Number.isInteger(input.durationMs) ||
    input.durationMs < PREVIEW_LIMITS.minimumDurationMs ||
    input.durationMs > PREVIEW_LIMITS.maximumDurationMs ||
    !Number.isInteger((input.durationMs * input.fps) / 1000)
  ) {
    throw new Error("Duration must be 3–8 seconds and resolve to whole frames");
  }
  if (
    !Object.hasOwn(PRESET_DEFAULTS, input.preset) ||
    !Object.hasOwn(PRESET_DEFAULTS.slow_push, input.intensity)
  ) {
    throw new Error("Unknown preview preset or intensity");
  }
  if (
    input.seed !== undefined &&
    (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff)
  ) {
    throw new Error("seed must be an unsigned 32-bit integer");
  }
};

export const resolvePreviewScene = (input: PreviewInput): PreviewScene => {
  validateInput(input);
  const warnings: PreviewWarning[] = [];
  const defaults = PRESET_DEFAULTS[input.preset][input.intensity];
  const limits = PRESET_LIMITS[input.preset];
  const travel = resolveLimit(
    "camera travel",
    input.requestedTravel,
    defaults.travel,
    limits.travel,
    warnings,
  );
  const depthStrength = resolveLimit(
    "depth strength",
    input.requestedDepthStrength,
    defaults.depthStrength,
    limits.depthStrength,
    warnings,
  );
  const lateralTravel = resolveLimit(
    "lateral travel",
    input.requestedLateralTravel,
    defaults.lateralTravel,
    limits.lateralTravel,
    warnings,
  );
  const rollDegrees = resolveLimit(
    "roll",
    input.requestedRollDegrees,
    defaults.rollDegrees,
    limits.rollDegrees,
    warnings,
  );
  const overscan = resolveLimit(
    "overscan",
    input.overscan,
    input.preset === "cinematic_float" ? 0.12 : PREVIEW_LIMITS.minimumOverscan,
    PREVIEW_LIMITS.maximumCrop,
    warnings,
  );
  if (overscan < PREVIEW_LIMITS.minimumOverscan) {
    warnings.push({
      code: "MOTION_CLAMPED",
      message: "overscan raised to " + PREVIEW_LIMITS.minimumOverscan,
    });
  }
  let safeOverscan = Math.max(overscan, PREVIEW_LIMITS.minimumOverscan);
  const maximumCrop = maximumCropFor({
    preset: input.preset,
    travel,
    depthStrength,
    lateralTravel,
    rollDegrees,
  });
  if (maximumCrop > PREVIEW_LIMITS.maximumCrop) {
    throw new Error("Resolved camera motion exceeds the safe crop envelope");
  }
  if (maximumCrop > safeOverscan) {
    safeOverscan = maximumCrop;
    warnings.push({
      code: "MOTION_CLAMPED",
      message: "overscan raised to fit resolved motion",
    });
  }
  return {
    rendererVersion: RENDERER_VERSION,
    presetVersion: PRESET_VERSIONS[input.preset],
    timeline: {
      durationMs: input.durationMs,
      fps: input.fps,
      frameCount: (input.durationMs * input.fps) / 1000,
    },
    source: { width: input.sourceWidth, height: input.sourceHeight },
    canvas: { width: input.canvasWidth, height: input.canvasHeight },
    motion: {
      mode: "depth",
      preset: input.preset,
      intensity: input.intensity,
      seed: input.seed ?? 1842,
      travel,
      depthStrength,
      lateralTravel,
      rollDegrees,
      overscan: safeOverscan,
      maximumCrop,
    },
    quality: null,
    warnings,
  };
};

export const coverFit = (
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } => {
  [sourceWidth, sourceHeight, canvasWidth, canvasHeight].forEach((value) =>
    requirePositive("dimension", value),
  );
  const sourceAspect = sourceWidth / sourceHeight;
  const canvasAspect = canvasWidth / canvasHeight;
  return sourceAspect > canvasAspect
    ? { x: sourceAspect / canvasAspect, y: 1 }
    : { x: 1, y: canvasAspect / sourceAspect };
};

const seededPhase = (seed: number): number => {
  let value = (seed + 0x9e3779b9) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) / 0x100000000) * 2 * Math.PI;
};

export const evaluateFrame = (
  scene: PreviewScene,
  frameIndex: number,
): EvaluatedFrame => {
  if (
    !Number.isInteger(frameIndex) ||
    frameIndex < 0 ||
    frameIndex >= scene.timeline.frameCount
  ) {
    throw new Error("frameIndex is outside the preview timeline");
  }
  const progress =
    scene.timeline.frameCount === 1
      ? 0
      : frameIndex / (scene.timeline.frameCount - 1);
  const eased = progress * progress * (3 - 2 * progress);
  const { mode, preset, lateralTravel, rollDegrees, seed } = scene.motion;
  let translationX = 0;
  let translationY = 0;
  let evaluatedRoll = 0;
  if (mode === "fallback_2d" || preset === "horizontal_drift") {
    translationX = lateralTravel * (2 * eased - 1);
  } else if (preset === "cinematic_float") {
    const phase = seededPhase(seed);
    const envelope = Math.sin(Math.PI * progress);
    const wave = 2 * Math.PI * progress + phase;
    translationX =
      lateralTravel * (0.2 * (2 * eased - 1) + 0.7 * envelope * Math.sin(wave));
    translationY = lateralTravel * 0.9 * envelope * Math.cos(wave);
    evaluatedRoll = rollDegrees * envelope * Math.sin(wave);
  }
  const cameraTravel = scene.motion.travel * eased;
  return {
    frameIndex,
    timeSeconds: frameIndex / scene.timeline.fps,
    progress: eased,
    scale: 1 + cameraTravel,
    cameraTravel,
    depthStrength:
      mode === "fallback_2d" ? 0 : scene.motion.depthStrength * eased,
    translationX,
    translationY,
    rollDegrees: evaluatedRoll,
  };
};
