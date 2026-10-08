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
/** Render each required layer's actual alpha alone, including source states, effects, masks and mattes. */
export function validateRequiredCompositionCoverage<S extends Surface>(
  comp: Composition,
  backend: RenderBackend<S>,
  options: EvaluationOptions = {},
  severity: "error" | "warning" = "error",
  requiredRootLayers: ReadonlyMap<string, string> = new Map(),
  frames?: readonly number[],
): PassageDiagnostic[] {
  const scopes = [comp, ...(comp.precomps ?? [])];
  if (
    !requiredRootLayers.size &&
    !scopes.some((scope) =>
      scope.layers.some((layer) => layer.coverage === "required"),
    )
  )
    return [];
  const diagnostics: PassageDiagnostic[] = [],
    definitions = new Map(
      (comp.precomps ?? []).map((scope) => [scope.id, scope]),
    );
  const failed = new Set<string>();
  const visit = (
    tree: EvaluatedLayerTree,
    scope: CompositionScope,
    route: string,
    frame: number,
  ) => {
    for (const state of tree.layers) {
      const node = route + state.id;
      const declarationPath =
        route === "" ? requiredRootLayers.get(state.id) : undefined;
      if (
        (state.layer.coverage === "required" ||
          declarationPath !== undefined) &&
        !failed.has(node)
      ) {
        const graph = buildLayerRenderGraph(
          comp,
          tree,
          scope,
          state.id,
          route,
          options,
        );
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
        if (pixel) {
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
      }
      if (state.precomp && state.visible && state.opacity > 0)
        visit(
          state.precomp,
          definitions.get(state.precomp.id)!,
          node + "/",
          frame,
        );
    }
  };
  try {
    for (const frame of frames ??
      Array.from({ length: comp.frameCount }, (_, frame) => frame)) {
      for (const tree of evaluateCompositionExposure(comp, frame, options))
        visit(tree, comp, "", frame);
    }
  } finally {
    backend.endFrame?.(false);
  }
  return diagnostics;
}
