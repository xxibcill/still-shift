import type { PreviewScene, PreviewWarning } from "./scene.ts";

export const SAFETY_ANALYSIS_VERSION = "risk-0.5.0" as const;

export type SafetySignals = {
  depthRange: number;
  depthSaturationFraction: number;
  discontinuityDensity: number;
  centralDiscontinuityDensity: number;
  rgbDepthEdgeDisagreement: number;
  overscanShortfall: number;
};

export type SafetyAssessment = {
  version: typeof SAFETY_ANALYSIS_VERSION;
  riskScore: number;
  flatDepth: boolean;
  extremeDepth: boolean;
  signals: SafetySignals;
};

export type SafetyPixels = {
  width: number;
  height: number;
  source: Uint8Array | Uint8ClampedArray;
  depth: Uint8Array | Uint8ClampedArray;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const percentile = (
  histogram: Uint32Array,
  total: number,
  fraction: number,
): number => {
  const target = Math.ceil(total * fraction);
  let count = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    count += histogram[value]!;
    if (count >= target) return value / 255;
  }
  return 1;
};

const luminance = (
  pixels: Uint8Array | Uint8ClampedArray,
  index: number,
): number => {
  const offset = index * 4;
  return (
    (0.2126 * pixels[offset]! +
      0.7152 * pixels[offset + 1]! +
      0.0722 * pixels[offset + 2]!) /
    255
  );
};

const validatePixels = ({
  width,
  height,
  source,
  depth,
}: SafetyPixels): void => {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2
  ) {
    throw new Error(
      "Safety analysis requires image dimensions of at least 2 × 2",
    );
  }
  const expectedLength = width * height * 4;
  if (
    !Number.isSafeInteger(expectedLength) ||
    source.length !== expectedLength ||
    depth.length !== expectedLength
  ) {
    throw new Error(
      "Safety analysis pixel buffers must match the image dimensions",
    );
  }
};

export const analyzeDepthSafety = (pixels: SafetyPixels): SafetyAssessment => {
  validatePixels(pixels);
  const { width, height, source, depth } = pixels;
  const totalPixels = width * height;
  const histogram = new Uint32Array(256);
  let saturatedPixels = 0;
  let pairCount = 0;
  let centralPairCount = 0;
  let depthEdgeCount = 0;
  let centralDepthEdgeCount = 0;
  let unsupportedDepthEdgeCount = 0;

  for (let index = 0; index < totalPixels; index += 1) {
    const value = depth[index * 4]!;
    histogram[value] = histogram[value]! + 1;
    if (value <= 3 || value >= 252) saturatedPixels += 1;
  }

  const recordPair = (
    x: number,
    y: number,
    first: number,
    second: number,
  ): void => {
    const depthDifference =
      Math.abs(depth[first * 4]! - depth[second * 4]!) / 255;
    const central =
      x >= width * 0.25 &&
      x < width * 0.75 &&
      y >= height * 0.25 &&
      y < height * 0.75;
    pairCount += 1;
    if (central) centralPairCount += 1;
    if (depthDifference <= 0.16) return;
    depthEdgeCount += 1;
    if (central) centralDepthEdgeCount += 1;
    if (Math.abs(luminance(source, first) - luminance(source, second)) < 0.06) {
      unsupportedDepthEdgeCount += 1;
    }
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const first = y * width + x;
      if (x + 1 < width) recordPair(x, y, first, first + 1);
      if (y + 1 < height) recordPair(x, y, first, first + width);
    }
  }

  const depthRange =
    percentile(histogram, totalPixels, 0.95) -
    percentile(histogram, totalPixels, 0.05);
  const depthSaturationFraction = saturatedPixels / totalPixels;
  const discontinuityDensity = depthEdgeCount / pairCount;
  const centralDiscontinuityDensity =
    centralDepthEdgeCount / Math.max(1, centralPairCount);
  const rgbDepthEdgeDisagreement =
    unsupportedDepthEdgeCount / Math.max(1, depthEdgeCount);
  const riskScore = clamp01(
    0.3 * clamp01(discontinuityDensity / 0.08) +
      0.2 * clamp01(centralDiscontinuityDensity / 0.12) +
      0.3 * clamp01(rgbDepthEdgeDisagreement / 0.5) +
      0.2 * clamp01(depthSaturationFraction / 0.45),
  );
  return {
    version: SAFETY_ANALYSIS_VERSION,
    riskScore,
    flatDepth: depthRange < 0.06,
    extremeDepth: depthSaturationFraction > 0.85,
    signals: {
      depthRange,
      depthSaturationFraction,
      discontinuityDensity,
      centralDiscontinuityDensity,
      rgbDepthEdgeDisagreement,
      overscanShortfall: 0,
    },
  };
};

const qualityFor = (
  scene: PreviewScene,
  assessment: SafetyAssessment,
  fallback: boolean,
  fallbackReason: PreviewWarning["code"] | null,
): NonNullable<PreviewScene["quality"]> => ({
  analysisVersion: assessment.version,
  riskScore: assessment.riskScore,
  fallback,
  fallbackReason,
  signals: {
    ...assessment.signals,
    overscanShortfall: Math.max(
      0,
      scene.motion.maximumCrop - scene.motion.overscan,
    ),
  },
});

export const fallback2DScene = (
  scene: PreviewScene,
  reason: Extract<
    PreviewWarning["code"],
    | "DEPTH_RANGE_FLAT"
    | "DEPTH_RANGE_EXTREME"
    | "DEPTH_EDGE_RISK_HIGH"
    | "DEPTH_PREPARATION_FAILED"
  >,
  assessment?: SafetyAssessment,
): PreviewScene => {
  const travel = Math.min(scene.motion.travel, 0.02);
  const lateralTravel = 0.008;
  const maximumCrop = (travel + lateralTravel) / (1 + travel);
  const risk = assessment ?? {
    version: SAFETY_ANALYSIS_VERSION,
    riskScore: 1,
    flatDepth: false,
    extremeDepth: false,
    signals: {
      depthRange: 0,
      depthSaturationFraction: 0,
      discontinuityDensity: 0,
      centralDiscontinuityDensity: 0,
      rgbDepthEdgeDisagreement: 0,
      overscanShortfall: 0,
    },
  };
  return {
    ...scene,
    motion: {
      ...scene.motion,
      mode: "fallback_2d",
      travel,
      depthStrength: 0,
      lateralTravel,
      rollDegrees: 0,
      maximumCrop,
    },
    quality: qualityFor(scene, risk, true, reason),
    warnings: [
      ...scene.warnings,
      { code: reason, message: "Depth motion is unsafe or unavailable" },
      {
        code: "FALLBACK_2D_USED",
        message: "Using deterministic 2D pan and zoom",
      },
    ],
  };
};

export const applySafetyToScene = (
  scene: PreviewScene,
  assessment: SafetyAssessment,
): PreviewScene => {
  if (assessment.flatDepth)
    return fallback2DScene(scene, "DEPTH_RANGE_FLAT", assessment);
  if (assessment.extremeDepth)
    return fallback2DScene(scene, "DEPTH_RANGE_EXTREME", assessment);
  if (assessment.riskScore >= 0.8) {
    return fallback2DScene(scene, "DEPTH_EDGE_RISK_HIGH", assessment);
  }
  const overscanShortfall = Math.max(
    0,
    scene.motion.maximumCrop - scene.motion.overscan,
  );
  if (assessment.riskScore < 0.4 && overscanShortfall === 0)
    return { ...scene, quality: qualityFor(scene, assessment, false, null) };
  const factor =
    assessment.riskScore >= 0.65 ? 0.4 : assessment.riskScore >= 0.4 ? 0.7 : 1;
  const lateralTravel = scene.motion.lateralTravel * factor;
  const warnings: PreviewWarning[] = [...scene.warnings];
  if (assessment.riskScore >= 0.4) {
    warnings.push(
      {
        code: "DEPTH_EDGE_RISK_HIGH",
        message: "Depth edge risk reduced camera motion",
      },
      {
        code: "MOTION_CLAMPED",
        message: "Depth strength and roll reduced by safety analysis",
      },
    );
  }
  if (overscanShortfall > 0) {
    warnings.push({
      code: "MOTION_CLAMPED",
      message: "Overscan raised to fit resolved motion",
    });
  }
  if (lateralTravel !== scene.motion.lateralTravel) {
    warnings.push({
      code: "LATERAL_MOTION_REDUCED",
      message: "Lateral travel reduced by safety analysis",
    });
  }
  const intensity =
    assessment.riskScore >= 0.4 && scene.motion.intensity === "strong"
      ? assessment.riskScore >= 0.65
        ? "subtle"
        : "standard"
      : scene.motion.intensity;
  if (intensity !== scene.motion.intensity)
    warnings.push({
      code: "INTENSITY_DOWNGRADED",
      message: `Strong intensity downgraded to ${intensity} by safety analysis`,
    });
  return {
    ...scene,
    motion: {
      ...scene.motion,
      depthStrength: scene.motion.depthStrength * factor,
      lateralTravel,
      rollDegrees: scene.motion.rollDegrees * factor,
      intensity,
      overscan: Math.max(scene.motion.overscan, scene.motion.maximumCrop),
    },
    quality: qualityFor(scene, assessment, false, null),
    warnings,
  };
};
