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
import { buildLayerRenderGraph, type RenderGraphOptions } from "./graph.ts";
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
export function hasRequiredCompositionCoverage(
  comp: Composition,
  requiredRootLayers: ReadonlyMap<string, string> = new Map(),
) {
  return (
    requiredRootLayers.size > 0 ||
    [comp, ...(comp.precomps ?? [])].some((scope) =>
      scope.layers.some((layer) => layer.coverage === "required"),
    )
  );
}

/** The same isolated graphs drive readiness and actual coverage validation. */
export function* compositionRequiredCoverageGraphs(
  comp: Composition,
  frame: number,
  options: RenderGraphOptions = {},
  requiredRootLayers: ReadonlyMap<string, string> = new Map(),
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
    declarationPath?: string;
    scope: CompositionScope;
    graph: ReturnType<typeof buildLayerRenderGraph>;
  }> {
    for (const state of tree.layers) {
      const node = route + state.id;
      const declarationPath =
        route === "" ? requiredRootLayers.get(state.id) : undefined;
      if (state.layer.coverage === "required" || declarationPath !== undefined)
        yield {
          node,
          ...(declarationPath !== undefined ? { declarationPath } : {}),
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
  requiredRootLayers: ReadonlyMap<string, string> = new Map(),
) {
  const failed = new Set<string>();
  return (frame: number): PassageDiagnostic[] => {
    const diagnostics: PassageDiagnostic[] = [];
    for (const {
      node,
      declarationPath,
      scope,
      graph,
    } of compositionRequiredCoverageGraphs(
      comp,
      frame,
      options,
      requiredRootLayers,
    )) {
      if (failed.has(node)) continue;
      const target = backend.createSurface(scope.width, scope.height);
      let pixel: [number, number] | null;
      try {
        executeGraph(backend, graph, target, {
          rootRole: "coverage:" + node,
          statisticsPhase: "coverage",
        });
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
      const path = declarationPath ?? node + ".coverage";
      if (severity === "error" || declarationPath !== undefined)
        passageError("comp-camera-coverage", message, {
          node,
          path,
          frame,
        });
      diagnostics.push({
        code: "comp-camera-coverage",
        severity,
        message,
        node,
        path,
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
  requiredRootLayers: ReadonlyMap<string, string> = new Map(),
  frames?: readonly number[],
): PassageDiagnostic[] {
  if (!hasRequiredCompositionCoverage(comp, requiredRootLayers)) return [];
  const validate = createCompositionCoverageValidator(
    comp,
    backend,
    options,
    severity,
    requiredRootLayers,
  );
  const diagnostics: PassageDiagnostic[] = [];
  try {
    for (const frame of frames ??
      Array.from({ length: comp.frameCount }, (_, frame) => frame))
      diagnostics.push(...validate(frame));
    return diagnostics;
  } finally {
    backend.endFrame?.(false);
  }
}
