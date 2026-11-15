import { resolveCompositionQualityPolicy } from "./quality-policy.ts";
import type { Composition } from "@still-shift/scene-contract";
import {
  analyzeCompositionQuality,
  type CompositionQualityPolicy,
} from "../story-quality.ts";
import { PassageError } from "../passage-diagnostics.ts";
import { measureFrameEnergy } from "../story-continuous-quality.ts";
import {
  assertCompositionQualityCapacity,
  sampleCompositionQuality,
} from "./quality-samples.ts";
import {
  createCompositionPreview,
  renderCompositionFrameAsync,
  type CompositionPreview,
  type CompositionResources,
} from "./render/index.ts";
import type {
  TextContrastLayerEvidence,
  TextLegibilityEvidence,
} from "./quality-policy.ts";
import {
  DEFAULT_CONTRAST_PERCENTILE,
  measureTextContrastPixels,
  textLegibilityBackground,
  textLegibilityFrames,
  textLegibilityMask,
} from "./text-legibility.ts";

type ContrastProbe = {
  reading: Set<number>;
  background: CompositionPreview;
  mask: CompositionPreview;
  evidence: TextContrastLayerEvidence;
};

/**
 * ET3: per root text layer, a preview without its glyphs (transparent glyph
 * colours keep its container and highlights) and a word-coded glyph mask,
 * both sharing the linted preview's resources and backend.
 */
function createContrastProbes(
  comp: Composition,
  preview: CompositionPreview,
  policy: CompositionQualityPolicy,
  resolved: ReturnType<typeof resolveCompositionQualityPolicy>,
  resources: CompositionResources,
) {
  const frames = sampleCompositionQuality(comp, {
    ...policy.evaluation,
    ...preview.evaluationOptions,
    textBounds: preview.textBounds,
  });
  const probes = new Map<string, ContrastProbe>();
  try {
    for (const [id, reading] of textLegibilityFrames(comp, frames, resolved)) {
      const mask = textLegibilityMask(comp, id);
      const probe: Partial<ContrastProbe> = {
        reading: new Set(reading),
        evidence: { ...mask.evidence, frames: [] },
      };
      if (reading.length) {
        probe.background = createCompositionPreview(
          document.createElement("canvas"),
          textLegibilityBackground(comp, id),
          resources,
          { backend: preview.backend },
        );
        probes.set(id, probe as ContrastProbe);
        probe.mask = createCompositionPreview(
          document.createElement("canvas"),
          mask.composition,
          { ...resources, textProbe: { node: id, mode: "ink-only" } },
          { backend: preview.backend },
        );
      } else probes.set(id, probe as ContrastProbe);
    }
  } catch (error) {
    disposeProbes(probes);
    throw error;
  }
  return probes;
}
function disposeProbes(probes: Map<string, ContrastProbe>) {
  for (const probe of probes.values()) {
    probe.background?.dispose();
    probe.mask?.dispose();
  }
}
async function renderProbe(
  preview: CompositionPreview,
  frame: number,
  native: boolean,
) {
  if (native) await preview.prepareFrame(frame);
  const report = await renderCompositionFrameAsync(preview, frame);
  if (report.diagnostics.some((d) => d.severity === "error"))
    throw new PassageError(report.diagnostics);
  return preview.readPixels();
}

/** Full-resolution grayscale changes reuse the continuous-motion 4-level / 200-pixel default gate. */
export async function analyzeRenderedCompositionQuality(
  comp: Composition,
  preview: CompositionPreview,
  policy: CompositionQualityPolicy = {},
  options: {
    signal?: AbortSignal;
    onFrame?: (frame: number) => void;
    /**
     * ET3: the preview's resources, so `text-contrast` can render each text
     * layer's background and glyph mask. Without them a declared
     * `textLegibility` reports contrast as unmeasured.
     */
    legibilityResources?: CompositionResources;
  } = {},
) {
  options.signal?.throwIfAborted();
  const resolved = resolveCompositionQualityPolicy(comp, policy);
  const pixelChannelThreshold = resolved.pixelChannelThreshold;
  assertCompositionQualityCapacity(comp.frameCount * comp.layers.length);
  const counts: number[] = [];
  let previous: Uint8Array | undefined;
  const native = comp.assets.some(
    (asset) =>
      asset.type === "video" ||
      asset.type === "sequence" ||
      asset.type === "native3d",
  );
  const probes =
    resolved.textLegibility && options.legibilityResources
      ? createContrastProbes(
          comp,
          preview,
          policy,
          resolved,
          options.legibilityResources,
        )
      : undefined;
  const percentile =
    resolved.textLegibility?.contrastPercentile ?? DEFAULT_CONTRAST_PERCENTILE;
  try {
    for (let frame = 0; frame < comp.frameCount; frame++) {
      options.signal?.throwIfAborted();
      if (native) await preview.prepareFrame(frame);
      options.signal?.throwIfAborted();
      const report = await renderCompositionFrameAsync(preview, frame);
      if (report.diagnostics.some((d) => d.severity === "error"))
        throw new PassageError(report.diagnostics);
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
          ? measureFrameEnergy(previous, gray, pixelChannelThreshold)
          : 0,
      );
      previous = gray;
      for (const probe of probes?.values() ?? []) {
        if (!probe.reading.has(frame)) continue;
        options.signal?.throwIfAborted();
        const back = await renderProbe(probe.background, frame, native);
        const mask = await renderProbe(probe.mask, frame, native);
        probe.evidence.frames.push({
          frame,
          words: measureTextContrastPixels(
            rgba,
            back,
            mask,
            probe.evidence.words.length,
            percentile,
            probe.evidence.attribution === "layer",
          ).map((value) =>
            value ? [Math.round(value[0] * 1e4) / 1e4, value[1]] : null,
          ),
        });
      }
      options.onFrame?.(frame);
      if (frame % 8 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    if (probes) disposeProbes(probes);
  }
  options.signal?.throwIfAborted();
  const textLegibilityEvidence: TextLegibilityEvidence | undefined =
    probes || policy.textLegibilityEvidence
      ? {
          ...policy.textLegibilityEvidence,
          ...(probes
            ? {
                contrast: Object.fromEntries(
                  [...probes].map(([id, probe]) => [id, probe.evidence]),
                ),
              }
            : {}),
        }
      : undefined;
  return {
    ...analyzeCompositionQuality(comp, {
      ...policy,
      ...(textLegibilityEvidence ? { textLegibilityEvidence } : {}),
      pixelChangedCounts: counts,
      evaluation: {
        ...policy.evaluation,
        ...preview.evaluationOptions,
        textBounds: preview.textBounds,
      },
    }),
    backend: preview.backend,
    rendererVersion: preview.rendererVersion,
  };
}
