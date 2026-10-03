import {
  COMPOSITION_LIMITS,
  type Composition,
  type CompositionLayer,
  type CompositionScope,
} from "@still-shift/scene-contract";
import { evaluateComp } from "./evaluate.ts";
import type { EvaluatedLayerTree, EvaluationOptions } from "./types.ts";

type ExposureCut = { time: number; inclusive: "before" | "after" };
const scopeCuts = new WeakMap<CompositionScope, readonly ExposureCut[]>();

/** Visibility and content switches are cuts; continuous transform keys are not. */
function cutsFor(scope: CompositionScope): readonly ExposureCut[] {
  const cached = scopeCuts.get(scope);
  if (cached) return cached;
  const forward = new Set([0, scope.frameCount]);
  const reversed = new Set<number>();
  for (const layer of scope.layers) {
    forward.add(layer.inPoint ?? 0);
    forward.add(layer.outPoint ?? scope.frameCount);
    const layerCuts = (layer.stretch ?? 1) < 0 ? reversed : forward;
    const global = (time: number) =>
      time * (layer.stretch ?? 1) + (layer.startFrame ?? 0);
    if ("state" in layer || "stateFrom" in layer)
      for (const state of [layer.state, layer.stateFrom])
        if (typeof state === "object")
          for (let index = 1; index < state.keys.length; index++) {
            const key = state.keys[index]!;
            if (key.value === state.keys[index - 1]!.value) continue;
            // Indexed clocks hold index zero before their first table sample.
            if (layer.sampleTimes && key.frame <= 0) continue;
            const time = layer.sampleTimes
              ? layer.sampleTimes[key.frame]
              : key.frame;
            if (time !== undefined) layerCuts.add(global(time));
          }
    for (const effect of layer.effects ?? []) {
      if (effect.inPoint !== undefined) layerCuts.add(global(effect.inPoint));
      if (effect.outPoint !== undefined) layerCuts.add(global(effect.outPoint));
    }
  }
  const cuts: ExposureCut[] = [
    ...[...forward].map((time) => ({ time, inclusive: "after" as const })),
    ...[...reversed].map((time) => ({ time, inclusive: "before" as const })),
  ];
  scopeCuts.set(scope, cuts);
  return cuts;
}

function withinCut(time: number, frame: number, cuts: readonly ExposureCut[]) {
  let lower = 0,
    upper = Infinity;
  for (const cut of cuts) {
    const before =
      frame < cut.time || (frame === cut.time && cut.inclusive === "before");
    if (before)
      upper = Math.min(
        upper,
        cut.time - (cut.inclusive === "after" ? 1e-7 : 0),
      );
    else
      lower = Math.max(
        lower,
        cut.time + (cut.inclusive === "before" ? 1e-7 : 0),
      );
  }
  return Math.max(lower, Math.min(upper, time));
}

/** Fixed-order midpoint quadrature, centered on the frame before shutter phase. */
export function compositionExposureFrames(
  comp: Composition,
  frame: number,
): number[] {
  const blur = comp.motionBlur;
  if (
    !blur?.enabled ||
    !blur.shutterAngle ||
    frame < (blur.inPoint ?? 0) ||
    frame >= (blur.outPoint ?? comp.frameCount) ||
    ![comp, ...(comp.precomps ?? [])].some((scope) =>
      scope.layers.some((layer) => layer.motionBlur),
    )
  )
    return [frame];
  const cuts: ExposureCut[] = [
    ...cutsFor(comp),
    ...[
      ...(blur.cuts ?? []),
      blur.inPoint ?? 0,
      blur.outPoint ?? comp.frameCount,
    ].map((time) => ({ time, inclusive: "after" as const })),
  ];
  return Array.from({ length: blur.samples }, (_, index) =>
    withinCut(
      Math.max(
        0,
        Math.min(
          comp.frameCount - 1,
          frame +
            (((index + 0.5) / blur.samples - 0.5) * blur.shutterAngle) / 360 +
            blur.shutterPhase / 360,
        ),
      ),
      frame,
      cuts,
    ),
  );
}

function sampleWithScopeCuts(
  comp: Composition,
  base: EvaluatedLayerTree,
  time: number,
  options: EvaluationOptions,
): EvaluatedLayerTree {
  const scopeTimes = { ...options.scopeTimes };
  let tree = evaluateComp(comp, time, options);
  // A corrected host clock can change every deeper clock, so settle outside-in.
  for (let depth = 0; depth < COMPOSITION_LIMITS.maxPrecompDepth; depth++) {
    let changed = false;
    const visit = (
      atFrame: EvaluatedLayerTree,
      atSample: EvaluatedLayerTree,
      route: string,
    ) => {
      for (let i = 0; i < atFrame.layers.length; i++) {
        const a = atFrame.layers[i]!,
          b = atSample.layers[i]!;
        if (!a.precomp || !b.precomp) continue;
        const key = route + a.id;
        const scope = comp.precomps!.find(
          (scope) => scope.id === a.precomp!.id,
        )!;
        const clamped = withinCut(
          b.precomp.time,
          a.precomp.time,
          cutsFor(scope),
        );
        if (clamped !== b.precomp.time) {
          scopeTimes[key] = clamped;
          changed = true;
        } else visit(a.precomp, b.precomp, key + "/");
      }
    };
    visit(base, tree, "");
    if (!changed) break;
    tree = evaluateComp(comp, time, { ...options, scopeTimes });
  }
  return tree;
}

/** Select complete evaluated poses, retaining dependency transforms at their own clock. */
function mixExposure(
  base: EvaluatedLayerTree,
  sample: EvaluatedLayerTree,
  baseTime: number,
  sampleTime: number,
  inherited: boolean,
): EvaluatedLayerTree {
  const definitions = new Map(
    base.layers.map((state) => [state.id, state.layer]),
  );
  const enabled = (layer: CompositionLayer): boolean => {
    for (
      let ancestor: CompositionLayer | undefined = layer;
      ancestor;
      ancestor = ancestor.parent ? definitions.get(ancestor.parent) : undefined
    )
      if (
        (ancestor === layer || ancestor.type === "group") &&
        ancestor.motionBlur !== undefined
      )
        return ancestor.motionBlur;
    return inherited;
  };
  const layers = base.layers.map((state, index) => {
    const moving = enabled(state.layer),
      other = sample.layers[index]!;
    const source = moving ? other : state;
    return {
      ...source,
      exposure: {
        tree: moving ? sample : base,
        rootTime: moving ? sampleTime : baseTime,
      },
      ...(state.precomp && other.precomp
        ? {
            precomp: mixExposure(
              state.precomp,
              other.precomp,
              baseTime,
              sampleTime,
              moving,
            ),
          }
        : {}),
    };
  });
  const byId = new Map(layers.map((state) => [state.id, state]));
  // A group has no own pixels. Its selected clock must not suppress a child that
  // explicitly samples another clock; children already carry inherited opacity.
  for (const state of layers) {
    if (!state.drawable || state.opacity <= 0) continue;
    for (let parent = state.layer.parent; parent; ) {
      const group = byId.get(parent)!;
      if (group.layer.type === "group") {
        group.visible = true;
        group.opacity = Math.max(group.opacity, state.opacity);
      }
      parent = group.layer.parent;
    }
  }
  return { ...base, layers };
}

/** Stream samples so memory stays bounded independently of the shutter count. */
export function* evaluateCompositionExposure(
  comp: Composition,
  frame: number,
  options: EvaluationOptions = {},
): Generator<EvaluatedLayerTree> {
  const base = evaluateComp(comp, frame, options);
  for (const time of compositionExposureFrames(comp, frame)) {
    if (time === frame) yield base;
    else
      yield mixExposure(
        base,
        sampleWithScopeCuts(comp, base, time, options),
        frame,
        time,
        false,
      );
  }
}
