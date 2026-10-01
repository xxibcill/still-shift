import type {
  BezierPath,
  Composition,
  CompositionBlendMode,
  CompositionLayer,
  CompositionScope,
  TrackMatte,
} from "@still-shift/scene-contract";
import {
  multiplyMatrix,
  transformPoint,
  type Matrix,
  type Point,
} from "../../node-transform.ts";
import type {
  Bounds,
  EvaluatedLayer,
  EvaluatedLayerTree,
  Rgba,
} from "../evaluate/types.ts";
import { cameraMatrix } from "../evaluate/camera.ts";

type TextLayer = Extract<CompositionLayer, { type: "text" }>;
type ImageLayer = Extract<CompositionLayer, { type: "image" }>;

/** An axis-aligned rectangle `[0, width] × [0, height]` in the space of `matrix`. */
export type ClipRect = {
  matrix: Matrix;
  transforms?: Matrix[];
  width: number;
  height: number;
};

export type MaskOp = {
  id: string;
  path: BezierPath;
  mode: "add" | "subtract" | "intersect" | "difference";
  inverted: boolean;
  feather: number;
  expansion: number;
  opacity: number;
  /** Layer space to surface space. */
  matrix: Matrix;
  transforms?: Matrix[];
};

export type SolidContent = {
  type: "solid";
  width: number;
  height: number;
  color: Rgba;
};
export type ImageContent = {
  type: "image";
  width: number;
  height: number;
  fit: "contain" | "cover" | "stretch";
  rasterize: "draw" | "natural-size";
  sources: ImageLayer["sources"];
  state: number;
  stateFrom?: number;
  stateMix?: number;
};
export type TextContent = {
  type: "text";
  /** Root layer id or `precomp-id/layer-id`, as in `EvaluationOptions.textBounds`. */
  key: string;
  layer: TextLayer;
  /** Layer time: text transitions, decorations and animators are sampled here. */
  time: number;
  state: number;
  reveal: number;
  color: Rgba;
};
export type SurfaceContent = { type: "surface"; surface: SurfaceNode };
export type ProviderContent = {
  type: "provider";
  key: string;
  layer: Extract<CompositionLayer, { type: "provider" }>;
  time: number;
};
export type LayerContent =
  | SolidContent
  | ImageContent
  | TextContent
  | ProviderContent
  | SurfaceContent;

/** Draw content straight into the current surface. */
export type DrawOp = {
  kind: "draw";
  layer: string;
  content: LayerContent;
  matrix: Matrix;
  /** Preserve native Canvas concatenation precision through cameras and parents. */
  transforms: Matrix[];
  opacity: number;
  blend: CompositionBlendMode;
  clips: ClipRect[];
};
/** Render `ops` into a scope-sized surface, apply masks and matte, then composite. */
export type IsolateOp = {
  kind: "isolate";
  layer: string;
  ops: RenderOp[];
  masks: MaskOp[];
  matte: MatteOp | null;
  opacity: number;
  blend: CompositionBlendMode;
  clips: ClipRect[];
};
/** Re-composite everything below within a layer-space region (adjustment layer). */
export type AdjustOp = {
  kind: "adjust";
  layer: string;
  matrix: Matrix;
  transforms: Matrix[];
  width: number;
  height: number;
  masks: MaskOp[];
  matte: MatteOp | null;
  opacity: number;
  blend: CompositionBlendMode;
  clips: ClipRect[];
};
export type MatteOp = {
  mode: TrackMatte["mode"];
  layer: string;
  /** Ops that draw the matte layer with its own transform, opacity, masks and matte. */
  ops: RenderOp[];
};
export type RenderOp = DrawOp | IsolateOp | AdjustOp;

/** One composition scope rendered into its own surface. */
export type SurfaceNode = {
  id: string;
  width: number;
  height: number;
  background: Rgba | null;
  ops: RenderOp[];
};

export type RenderGraph = {
  root: SurfaceNode;
  /** Layer keys skipped because their bounds miss the surface they draw into. */
  culled: string[];
};

type Frame = {
  matrix: Matrix;
  transforms: Matrix[];
  opacity: number;
  clips: ClipRect[];
  viewport: { width: number; height: number };
  /** Key prefix for layers of this scope (`""` at the root). */
  prefix: string;
};
type Scope = {
  tree: EvaluatedLayerTree;
  def: CompositionScope;
  byId: Map<string, EvaluatedLayer>;
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function boundsMiss(bounds: Bounds, matrix: Matrix, frame: Frame) {
  const corners = [
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.right, bounds.bottom],
    [bounds.left, bounds.bottom],
  ].map((p) => transformPoint(matrix, p as Point));
  return (
    Math.max(...corners.map((p) => p[0])) <= 0 ||
    Math.max(...corners.map((p) => p[1])) <= 0 ||
    Math.min(...corners.map((p) => p[0])) >= frame.viewport.width ||
    Math.min(...corners.map((p) => p[1])) >= frame.viewport.height
  );
}

class GraphBuilder {
  readonly culled: string[] = [];
  constructor(readonly comp: Composition) {}

  private precomp(id: string): CompositionScope {
    return this.comp.precomps!.find((p) => p.id === id)!;
  }

  surface(
    tree: EvaluatedLayerTree,
    def: CompositionScope,
    prefix: string,
  ): SurfaceNode {
    return {
      id: tree.id,
      width: tree.width,
      height: tree.height,
      background: tree.background,
      ops: this.scopeOps(tree, def, {
        matrix: IDENTITY,
        transforms: [],
        opacity: 1,
        clips: [],
        viewport: { width: tree.width, height: tree.height },
        prefix,
      }),
    };
  }

  scopeOps(
    tree: EvaluatedLayerTree,
    def: CompositionScope,
    frame: Frame,
  ): RenderOp[] {
    const scope: Scope = {
      tree,
      def,
      byId: new Map(tree.layers.map((s) => [s.id, s])),
    };
    const ops: RenderOp[] = [];
    // layers[0] is the top layer, so paint from the end of the list.
    for (let i = tree.layers.length - 1; i >= 0; i--) {
      const state = tree.layers[i]!;
      if (state.drawable) ops.push(...this.layerOps(scope, state, frame));
    }
    return ops;
  }

  private groupClips(scope: Scope, state: EvaluatedLayer, frame: Frame) {
    const clips: ClipRect[] = [];
    for (
      let parent = state.layer.parent;
      parent;
      parent = scope.byId.get(parent)!.layer.parent
    ) {
      const ancestor = scope.byId.get(parent)!;
      if (ancestor.layer.type === "group" && ancestor.layer.clip)
        clips.push({
          matrix: multiplyMatrix(frame.matrix, ancestor.screenMatrix),
          transforms: this.transforms(scope, ancestor, frame),
          width: ancestor.layer.size[0],
          height: ancestor.layer.size[1],
        });
    }
    return [...frame.clips, ...clips.reverse()];
  }

  private transforms(
    scope: Scope,
    state: EvaluatedLayer,
    frame: Frame,
  ): Matrix[] {
    const local: Matrix[] = [];
    let root = state;
    for (;;) {
      local.unshift(root.localMatrix);
      if (!root.layer.parent) break;
      root = scope.byId.get(root.layer.parent)!;
    }
    return [
      ...frame.transforms,
      ...(scope.def === this.comp && this.comp.camera2d
        ? [
            cameraMatrix(
              this.comp,
              scope.tree.time,
              root.layer.cameraDepth ?? 1,
            ),
          ]
        : []),
      ...local,
    ];
  }

  private masks(
    state: EvaluatedLayer,
    matrix: Matrix,
    transforms: Matrix[],
  ): MaskOp[] {
    return state.masks.flatMap((mask) =>
      mask.mode === "none"
        ? []
        : [
            {
              id: mask.id,
              path: mask.path,
              mode: mask.mode,
              inverted: mask.inverted ?? false,
              feather: mask.feather,
              expansion: mask.expansion,
              opacity: mask.opacity,
              matrix,
              transforms,
            },
          ],
    );
  }

  /** Mattes ignore `enabled`, solo and blend mode, as in AE; in/out points still apply. */
  private matte(
    scope: Scope,
    state: EvaluatedLayer,
    frame: Frame,
    seen: Set<string>,
  ): MatteOp | null {
    const matte = state.layer.trackMatte;
    if (!matte) return null;
    const source = scope.byId.get(matte.layer)!;
    const t = scope.tree.time,
      layer = source.layer;
    const active =
      t >= 0 &&
      t < scope.def.frameCount &&
      t >= (layer.inPoint ?? 0) &&
      t < (layer.outPoint ?? scope.def.frameCount) &&
      !seen.has(layer.id);
    return {
      mode: matte.mode,
      layer: frame.prefix + matte.layer,
      ops: active
        ? this.layerOps(
            scope,
            source,
            { ...frame, opacity: 1 },
            {
              blend: "normal",
              seen: new Set([...seen, layer.id]),
              cull: false,
            },
          )
        : [],
    };
  }

  private content(
    scope: Scope,
    state: EvaluatedLayer,
    frame: Frame,
  ): LayerContent | null {
    const layer = state.layer;
    switch (layer.type) {
      case "provider":
        return {
          type: "provider",
          key: frame.prefix ? `${scope.def.id}/${layer.id}` : layer.id,
          layer,
          time: state.time,
        };
      case "solid":
        return {
          type: "solid",
          width: layer.size[0],
          height: layer.size[1],
          color: state.color!,
        };
      case "image":
        return {
          type: "image",
          width: layer.size[0],
          height: layer.size[1],
          fit: layer.fit ?? "contain",
          rasterize: layer.rasterize ?? "draw",
          sources: layer.sources,
          state: state.state ?? 0,
          ...(state.stateFrom !== undefined && state.stateMix !== undefined
            ? { stateFrom: state.stateFrom, stateMix: state.stateMix }
            : {}),
        };
      case "text":
        return {
          type: "text",
          key: frame.prefix ? `${scope.def.id}/${layer.id}` : layer.id,
          layer,
          time: state.time,
          state: state.state ?? 0,
          reveal: state.reveal ?? 1,
          color: state.color!,
        };
      case "precomp":
        return state.precomp
          ? {
              type: "surface",
              surface: this.surface(
                state.precomp,
                this.precomp(layer.comp),
                `${frame.prefix}${layer.id}/`,
              ),
            }
          : null;
      default:
        return null;
    }
  }

  layerOps(
    scope: Scope,
    state: EvaluatedLayer,
    frame: Frame,
    options: {
      blend?: CompositionBlendMode;
      seen?: Set<string>;
      cull?: boolean;
    } = {},
  ): RenderOp[] {
    const key = frame.prefix + state.id,
      layer = state.layer;
    const matrix = multiplyMatrix(frame.matrix, state.screenMatrix);
    const transforms = this.transforms(scope, state, frame);
    const opacity = frame.opacity * state.opacity;
    const blend = options.blend ?? layer.blendMode ?? "normal";
    if (opacity <= 0) return [];
    if (
      options.cull !== false &&
      !(layer.type === "precomp" && layer.collapseTransforms) &&
      state.bounds &&
      boundsMiss(state.bounds, frame.matrix, frame)
    ) {
      this.culled.push(key);
      return [];
    }
    const clips = this.groupClips(scope, state, frame);
    const masks = this.masks(state, matrix, transforms);
    const seen = options.seen ?? new Set([layer.id]);
    const matte = this.matte(scope, state, frame, seen);
    if (layer.type === "adjustment") {
      if (blend === "normal" && !layer.effects?.length) return [];
      return [
        {
          kind: "adjust",
          layer: key,
          matrix,
          transforms,
          width: layer.size?.[0] ?? scope.tree.width,
          height: layer.size?.[1] ?? scope.tree.height,
          masks,
          matte,
          opacity,
          blend,
          clips,
        },
      ];
    }
    const isolated = blend !== "normal" || masks.length > 0 || matte !== null;
    let ops: RenderOp[];
    if (layer.type === "precomp" && layer.collapseTransforms) {
      // Collapsed layers keep their own blend modes and land in this surface.
      ops = state.precomp
        ? this.scopeOps(state.precomp, this.precomp(layer.comp), {
            matrix,
            transforms,
            opacity: isolated ? state.opacity : opacity,
            clips: isolated ? [] : clips,
            viewport: frame.viewport,
            prefix: `${key}/`,
          })
        : [];
      if (!isolated) return ops;
    } else {
      const content = this.content(scope, state, frame);
      if (!content) return [];
      ops = [
        {
          kind: "draw",
          layer: key,
          content,
          matrix,
          transforms,
          opacity: isolated ? 1 : opacity,
          blend: "normal",
          clips: isolated ? [] : clips,
        },
      ];
      if (!isolated) return ops;
    }
    return [
      {
        kind: "isolate",
        layer: key,
        ops,
        masks,
        matte,
        opacity:
          layer.type === "precomp" && layer.collapseTransforms
            ? frame.opacity
            : opacity,
        blend,
        clips,
      },
    ];
  }
}

/**
 * Build the per-frame render graph from an evaluated tree. Pure: no DOM access,
 * so Node tests and future backends share one description of the frame.
 */
export function buildRenderGraph(
  comp: Composition,
  tree: EvaluatedLayerTree,
): RenderGraph {
  const builder = new GraphBuilder(comp);
  return {
    root: builder.surface(tree, comp, ""),
    culled: builder.culled,
  };
}
