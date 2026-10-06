import type { Composition } from "@still-shift/scene-contract";
import {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "../evaluate/exposure.ts";
import { requireSpatialCapabilities } from "./spatial-capabilities.ts";
import type { PassageDiagnostic } from "../../passage-diagnostics.ts";
import {
  buildRenderGraph,
  type RenderGraphOptions,
  type SurfaceNode,
} from "./graph.ts";
import { executeGraph, type RenderBackend, type Surface } from "./backend.ts";

/** Definitions are immutable shared references; only per-sample draw values differ. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && equal(left[key], right[key]),
    )
  );
}

/** Only the immediately preceding stationary graph is retained. */
export type CompositionFrameCache = {
  root?: SurfaceNode | undefined;
  key?: string | undefined;
};

/** Average moving exposures; a proven identical graph needs only one draw. */
export function renderCompositionExposure<S extends Surface>(
  backend: RenderBackend<S>,
  target: S,
  comp: Composition,
  frame: number,
  options: RenderGraphOptions = {},
  cache?: CompositionFrameCache,
) {
  const sampleFrames = compositionExposureFrames(comp, frame, options);
  const graphs = function* () {
    for (const tree of evaluateCompositionExposure(
      comp,
      frame,
      options,
      sampleFrames,
    ))
      yield {
        graph: buildRenderGraph(comp, tree, options),
        diagnostics: tree.diagnostics,
      };
  };
  const candidates = graphs();
  const first = candidates.next().value!;
  const firstKey = backend.frameKey?.(first.graph.root);
  let stationary = true;
  for (const candidate of candidates)
    if (
      firstKey === undefined
        ? !equal(first.graph.root, candidate.graph.root)
        : firstKey !== backend.frameKey!(candidate.graph.root)
    ) {
      stationary = false;
      break;
    }
  // All spatial shutter samples must pass before accumulation can touch the retained frame.
  if (
    [comp, ...(comp.precomps ?? [])].some((scope) =>
      scope.layers.some((layer) => layer.threeD || layer.type === "camera"),
    )
  )
    for (const candidate of graphs())
      if (candidate.graph.spatial)
        requireSpatialCapabilities(candidate.graph.root, {
          projective: !!backend.project && !!backend.applyProjectiveClips,
          validateSurface: backend.validateSpatialSurface,
        });
  if (stationary) {
    const reused =
      cache?.root !== undefined &&
      (firstKey === undefined
        ? equal(cache.root, first.graph.root)
        : cache.key === firstKey);
    if (!reused) {
      // A failed draw can partially overwrite the previous framebuffer.
      if (cache) {
        cache.root = undefined;
        cache.key = undefined;
      }
      executeGraph(backend, first.graph, target);
    }
    if (cache) {
      cache.root = first.graph.root;
      cache.key = firstKey;
    }
    return {
      diagnostics: first.diagnostics,
      culled: first.graph.culled,
      samples: reused ? 0 : 1,
    };
  }
  if (cache) {
    cache.root = undefined;
    cache.key = undefined;
  }
  const samples = sampleFrames.length;
  const rendered = graphs();
  const diagnostics: PassageDiagnostic[] = [];
  const culled = new Set<string>();
  backend.accumulateExposure(target, samples, (index) => {
    const current = rendered.next().value!;
    executeGraph(backend, current.graph, target);
    if (index === 0) diagnostics.push(...current.diagnostics);
    current.graph.culled.forEach((key) => culled.add(key));
  });
  return { diagnostics, culled: [...culled], samples };
}
