import type { Composition } from "@still-shift/scene-contract";
import {
  analyzeCompositionQuality,
  type CompositionQualityPolicy,
} from "../story-quality.ts";
import { measureFrameEnergy } from "../story-continuous-quality.ts";
import type { CompositionPreview } from "./render/index.ts";

/** Full-resolution grayscale changes reuse the continuous-motion 4-level / 200-pixel default gate. */
export async function analyzeRenderedCompositionQuality(
  comp: Composition,
  preview: CompositionPreview,
  policy: CompositionQualityPolicy = {},
  options: { signal?: AbortSignal; onFrame?: (frame: number) => void } = {},
) {
  const counts: number[] = [];
  let previous: Uint8Array | undefined;
  for (let frame = 0; frame < comp.frameCount; frame++) {
    options.signal?.throwIfAborted();
    const report = preview.renderFrame(frame);
    if (report.diagnostics.some((d) => d.severity === "error"))
      throw new Error(JSON.stringify(report.diagnostics));
    const rgba = preview.readPixels();
    const gray = new Uint8Array(comp.width * comp.height);
    for (let i = 0; i < gray.length; i++)
      gray[i] = Math.round(
        0.299 * rgba[i * 4]! +
          0.587 * rgba[i * 4 + 1]! +
          0.114 * rgba[i * 4 + 2]!,
      );
    counts.push(
      previous
        ? measureFrameEnergy(previous, gray, policy.pixelChannelThreshold ?? 4)
        : 0,
    );
    previous = gray;
    options.onFrame?.(frame);
    if (frame % 8 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  options.signal?.throwIfAborted();
  return analyzeCompositionQuality(comp, {
    ...policy,
    pixelChangedCounts: counts,
    evaluation: { ...policy.evaluation, textBounds: preview.textBounds },
  });
}
