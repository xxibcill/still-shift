import {
  compositionRequiredCoverageGraphs,
  hasRequiredCompositionCoverage,
} from "./required-coverage.ts";
import type { Composition } from "@still-shift/scene-contract";
import {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "../evaluate/exposure.ts";
import {
  buildRenderGraph,
  type RenderGraphOptions,
  type RenderOp,
  type SurfaceNode,
  type NativeDepthOp,
} from "./graph.ts";
import type { EvaluationOptions } from "../evaluate/types.ts";

/** One authority for exposure, nested history, matte and effect-input expansion. */
export function* compositionRenderGraphs(
  comp: Composition,
  frame: number,
  options: RenderGraphOptions = {},
  sampleFrames = compositionExposureFrames(comp, frame, options),
) {
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
}

/** Actual native image dependencies from the graphs the renderer will execute. */
export function compositionMediaFrameDependencies(
  comp: Composition,
  frame: number,
  options: RenderGraphOptions = {},
): Map<string, Set<number>> {
  const assets = new Map<string, Set<number>>();
  const visited = new Set<object>();
  const surface = (node: SurfaceNode) => ops(node.ops);
  const ops = (operations: RenderOp[]) => {
    if (visited.has(operations)) return;
    visited.add(operations);
    for (const op of operations) {
      if (op.kind === "native-depth") {
        for (const graphic of op.graphics) surface(graphic.surface);
        continue;
      }
      if (op.kind === "draw") {
        if (op.content.type === "surface") surface(op.content.surface);
        if (op.content.type === "image" && op.content.media) {
          const { asset, pair } = op.content.media;
          let frames = assets.get(asset);
          if (!frames) assets.set(asset, (frames = new Set()));
          frames.add(pair!.first);
          if (pair!.mix > 0) frames.add(pair!.second);
        }
      } else {
        if (op.kind === "project") surface(op.surface);
        if (op.kind === "isolate") ops(op.ops);
        if (op.kind === "adjust")
          for (const history of op.history ?? []) ops(history.ops);
        if (op.matte) ops(op.matte.ops);
        for (const effect of op.effects)
          for (const inputs of Object.values(effect.layerInputs ?? {}))
            ops(inputs);
      }
    }
  };
  for (const { graph } of compositionRenderGraphs(comp, frame, {
    ...options,
    nativePassDiscovery: true,
  }))
    surface(graph.root);
  if (hasRequiredCompositionCoverage(comp))
    for (const { graph } of compositionRequiredCoverageGraphs(comp, frame, {
      ...options,
      nativePassDiscovery: true,
    }))
      surface(graph.root);
  return assets;
}

export type NativePassReference = Pick<
  NativeDepthOp,
  "layer" | "sourceKey" | "frame" | "sampleFrame" | "width" | "height"
>;

/** Exact native pass invocation order, without allocating glyph/artwork or GPU resources. */
export function* compositionNativePasses(
  comp: Composition,
  outputFrame: number,
  options: EvaluationOptions = {},
): Generator<NativePassReference> {
  function* visit(ops: readonly RenderOp[]): Generator<NativePassReference> {
    for (const op of ops) {
      if (op.kind === "native-depth") {
        const { layer, sourceKey, frame, sampleFrame, width, height } = op;
        yield { layer, sourceKey, frame, sampleFrame, width, height };
        continue;
      }
      if (op.kind === "draw") {
        if (op.content.type === "surface") yield* visit(op.content.surface.ops);
        continue;
      }
      if (op.kind === "project") yield* visit(op.surface.ops);
      if (op.kind === "isolate") yield* visit(op.ops);
      if (op.kind === "adjust")
        for (const history of op.history ?? []) yield* visit(history.ops);
      for (const effect of op.effects)
        for (const inputs of Object.values(effect.layerInputs ?? {}))
          yield* visit(inputs);
      if (op.matte) yield* visit(op.matte.ops);
    }
  }
  for (const { graph } of compositionRenderGraphs(comp, outputFrame, {
    ...options,
    nativePassDiscovery: true,
  }))
    yield* visit(graph.root.ops);
}
