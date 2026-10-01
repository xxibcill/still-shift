import type {
  Composition,
  CompositionScope,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../evaluate/evaluate.ts";
import type { Bounds, EvaluatedLayerTree } from "../evaluate/types.ts";

export type CompositionTextFrames = Record<string, readonly number[]>;

export function animatedTextNodes(scope: CompositionScope): Set<string> {
  return new Set((scope.textAnimators ?? []).map((animator) => animator.node));
}

/** Cache preparation uses the same rounded layer clock as glyph drawing. */
export function collectCompositionTextFrames(
  comp: Composition,
  textBounds: Record<string, Bounds[]>,
): CompositionTextFrames {
  const samples = new Map<string, Set<number>>();
  for (const scope of [comp, ...(comp.precomps ?? [])]) {
    const prefix = scope === comp ? "" : `${scope.id}/`;
    for (const node of animatedTextNodes(scope))
      samples.set(prefix + node, new Set());
  }
  if (!samples.size) return {};
  const visit = (
    tree: EvaluatedLayerTree,
    scope: CompositionScope,
    prefix: string,
  ) => {
    for (const state of tree.layers) {
      const matte = tree.layers.some(
        (target) => target.layer.trackMatte?.layer === state.id,
      );
      const matteActive =
        matte &&
        tree.time >= 0 &&
        tree.time < scope.frameCount &&
        tree.time >= (state.layer.inPoint ?? 0) &&
        tree.time < (state.layer.outPoint ?? scope.frameCount);
      if (state.layer.type === "text" && (state.visible || matteActive))
        samples.get(prefix + state.id)?.add(Math.round(state.time));
      if (state.precomp)
        visit(
          state.precomp,
          comp.precomps!.find((nested) => nested.id === state.precomp!.id)!,
          `${state.precomp.id}/`,
        );
    }
  };
  for (let frame = 0; frame < comp.frameCount; frame++)
    visit(evaluateComp(comp, frame, { textBounds }), comp, "");
  return Object.fromEntries(
    [...samples].map(([key, frames]) => [
      key,
      [...frames].sort((a, b) => a - b),
    ]),
  );
}
