import type { PreviewWarning } from "./scene.ts";

export const GOLDEN_PARITY_VERSION = "golden-parity-0.7.0" as const;

export type FrameVariance = {
  version: typeof GOLDEN_PARITY_VERSION;
  meanAbsoluteError: number;
  edgeAbsoluteError: number;
  channelMeanError: number;
  warning: PreviewWarning | null;
};

export type MotionVariance = {
  version: typeof GOLDEN_PARITY_VERSION;
  alignment: number;
  warning: PreviewWarning | null;
};

export const compareFrameMotion = (
  referenceFirst: Uint8Array,
  referenceLast: Uint8Array,
  actualFirst: Uint8Array,
  actualLast: Uint8Array,
): MotionVariance => {
  if (
    referenceFirst.length === 0 ||
    referenceFirst.length % 3 !== 0 ||
    referenceFirst.length !== referenceLast.length ||
    referenceFirst.length !== actualFirst.length ||
    referenceFirst.length !== actualLast.length
  ) {
    throw new Error("Motion samples must be matching nonempty RGB frames");
  }
  let referenceEnergy = 0;
  let alignedMotion = 0;
  for (let index = 0; index < referenceFirst.length; index += 1) {
    const referenceDelta = referenceLast[index]! - referenceFirst[index]!;
    const actualDelta = actualLast[index]! - actualFirst[index]!;
    referenceEnergy += referenceDelta * referenceDelta;
    alignedMotion += referenceDelta * actualDelta;
  }
  if (referenceEnergy === 0)
    throw new Error("Reference frames must contain motion");
  const alignment = alignedMotion / referenceEnergy;
  return {
    version: GOLDEN_PARITY_VERSION,
    alignment,
    warning:
      alignment < 0.5 || alignment > 1.5
        ? {
            code: "PREVIEW_EXPORT_VARIANCE",
            message:
              "Frame motion differs from the reference direction or timing",
          }
        : null,
  };
};

export const compareFrameSamples = (
  preview: Uint8Array,
  exported: Uint8Array,
  width: number,
  height: number,
): FrameVariance => {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    preview.length !== width * height * 3 ||
    exported.length !== preview.length
  ) {
    throw new Error(
      "Parity samples must be matching RGB grids of at least 2 × 2",
    );
  }
  let absoluteDifference = 0;
  let edgeDifference = 0;
  let edgeCount = 0;
  const previewChannels = [0, 0, 0];
  const exportChannels = [0, 0, 0];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        const position = pixel + channel;
        const a = preview[position]!;
        const b = exported[position]!;
        absoluteDifference += Math.abs(a - b);
        previewChannels[channel]! += a;
        exportChannels[channel]! += b;
        if (x + 1 < width) {
          const adjacent = position + 3;
          edgeDifference += Math.abs(
            Math.abs(a - preview[adjacent]!) -
              Math.abs(b - exported[adjacent]!),
          );
          edgeCount += 1;
        }
        if (y + 1 < height) {
          const adjacent = position + width * 3;
          edgeDifference += Math.abs(
            Math.abs(a - preview[adjacent]!) -
              Math.abs(b - exported[adjacent]!),
          );
          edgeCount += 1;
        }
      }
    }
  }
  const meanAbsoluteError = absoluteDifference / (preview.length * 255);
  const edgeAbsoluteError = edgeDifference / (edgeCount * 255);
  const channelMeanError = Math.max(
    ...previewChannels.map(
      (value, channel) =>
        Math.abs(value - exportChannels[channel]!) / (width * height * 255),
    ),
  );
  const warning: PreviewWarning | null =
    meanAbsoluteError > 0.03 ||
    edgeAbsoluteError > 0.05 ||
    channelMeanError > 0.025
      ? {
          code: "PREVIEW_EXPORT_VARIANCE",
          message: "Preview and export frame samples exceed visual tolerance",
        }
      : null;
  return {
    version: GOLDEN_PARITY_VERSION,
    meanAbsoluteError,
    edgeAbsoluteError,
    channelMeanError,
    warning,
  };
};
