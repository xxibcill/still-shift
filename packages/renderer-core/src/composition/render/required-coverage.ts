import type {
  Composition,
  CompositionScope,
} from "@still-shift/scene-contract";
import {
  passageError,
  type PassageDiagnostic,
} from "../../passage-diagnostics.ts";
import { evaluateCompositionExposure } from "../evaluate/exposure.ts";
import type {
  EvaluatedLayerTree,
  EvaluationOptions,
} from "../evaluate/types.ts";
import { buildLayerRenderGraph } from "./graph.ts";
import { executeGraph, type RenderBackend, type Surface } from "./backend.ts";

/** The existing camera-cover opacity threshold: no viewport pixel may fall below 254/255. */
export function uncoveredViewportPixel(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): [number, number] | null {
  if (rgba.length !== width * height * 4)
    throw Error("Coverage pixels must match the owning scope viewport");
  for (let pixel = 0; pixel < width * height; pixel++)
    if (rgba[pixel * 4 + 3]! < 254)
      return [pixel % width, Math.floor(pixel / width)];
  return null;
}
export function hasRequiredCompositionCoverage(comp: Composition) {
  return [comp, ...(comp.precomps ?? [])].some((scope) =>
    scope.layers.some((layer) => layer.coverage === "required"),
  );
}

/** The same isolated graphs drive readiness and actual coverage validation. */
export function* compositionRequiredCoverageGraphs(
  comp: Composition,
  frame: number,
  options: EvaluationOptions = {},
) {
  const definitions = new Map(
    (comp.precomps ?? []).map((scope) => [scope.id, scope]),
  );
  function* visit(
    tree: EvaluatedLayerTree,
    scope: CompositionScope,
    route: string,
  ): Generator<{
    node: string;
    scope: CompositionScope;
    graph: ReturnType<typeof buildLayerRenderGraph>;
  }> {
    for (const state of tree.layers) {
      const node = route + state.id;
      if (state.layer.coverage === "required")
        yield {
          node,
          scope,
          graph: buildLayerRenderGraph(
            comp,
            tree,
            scope,
            state.id,
            route,
            options,
          ),
        };
      if (state.precomp && state.visible && state.opacity > 0)
        yield* visit(
          state.precomp,
          definitions.get(state.precomp.id)!,
          node + "/",
        );
    }
  }
  for (const tree of evaluateCompositionExposure(comp, frame, options))
    yield* visit(tree, comp, "");
}

export function createCompositionCoverageValidator<S extends Surface>(
  comp: Composition,
  backend: RenderBackend<S>,
  options: EvaluationOptions = {},
  severity: "error" | "warning" = "error",
) {
  const failed = new Set<string>();
  return (frame: number): PassageDiagnostic[] => {
    const diagnostics: PassageDiagnostic[] = [];
    for (const { node, scope, graph } of compositionRequiredCoverageGraphs(
      comp,
      frame,
      options,
    )) {
      if (failed.has(node)) continue;
      const target = backend.createSurface(scope.width, scope.height);
      let pixel: [number, number] | null;
      try {
        executeGraph(backend, graph, target);
        pixel = uncoveredViewportPixel(
          backend.readPixels(target),
          scope.width,
          scope.height,
        );
      } finally {
        backend.releaseSurface(target);
      }
      if (!pixel) continue;
      const message = `Required camera coverage on ${node} exposes the owning scope at frame ${frame}, pixel ${pixel[0]},${pixel[1]}`;
      if (severity === "error")
        passageError("comp-camera-coverage", message, {
          node,
          path: node + ".coverage",
          frame,
        });
      diagnostics.push({
        code: "comp-camera-coverage",
        severity,
        message,
        node,
        path: node + ".coverage",
        frame,
      });
      failed.add(node);
    }
    return diagnostics;
  };
}

/** Render every required layer's actual alpha alone, with its source/effects/matte. */
export function validateRequiredCompositionCoverage<S extends Surface>(
  comp: Composition,
  backend: RenderBackend<S>,
  options: EvaluationOptions = {},
  severity: "error" | "warning" = "error",
): PassageDiagnostic[] {
  if (!hasRequiredCompositionCoverage(comp)) return [];
  const validate = createCompositionCoverageValidator(
    comp,
    backend,
    options,
    severity,
  );
  const diagnostics: PassageDiagnostic[] = [];
  try {
    for (let frame = 0; frame < comp.frameCount; frame++)
      diagnostics.push(...validate(frame));
    return diagnostics;
  } finally {
    backend.endFrame?.(false);
  }
}
