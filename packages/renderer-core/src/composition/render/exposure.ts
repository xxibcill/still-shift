import type { Composition } from "@still-shift/scene-contract";
import {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "../evaluate/exposure.ts";
import type { PassageDiagnostic } from "../../passage-diagnostics.ts";
import { buildRenderGraph, type RenderGraphOptions } from "./graph.ts";
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

/** Average moving exposures; a proven identical graph needs only one draw. */
export function renderCompositionExposure<S extends Surface>(
  backend: RenderBackend<S>,
  target: S,
  comp: Composition,
  frame: number,
  options: RenderGraphOptions = {},
) {
  const graphs = function* () {
    for (const tree of evaluateCompositionExposure(comp, frame, options))
      yield {
        graph: buildRenderGraph(comp, tree, options),
        diagnostics: tree.diagnostics,
      };
  };
  const candidates = graphs();
  const first = candidates.next().value!;
  let stationary = true;
  for (const candidate of candidates)
    if (!equal(first.graph.root, candidate.graph.root)) {
      stationary = false;
      break;
    }
  if (stationary) {
    executeGraph(backend, first.graph, target);
    return {
      diagnostics: first.diagnostics,
      culled: first.graph.culled,
      samples: 1,
    };
  }
  const samples = compositionExposureFrames(comp, frame).length;
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
