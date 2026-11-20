import { resolveCompositionQualityPolicy } from "./quality-policy.ts";
import type { Composition } from "@still-shift/scene-contract";
import type { TextLayer } from "./render/text-scenes.ts";
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
  TextFramingEvidence,
  TextLegibilityEvidence,
} from "./quality-policy.ts";
import {
  DEFAULT_REVIEW_WIDTH,
  measureTextContrastPixels,
  measureTreatedTextContrastPixels,
  textContrastPercentile,
  treatedEdgeRadius,
  textLegibilityBackground,
  textLegibilityFrames,
  textLegibilityMask,
} from "./text-legibility.ts";

/**
 * Probe preview pairs kept alive across frames. A WebGL2 preview holds its own
 * context and Chromium keeps about 16 per page, so the linted preview, six
 * live pairs and one per-frame pair (15) stay under the limit; on canvas2d it
 * bounds the extra full-size canvases.
 */
export const MAX_LIVE_CONTRAST_PROBES = 6;

type ProbePreviews = { background?: ProbePreview; mask: ProbePreview };
type ContrastProbe = {
  id: string;
  /** Lower percentile of each word's contrasts (ET6b: per size class). */
  percentile: number;
  reading: Set<number>;
  /** Last reading frame; the live previews are disposed after it. */
  last: number;
  /** Absent for ET6b `treated-edge`, which reads the rendered frame only. */
  background?: Composition;
  mask: Composition;
  live?: ProbePreviews | undefined;
  evidence: TextContrastLayerEvidence;
};

/**
 * ET3: per root text layer, the compositions for a frame without its glyphs
 * (transparent glyph colours keep its container and highlights) and for a
 * word-coded glyph mask. Their previews are opened only for the layer's
 * reading window (`openProbePreviews`), sharing the linted preview's
 * resources and backend.
 */
function createContrastProbes(
  comp: Composition,
  preview: CompositionPreview,
  policy: CompositionQualityPolicy,
  resolved: ReturnType<typeof resolveCompositionQualityPolicy>,
) {
  const frames = sampleCompositionQuality(comp, {
    ...policy.evaluation,
    ...preview.evaluationOptions,
    textBounds: preview.textBounds,
  });
  const probes = new Map<string, ContrastProbe>();
  const treated = resolved.textLegibility?.contrastMethod === "treated-edge";
  // The same glyph evidence as the final analysis, so both read the same
  // frames of an outline-only layer.
  const framing = textFramingEvidence(preview);
  for (const [id, reading] of textLegibilityFrames(comp, frames, {
    ...resolved,
    ...(framing ? { textFramingEvidence: framing } : {}),
  })) {
    const mask = textLegibilityMask(comp, id, { ring: treated });
    const layer = comp.layers.find(
      (candidate): candidate is TextLayer =>
        candidate.id === id && candidate.type === "text",
    )!;
    probes.set(id, {
      id,
      percentile: textContrastPercentile(
        comp,
        layer,
        frames,
        reading,
        resolved.textLegibility!,
      ),
      reading: new Set(reading),
      last: reading.at(-1) ?? -1,
      ...(treated ? {} : { background: textLegibilityBackground(comp, id) }),
      mask: mask.composition,
      evidence: { ...mask.evidence, frames: [] },
    });
  }
  return probes;
}
type ProbePreview = { preview: CompositionPreview; canvas: HTMLCanvasElement };
function openProbePreview(
  composition: Composition,
  resources: CompositionResources,
  backend: CompositionPreview["backend"],
): ProbePreview {
  const canvas = document.createElement("canvas");
  try {
    return {
      preview: createCompositionPreview(canvas, composition, resources, {
        backend,
      }),
      canvas,
    };
  } catch (error) {
    releaseProbeCanvas(canvas);
    throw error;
  }
}
/**
 * Disposing a preview frees its resources but not its WebGL2 context, which
 * otherwise holds one of the page's context slots until garbage collection;
 * lose it and drop the canvas backing store.
 */
function releaseProbeCanvas(canvas: HTMLCanvasElement) {
  (canvas.getContext("webgl2") as WebGL2RenderingContext | null)
    ?.getExtension("WEBGL_lose_context")
    ?.loseContext();
  canvas.width = canvas.height = 0;
}
/**
 * Probe previews share the linted preview's media but must not dispose it: a
 * probe closed after its layer's reading window would otherwise stop the
 * video for every later frame ("Disposed media resources").
 */
function sharedProbeResources(
  resources: CompositionResources,
): CompositionResources {
  return resources.media
    ? {
        ...resources,
        media: Object.create(resources.media, {
          dispose: { value: () => {} },
        }) as NonNullable<CompositionResources["media"]>,
      }
    : resources;
}
function openProbePreviews(
  probe: ContrastProbe,
  shared: CompositionResources,
  backend: CompositionPreview["backend"],
): ProbePreviews {
  const resources = sharedProbeResources(shared);
  const background = probe.background
    ? openProbePreview(probe.background, resources, backend)
    : undefined;
  try {
    return {
      ...(background ? { background } : {}),
      mask: openProbePreview(
        probe.mask,
        { ...resources, textProbe: { node: probe.id, mode: "ink-only" } },
        backend,
      ),
    };
  } catch (error) {
    if (background) disposeProbePreview(background);
    throw error;
  }
}
function disposeProbePreview({ preview, canvas }: ProbePreview) {
  try {
    preview.dispose();
  } finally {
    releaseProbeCanvas(canvas);
  }
}
function disposeProbePreviews(previews: ProbePreviews | undefined) {
  if (!previews) return;
  try {
    if (previews.background) disposeProbePreview(previews.background);
  } finally {
    disposeProbePreview(previews.mask);
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

/**
 * ET5a evidence from the linted preview: settled glyph ink per text state
 * (O2) and the prepared text's orphaned-decoration probe (O3), which the
 * analysis asks on the frames it samples.
 */
function textFramingEvidence(
  preview: CompositionPreview,
): TextFramingEvidence | undefined {
  if (!preview.textInkBounds) return undefined;
  return {
    ink: preview.textInkBounds,
    ...(preview.orphanedTextDecorations
      ? { orphanedDecorations: preview.orphanedTextDecorations }
      : {}),
    ...(preview.textGlyphMotion
      ? { glyphMotion: preview.textGlyphMotion }
      : {}),
  };
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
      ? createContrastProbes(comp, preview, policy, resolved)
      : undefined;
  const resources = options.legibilityResources;
  let liveProbes = 0;
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
        // Previews live for the layer's reading window; beyond the live cap,
        // a layer on screen with many others gets a pair for this frame only.
        if (!probe.live && liveProbes < MAX_LIVE_CONTRAST_PROBES) {
          probe.live = openProbePreviews(probe, resources!, preview.backend);
          liveProbes++;
        }
        const previews =
          probe.live ?? openProbePreviews(probe, resources!, preview.backend);
        let back: Uint8ClampedArray | Uint8Array | undefined,
          mask: Uint8ClampedArray | Uint8Array;
        try {
          if (previews.background)
            back = await renderProbe(
              previews.background.preview,
              frame,
              native,
            );
          mask = await renderProbe(previews.mask.preview, frame, native);
        } finally {
          if (previews !== probe.live) disposeProbePreviews(previews);
        }
        if (frame === probe.last && probe.live) {
          disposeProbePreviews(probe.live);
          probe.live = undefined;
          liveProbes--;
        }
        const fourDigits = (value: number) => Math.round(value * 1e4) / 1e4;
        probe.evidence.frames.push({
          frame,
          words: back
            ? measureTextContrastPixels(
                rgba,
                back,
                mask,
                probe.evidence.words.length,
                probe.percentile,
                probe.evidence.attribution === "layer",
              ).map((value) =>
                value ? [fourDigits(value[0]), value[1]] : null,
              )
            : measureTreatedTextContrastPixels(
                rgba,
                mask,
                comp.width,
                comp.height,
                probe.evidence.words.length,
                probe.percentile,
                treatedEdgeRadius(
                  comp.width,
                  resolved.textLegibility?.reviewWidth ?? DEFAULT_REVIEW_WIDTH,
                ),
                probe.evidence.attribution === "layer",
              ).map((value) =>
                value
                  ? [
                      fourDigits(value[0]),
                      value[1],
                      fourDigits(value[2]),
                      value[3] === null ? null : fourDigits(value[3]),
                    ]
                  : null,
              ),
        });
      }
      options.onFrame?.(frame);
      if (frame % 8 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    for (const probe of probes?.values() ?? []) {
      disposeProbePreviews(probe.live);
      probe.live = undefined;
    }
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
  const framing = textFramingEvidence(preview);
  return {
    ...analyzeCompositionQuality(comp, {
      ...policy,
      ...(textLegibilityEvidence ? { textLegibilityEvidence } : {}),
      ...(framing ? { textFramingEvidence: framing } : {}),
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
