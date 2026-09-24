export const RENDERER_VERSION = "preview-render-0.3.0" as const;
export const SLOW_PUSH_VERSION = "slow_push@0.3.0" as const;

export const PREVIEW_LIMITS = {
  fps: 30,
  minimumDurationMs: 3000,
  maximumDurationMs: 8000,
  maximumTravel: 0.035,
  maximumDepthStrength: 0.035,
  minimumOverscan: 0.1,
  maximumCrop: 0.14,
  gridColumns: 128,
  gridRows: 72,
} as const;

export type PreviewInput = {
  sourceWidth: number;
  sourceHeight: number;
  depthWidth: number;
  depthHeight: number;
  durationMs: number;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  intensity: "subtle";
  preset: "slow_push";
  overscan?: number;
  requestedTravel?: number;
  requestedDepthStrength?: number;
};

export type PreviewScene = {
  rendererVersion: typeof RENDERER_VERSION;
  presetVersion: typeof SLOW_PUSH_VERSION;
  timeline: { durationMs: number; fps: number; frameCount: number };
  source: { width: number; height: number };
  canvas: { width: number; height: number };
  motion: {
    preset: "slow_push";
    intensity: "subtle";
    travel: number;
    depthStrength: number;
    overscan: number;
    maximumCrop: number;
  };
  warnings: string[];
};

export type EvaluatedFrame = {
  frameIndex: number;
  timeSeconds: number;
  progress: number;
  scale: number;
  cameraTravel: number;
  depthStrength: number;
};

const requirePositive = (name: string, value: number): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number`);
  }
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const resolvePreviewScene = (input: PreviewInput): PreviewScene => {
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
    if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
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
  if (input.preset !== "slow_push" || input.intensity !== "subtle") {
    throw new Error("v0.3 supports only subtle slow_push");
  }
  const warnings: string[] = [];
  const resolveLimit = (
    name: string,
    requested: number | undefined,
    fallback: number,
    maximum: number,
  ): number => {
    const value = requested ?? fallback;
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`${name} must be finite and nonnegative`);
    const resolved = clamp(value, 0, maximum);
    if (resolved !== value) warnings.push(`${name} clamped to ${maximum}`);
    return resolved;
  };
  const travel = resolveLimit(
    "camera travel",
    input.requestedTravel,
    0.025,
    PREVIEW_LIMITS.maximumTravel,
  );
  const depthStrength = resolveLimit(
    "depth strength",
    input.requestedDepthStrength,
    0.025,
    PREVIEW_LIMITS.maximumDepthStrength,
  );
  const overscan = resolveLimit(
    "overscan",
    input.overscan,
    PREVIEW_LIMITS.minimumOverscan,
    PREVIEW_LIMITS.maximumCrop,
  );
  if (overscan < PREVIEW_LIMITS.minimumOverscan) {
    warnings.push(`overscan raised to ${PREVIEW_LIMITS.minimumOverscan}`);
  }
  const safeOverscan = Math.max(overscan, PREVIEW_LIMITS.minimumOverscan);
  const maximumCrop = (travel + depthStrength) / (1 + travel);
  if (maximumCrop > PREVIEW_LIMITS.maximumCrop || maximumCrop > safeOverscan) {
    throw new Error("Resolved camera motion exceeds the safe crop envelope");
  }
  return {
    rendererVersion: RENDERER_VERSION,
    presetVersion: SLOW_PUSH_VERSION,
    timeline: {
      durationMs: input.durationMs,
      fps: input.fps,
      frameCount: (input.durationMs * input.fps) / 1000,
    },
    source: { width: input.sourceWidth, height: input.sourceHeight },
    canvas: { width: input.canvasWidth, height: input.canvasHeight },
    motion: {
      preset: "slow_push",
      intensity: "subtle",
      travel,
      depthStrength,
      overscan: safeOverscan,
      maximumCrop,
    },
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
  const cameraTravel = scene.motion.travel * eased;
  return {
    frameIndex,
    timeSeconds: frameIndex / scene.timeline.fps,
    progress: eased,
    scale: 1 + cameraTravel,
    cameraTravel,
    depthStrength: scene.motion.depthStrength,
  };
};
