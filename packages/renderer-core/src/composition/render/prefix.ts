import { compositionLayerVariation } from "./prefix-dependencies.ts";
import type {
  Composition,
  CompositionLayer,
  CompositionScope,
} from "@still-shift/scene-contract";
import type { RenderBackend, Surface } from "./backend.ts";
import { renderBatches } from "./batches.ts";
import type { RenderOp, SurfaceNode } from "./graph.ts";

/** Selection hints only: complete evaluated closure keys still authorize every reuse. */
export function compositionPrefixLayers(composition: Composition) {
  const candidates = new Set<string>();
  const varies = compositionLayerVariation(composition);
  // Expressions, constraints and cameras elsewhere in the document do not
  // invalidate a fixed prefix. The cache compares the complete evaluated native
  // closure on every frame, including transforms and prepared content identity.
  const visit = (scope: CompositionScope, prefix: string, depth: number) => {
    if (depth > 32) return;
    const layers = new Map(scope.layers.map((layer) => [layer.id, layer]));
    const fixed = (
      layer: CompositionLayer,
      seen = new Set<string>(),
    ): boolean => {
      if (seen.has(layer.id)) return false;
      seen.add(layer.id);
      if (
        varies(layer, prefix + layer.id) ||
        layer.threeD ||
        layer.receivesLight ||
        (layer.effects?.length ?? 0) > 0 ||
        (layer.masks?.length ?? 0) > 0 ||
        layer.trackMatte ||
        layer.type === "adjustment" ||
        layer.type === "depth-image" ||
        layer.type === "camera" ||
        layer.type === "light"
      )
        return false;
      if (
        layer.type === "text" &&
        (layer.transitions?.length || layer.decorations?.length)
      )
        return false;
      return (
        !layer.parent ||
        (layers.has(layer.parent) && fixed(layers.get(layer.parent)!, seen))
      );
    };
    for (const layer of scope.layers) {
      if (!fixed(layer)) continue;
      candidates.add(prefix + layer.id);
      if (layer.type === "precomp") {
        const nested = composition.precomps?.find(
          (scope) => scope.id === layer.comp,
        );
        if (nested) visit(nested, prefix + layer.id + "/", depth + 1);
      }
    }
  };
  visit(composition, "", 0);
  return candidates;
}

/** A closed prefix can end only between whole original batches. */
export function compositionRootPrefix<S extends Surface>(
  backend: Pick<RenderBackend<S>, "drawVectors" | "fillRects">,
  node: SurfaceNode,
  layers: ReadonlySet<string>,
): SurfaceNode | undefined {
  const eligible = (op: RenderOp): boolean => {
    if (!layers.has(op.layer)) return false;
    if (op.kind !== "draw") return false;
    if (op.content.type === "image") return !op.content.media;
    if (op.content.type === "depth-image") return false;
    if (op.content.type === "surface")
      return op.content.surface.ops.every(eligible);
    return true;
  };
  let end = 0;
  for (const batch of renderBatches(backend, node.ops, node.colorSpace)) {
    if (!batch.ops.every(eligible)) break;
    end = batch.end;
  }
  return end > 0 && end < node.ops.length
    ? { ...node, ops: node.ops.slice(0, end) }
    : undefined;
}
