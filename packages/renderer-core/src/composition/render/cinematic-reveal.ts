import type { Composition } from "@still-shift/scene-contract";
import type { AlphaPixels } from "../../alpha-coverage.ts";
import { passageError } from "../../passage-diagnostics.ts";
import {
  cinematicRenderedRevealRequirements,
  validateCinematicCompositionCoverage,
} from "../adapters/cinematic-coverage.ts";
import { evaluateCompositionExposure } from "../evaluate/exposure.ts";
import type {
  EvaluatedLayerTree,
  EvaluationOptions,
} from "../evaluate/types.ts";
import { buildLayersRenderGraph } from "./graph.ts";
import { executeGraph, type RenderBackend, type Surface } from "./backend.ts";

/** Outside the viewport is transparent; do not clamp a missing semantic target to its edge. */
export function sampleRenderedRevealAlpha(
  image: AlphaPixels,
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0;
  const px = x - 0.5,
    py = y - 0.5,
    left = Math.floor(px),
    top = Math.floor(py);
  const dx = px - left,
    dy = py - top;
  const at = (column: number, row: number) =>
    image.data[
      (Math.max(0, Math.min(image.height - 1, row)) * image.width +
        Math.max(0, Math.min(image.width - 1, column))) *
        4 +
        3
    ]! / 255;
  return (
    (at(left, top) * (1 - dx) + at(left + 1, top) * dx) * (1 - dy) +
    (at(left, top + 1) * (1 - dx) + at(left + 1, top + 1) * dx) * dy
  );
}

/** Measure only treated planes, using the same isolated alpha and shutter clocks as production. */
export function validateRenderedCinematicCompositionCoverage<S extends Surface>(
  composition: Composition,
  readPixels: (assetId: string) => AlphaPixels,
  backend: RenderBackend<S>,
  options: EvaluationOptions = {},
) {
  const requirements = cinematicRenderedRevealRequirements(composition);
  if (!requirements?.layers.size)
    return validateCinematicCompositionCoverage(composition, readPixels);
  const required = requirements.layers;
  let currentFrame = NaN;
  let exposures: EvaluatedLayerTree[] = [];
  const pixels = new Map<string, AlphaPixels>();
  const capture = (ids: readonly string[], frame: number) => {
    if (frame !== currentFrame) {
      currentFrame = frame;
      pixels.clear();
      exposures = [...evaluateCompositionExposure(composition, frame, options)];
    }
    const key = ids.join(",");
    const cached = pixels.get(key);
    if (cached) return cached;
    for (const tree of exposures) {
      for (const id of ids) {
        const state = tree.layers.find((state) => state.id === id)!;
        if (!state.visible || !state.drawable || state.opacity !== 1)
          passageError(
            "comp-camera-coverage",
            "Cinematic reveal requires full-opacity drawable native planes",
            { path: "metadata.cinematicCoverage", node: id, frame },
          );
      }
    }
    const target = backend.createSurface(composition.width, composition.height);
    try {
      const draw = (index: number) =>
        executeGraph(
          backend,
          buildLayersRenderGraph(
            composition,
            exposures[index]!,
            composition,
            ids,
            "",
            options,
          ),
          target,
        );
      if (exposures.length === 1) draw(0);
      else backend.accumulateExposure(target, exposures.length, draw);
      const image = {
        width: target.width,
        height: target.height,
        data: backend.readPixels(target),
      };
      pixels.set(key, image);
      return image;
    } finally {
      backend.releaseSurface(target);
    }
  };
  try {
    return validateCinematicCompositionCoverage(composition, readPixels, {
      sample: (node, frame, x, y) =>
        node.id === requirements.subject && required.has(node.id)
          ? sampleRenderedRevealAlpha(capture([node.id], frame), x, y)
          : undefined,
      ...(requirements.occluders.some((id) => required.has(id))
        ? {
            occlusion: (frame: number, x: number, y: number) =>
              sampleRenderedRevealAlpha(
                capture(requirements.occluders, frame),
                x,
                y,
              ),
          }
        : {}),
    });
  } finally {
    pixels.clear();
    exposures = [];
    backend.endFrame?.(false);
  }
}
