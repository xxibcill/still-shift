import type { CompiledShapes } from "../shapes/types.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import type { EvaluatedEffect } from "../evaluate/effects.ts";
import { evaluateComp } from "../evaluate/evaluate.ts";
import type {
  BezierPath,
  Composition,
  CompositionBlendMode,
  CompositionLayer,
  CompositionScope,
  TrackMatte,
} from "@still-shift/scene-contract";
import { multiplyMatrix, type Matrix } from "../../node-transform.ts";
import type {
  Bounds,
  EvaluatedLayer,
  EvaluatedLayerTree,
  Rgba,
  EvaluationOptions,
} from "../evaluate/types.ts";
import { cameraMatrix } from "../evaluate/camera.ts";
import { projectBounds } from "../evaluate/geometry.ts";

export type RenderEffect = EvaluatedEffect & {
  placement?: { matrix: Matrix; transforms: Matrix[] };
  /** Input slots rendered independently at this scope and clock. */
  layerInputs?: Readonly<Record<string, RenderOp[]>>;
};

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
  stateFrom?: number;
  stateMix?: number;
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
  /** Authored source time for a provider with an explicit indexed sample clock. */
  sourceTime?: number;
  state?: number;
  stateFrom?: number;
  stateMix?: number;
};
export type ShapeContent = { type: "shape"; shapes: CompiledShapes };
export type LayerContent =
  | ShapeContent
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
  paintBlur?: number;
};
/** Render `ops` into a scope-sized surface, apply masks and matte, then composite. */
export type IsolateOp = {
  kind: "isolate";
  layer: string;
  ops: RenderOp[];
  effects: RenderEffect[];
  masks: MaskOp[];
  matte: MatteOp | null;
  opacity: number;
  blend: CompositionBlendMode;
  clips: ClipRect[];
};
/** Re-composite everything below within a layer-space region (adjustment layer). */
export type AdjustOp = {
  kind: "adjust";
  /** Oldest-first upstream backdrop snapshots, before the current input. */
  history?: BackdropSample[];
  layer: string;
  matrix: Matrix;
  transforms: Matrix[];
  width: number;
  height: number;
  effects: RenderEffect[];
  masks: MaskOp[];
  matte: MatteOp | null;
  opacity: number;
  blend: CompositionBlendMode;
  clips: ClipRect[];
};
export type BackdropSample = {
  ops: RenderOp[];
  background: Rgba | null;
  opacity: number;
};
type HistoryBudget = { captures: number; depth: number };

/** Find the destination prefix at an adjustment, respecting isolated surfaces. */
function backdropAt(
  node: SurfaceNode,
  key: string,
): Omit<BackdropSample, "opacity"> | undefined {
  const visit = (
    ops: RenderOp[],
    background: Rgba | null,
  ): Omit<BackdropSample, "opacity"> | undefined => {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      if (op.kind === "adjust" && op.layer === key)
        return { ops: ops.slice(0, i), background };
      const nested =
        op.kind === "isolate"
          ? visit(op.ops, null)
          : op.kind === "draw" && op.content.type === "surface"
            ? backdropAt(op.content.surface, key)
            : undefined;
      if (nested) return nested;
    }
    return undefined;
  };
  return visit(node.ops, node.background);
}

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
  colorSpace?: "srgb" | "linear-srgb";
  background: Rgba | null;
  ops: RenderOp[];
};

export type RenderGraph = {
  root: SurfaceNode;
  /** Layer keys skipped because their bounds miss the surface they draw into. */
  culled: string[];
};
export type RenderGraphOptions = EvaluationOptions & {
  /** Preparation must discover offscreen glyph samples before final bounds exist. */
  cull?: boolean;
};

type Frame = {
  matrix: Matrix;
  transforms: Matrix[];
  opacity: number;
  clips: ClipRect[];
  viewport: { width: number; height: number };
  /** Key prefix for layers of this scope (`""` at the root). */
  prefix: string;
  /** An ancestor effect may pull offscreen content into view. */
  cull?: boolean;
  paintBlur?: number;
  sourceGroup?: string;
};
type Scope = {
  tree: EvaluatedLayerTree;
  def: CompositionScope;
  byId: Map<string, EvaluatedLayer>;
  matteSources: Set<string>;
  containers: Set<string>;
  /** Nearest group whose children must paint together, rather than in the outer scope. */
  owners: Map<string, string>;
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function boundsMiss(bounds: Bounds, matrix: Matrix, frame: Frame) {
  const projected =
    matrix === IDENTITY ? bounds : projectBounds(bounds, matrix);
  return (
    projected.right <= 0 ||
    projected.bottom <= 0 ||
    projected.left >= frame.viewport.width ||
    projected.top >= frame.viewport.height
  );
}

class GraphBuilder {
  readonly culled: string[] = [];
  private readonly cameras = new Map<string, Matrix>();
  private readonly history = new Map<string, Scope>();
  private readonly exposures = new WeakMap<EvaluatedLayerTree, Scope>();
  private reachedHistoryTarget = false;
  private readonly historyBudget: HistoryBudget;
  constructor(
    readonly comp: Composition,
    readonly time: number,
    readonly options: RenderGraphOptions,
    readonly historical = false,
    readonly historyTarget?: string,
    budget?: HistoryBudget,
  ) {
    this.historyBudget = budget ?? { captures: 0, depth: 0 };
  }

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
      ...(this.comp.colorSpace ? { colorSpace: this.comp.colorSpace } : {}),
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
        ...(this.options.cull === false ? { cull: false } : {}),
      }),
    };
  }

  scopeOps(
    tree: EvaluatedLayerTree,
    def: CompositionScope,
    frame: Frame,
  ): RenderOp[] {
    return this.scopeLayers(this.scope(tree, def), frame);
  }

  private scope(
    tree: EvaluatedLayerTree,
    def: CompositionScope,
    sourceGroup?: string,
  ): Scope {
    const scope: Scope = {
      tree,
      def,
      byId: new Map(tree.layers.map((s) => [s.id, s])),
      matteSources: new Set(
        def.layers.flatMap((layer) =>
          layer.trackMatte ? [layer.trackMatte.layer] : [],
        ),
      ),
      owners: new Map(),
      containers: new Set(),
    };
    const containers = (scope.containers = new Set(
      def.layers
        .filter(
          (layer) =>
            layer.type === "group" &&
            (layer.id === sourceGroup ||
              scope.matteSources.has(layer.id) ||
              layer.trackMatte ||
              layer.masks?.length ||
              layer.effects?.length ||
              (layer.blendMode && layer.blendMode !== "normal")),
        )
        .map((layer) => layer.id),
    ));
    if (containers.size)
      for (const layer of def.layers) {
        for (
          let parent = layer.parent;
          parent;
          parent = scope.byId.get(parent)!.layer.parent
        ) {
          if (containers.has(parent)) {
            scope.owners.set(layer.id, parent);
            break;
          }
        }
      }
    return scope;
  }

  private inputWork = 0;
  private inputDepth = 0;
  private sourceVisible(
    scope: Scope,
    state: EvaluatedLayer,
    root: string,
  ): boolean {
    const time = scope.tree.time;
    for (
      let current: EvaluatedLayer | undefined = state;
      current;
      current = current.layer.parent
        ? scope.byId.get(current.layer.parent)
        : undefined
    ) {
      const layer = current.layer;
      if (
        time < (layer.inPoint ?? 0) ||
        time >= (layer.outPoint ?? scope.def.frameCount)
      )
        return false;
      if (current.id === root) return time >= 0 && time < scope.def.frameCount;
      if (
        layer.enabled === false ||
        (layer.guide && !this.options.includeGuides)
      )
        return false;
    }
    return false;
  }
  private effectInputs(
    scope: Scope,
    effect: EvaluatedEffect,
    frame: Frame,
    seen: Set<string>,
  ): RenderEffect {
    if (!effect.inputs || !Object.keys(effect.inputs).length) return effect;
    const layerInputs: Record<string, RenderOp[]> = {};
    for (const [slot, id] of Object.entries(effect.inputs)) {
      if (++this.inputWork > 10000)
        throw Error(
          "comp-effect-budget: layer input graph exceeds 10000 source visits",
        );
      if (seen.has(id))
        throw Error("comp-effect-cycle: recursive scoped layer input");
      let sourceScope = scope;
      const source = scope.byId.get(id);
      if (!source)
        throw Error(`comp-effect-layer: no input layer "${id}" in this scope`);
      if (this.inputDepth >= 64)
        throw Error("comp-effect-budget: input dependency depth exceeds 64");
      const time = scope.tree.time;
      if (
        time < 0 ||
        time >= scope.def.frameCount ||
        time < (source.layer.inPoint ?? 0) ||
        time >= (source.layer.outPoint ?? scope.def.frameCount)
      ) {
        layerInputs[slot] = [];
        continue;
      }
      if (source.layer.type === "group")
        sourceScope = this.scope(scope.tree, scope.def, id);
      this.inputDepth++;
      try {
        layerInputs[slot] = this.layerOps(
          sourceScope,
          source,
          {
            ...frame,
            opacity: 1,
            cull: false,
            ...(source.layer.type === "group" ? { sourceGroup: id } : {}),
          },
          { blend: "normal", cull: false, seen: new Set([...seen, id]) },
        );
      } finally {
        this.inputDepth--;
      }
    }
    return { ...effect, layerInputs };
  }
  private scopeLayers(scope: Scope, frame: Frame, owner?: string): RenderOp[] {
    const ops: RenderOp[] = [];
    // layers[0] is the top layer, so paint from the end of the list.
    for (let i = scope.tree.layers.length - 1; i >= 0; i--) {
      if (this.reachedHistoryTarget) break;
      const state = scope.tree.layers[i]!;
      if (scope.owners.get(state.id) !== owner) continue;
      if (
        (frame.sourceGroup
          ? this.sourceVisible(scope, state, frame.sourceGroup) &&
            !["null", "group"].includes(state.layer.type) &&
            !scope.matteSources.has(state.id)
          : state.drawable) ||
        ((frame.sourceGroup
          ? this.sourceVisible(scope, state, frame.sourceGroup)
          : state.visible) &&
          scope.containers.has(state.id) &&
          !scope.matteSources.has(state.id))
      )
        ops.push(...this.layerOps(scope, state, frame));
    }
    return ops;
  }

  private exposureScope(scope: Scope, state: EvaluatedLayer): Scope {
    const tree = state.exposure?.tree;
    if (!tree) return scope;
    let sample = this.exposures.get(tree);
    if (!sample) {
      sample = this.scope(tree, scope.def);
      this.exposures.set(tree, sample);
    }
    return sample;
  }

  private groupClips(scope: Scope, state: EvaluatedLayer, frame: Frame) {
    scope = this.exposureScope(scope, state);
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
    scope = this.exposureScope(scope, state);
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
        ? [this.camera(scope.tree.time, root.layer.cameraDepth ?? 1)]
        : []),
      ...local,
    ];
  }

  private camera(time: number, depth: number): Matrix {
    const key = `${time}:${depth}`;
    let matrix = this.cameras.get(key);
    if (!matrix) {
      matrix = cameraMatrix(this.comp, time, depth);
      this.cameras.set(key, matrix);
    }
    return matrix;
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
    const t = source.exposure?.tree.time ?? scope.tree.time,
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
      case "shape":
        return state.shapes?.draws.length
          ? { type: "shape", shapes: state.shapes }
          : null;
      case "provider":
        return {
          type: "provider",
          key: frame.prefix ? `${scope.def.id}/${layer.id}` : layer.id,
          layer,
          time: state.sampleIndex ?? state.time,
          ...(state.sampleIndex === undefined
            ? {}
            : { sourceTime: state.time }),
          ...(layer.state !== undefined || layer.stateFrom !== undefined
            ? { state: state.state! }
            : {}),
          ...(layer.stateFrom !== undefined || state.stateMix !== 1
            ? { stateFrom: state.stateFrom!, stateMix: state.stateMix! }
            : {}),
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
          ...(layer.stateFrom !== undefined || state.stateMix !== 1
            ? { stateFrom: state.stateFrom!, stateMix: state.stateMix! }
            : {}),
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

  /** A positive paint blur overrides inherited group blur; zero retains it. */
  private paintBlur(scope: Scope, state: EvaluatedLayer, frame: Frame): number {
    scope = this.exposureScope(scope, state);
    for (
      let current: EvaluatedLayer | undefined = state;
      current;
      current = current.layer.parent
        ? scope.byId.get(current.layer.parent)
        : undefined
    ) {
      if (current !== state && current.layer.type !== "group") continue;
      const blur = current.effects.find(
        (effect) => effect.enabled && effect.effect === "blur.primitive",
      );
      if (blur && (blur.params.radius as number) > 0)
        return blur.params.radius as number;
    }
    return frame.paintBlur ?? 0;
  }

  /** Historical input is painted before current input and this frame's pixel stack/matte. */
  private echoOps(
    scope: Scope,
    state: EvaluatedLayer,
    frame: Frame,
    echo: EvaluatedEffect,
  ): RenderOp[] {
    const { count, spacing, decay, skipUnchanged, sourceRevision } =
      echo.params as Record<string, number>;
    if (!decay) return [];
    const ops: RenderOp[] = [];
    const rootTime = state.exposure?.rootTime ?? this.time;
    const scopeTime = state.exposure?.tree.time ?? scope.tree.time;
    const builder = new GraphBuilder(this.comp, rootTime, this.options, true);
    const route = frame.prefix.split("/").filter(Boolean);
    for (let i = count!; i >= 1; i--) {
      const time = Math.max(0, scopeTime - i * spacing!);
      const key = `${frame.prefix}:${rootTime}:${time}`;
      let sample = this.history.get(key);
      if (!sample) {
        let tree = evaluateComp(this.comp, route.length ? rootTime : time, {
          ...this.options,
          ...(route.length
            ? {
                scopeTimes: {
                  ...this.options.scopeTimes,
                  [route.join("/")]: time,
                },
              }
            : {}),
        });
        for (const id of route) {
          const nested = tree.layers.find((layer) => layer.id === id)?.precomp;
          if (!nested) return ops;
          tree = nested;
        }
        sample = this.scope(tree, scope.def);
        if (this.history.size >= 16)
          this.history.delete(this.history.keys().next().value!);
        this.history.set(key, sample);
      }
      const prior = sample.byId.get(state.id)!;
      if (
        (!prior.visible && !sample.matteSources.has(state.id)) ||
        time < (prior.layer.inPoint ?? 0) ||
        time >= (prior.layer.outPoint ?? scope.def.frameCount) ||
        (skipUnchanged &&
          prior.effects.find((effect) => effect.id === echo.id)?.params
            .sourceRevision === sourceRevision)
      )
        continue;
      ops.push(
        ...builder.layerOps(
          sample,
          prior,
          { ...frame, opacity: frame.opacity * decay! ** i, cull: false },
          { raw: true, blend: "normal", cull: false },
        ),
      );
    }
    return ops;
  }

  private adjustmentHistory(
    scope: Scope,
    state: EvaluatedLayer,
    frame: Frame,
    echo: EvaluatedEffect,
  ): BackdropSample[] {
    const { count, spacing, decay, skipUnchanged, sourceRevision } =
      echo.params as Record<string, number>;
    if (!decay) return [];
    const rootTime = state.exposure?.rootTime ?? this.time;
    const scopeTime = state.exposure?.tree.time ?? scope.tree.time;
    const route = frame.prefix.split("/").filter(Boolean);
    const key = frame.prefix + state.id;
    const samples: BackdropSample[] = [];
    for (let i = count!; i >= 1; i--) {
      if (++this.historyBudget.captures > 256 || this.historyBudget.depth >= 16)
        throw Error(
          "comp-effect-budget: adjustment history exceeds 256 captures or 16 replay levels",
        );
      const time = Math.max(0, scopeTime - i * spacing!);
      const root = evaluateComp(this.comp, route.length ? rootTime : time, {
        ...this.options,
        ...(route.length
          ? {
              scopeTimes: {
                ...this.options.scopeTimes,
                [route.join("/")]: time,
              },
            }
          : {}),
      });
      let local = root;
      for (const id of route) {
        const next = local.layers.find((layer) => layer.id === id)?.precomp;
        if (!next) return samples;
        local = next;
      }
      const prior = local.layers.find((layer) => layer.id === state.id);
      if (
        !prior?.visible ||
        (skipUnchanged &&
          prior.effects.find((effect) => effect.id === echo.id)?.params
            .sourceRevision === sourceRevision)
      )
        continue;
      this.historyBudget.depth++;
      try {
        const builder = new GraphBuilder(
          this.comp,
          root.time,
          this.options,
          false,
          key,
          this.historyBudget,
        );
        const backdrop = backdropAt(builder.surface(root, this.comp, ""), key);
        if (backdrop) samples.push({ ...backdrop, opacity: decay! ** i });
      } finally {
        this.historyBudget.depth--;
      }
    }
    return samples;
  }

  layerOps(
    scope: Scope,
    state: EvaluatedLayer,
    frame: Frame,
    options: {
      blend?: CompositionBlendMode;
      seen?: Set<string>;
      cull?: boolean;
      raw?: boolean;
    } = {},
  ): RenderOp[] {
    const key = frame.prefix + state.id,
      layer = state.layer;
    const paintBlur = this.paintBlur(scope, state, frame);
    const matrix = multiplyMatrix(frame.matrix, state.screenMatrix);
    const transforms = this.transforms(scope, state, frame);
    const opacity = frame.opacity * state.opacity;
    const blend = options.blend ?? layer.blendMode ?? "normal";
    if (opacity <= 0) return [];
    if (
      options.cull !== false &&
      frame.cull !== false &&
      !paintBlur &&
      layer.type !== "group" &&
      !(layer.type === "precomp" && layer.collapseTransforms) &&
      state.bounds &&
      boundsMiss(state.bounds, frame.matrix, frame)
    ) {
      this.culled.push(key);
      return [];
    }
    const clips = this.groupClips(scope, state, frame);
    const masks = options.raw ? [] : this.masks(state, matrix, transforms);
    const echo =
      !options.raw && !this.historical
        ? state.effects.find(
            (effect) => effect.enabled && effect.effect === "time.echo",
          )
        : undefined;
    const seen = options.seen ?? new Set([layer.id]);
    const effects: RenderEffect[] = (options.raw ? [] : state.effects)
      .filter(
        (effect) =>
          effect.enabled &&
          effect.effect !== "time.echo" &&
          (layer.type === "adjustment" || effect.effect !== "blur.primitive"),
      )
      .map((original) => {
        if (layer.type === "adjustment" && original.effect === "blur.primitive")
          original = {
            ...original,
            effect: "blur.gaussian",
            version: compositionEffectDefinition("blur.gaussian")!.version,
          };
        const effect = this.effectInputs(
          this.exposureScope(scope, state),
          original,
          frame,
          seen,
        );
        if (!compositionEffectDefinition(effect.effect)!.usesLayerSpace)
          return effect;
        const source = effect.space ? scope.byId.get(effect.space)! : state;
        return {
          ...effect,
          placement: {
            matrix: multiplyMatrix(frame.matrix, source.screenMatrix),
            transforms: this.transforms(scope, source, frame),
          },
        };
      });
    const matte = options.raw ? null : this.matte(scope, state, frame, seen);
    if (echo && layer.type !== "adjustment") {
      return [
        {
          kind: "isolate",
          layer: key,
          ops: [
            ...this.echoOps(scope, state, frame, echo),
            ...this.layerOps(scope, state, frame, {
              ...options,
              raw: true,
              blend: "normal",
              cull: false,
            }),
          ],
          effects,
          masks,
          matte,
          opacity: 1,
          blend,
          clips: [],
        },
      ];
    }
    if (layer.type === "adjustment") {
      const target = key === this.historyTarget;
      if (target) this.reachedHistoryTarget = true;
      const history =
        echo && !target
          ? this.adjustmentHistory(scope, state, frame, echo)
          : [];
      if (!target && blend === "normal" && !effects.length && !history.length)
        return [];
      return [
        {
          kind: "adjust",
          ...(history.length ? { history } : {}),
          layer: key,
          matrix,
          transforms,
          width: layer.size?.[0] ?? scope.tree.width,
          height: layer.size?.[1] ?? scope.tree.height,
          effects,
          masks,
          matte,
          opacity,
          blend,
          clips,
        },
      ];
    }
    const isolated =
      blend !== "normal" ||
      masks.length > 0 ||
      matte !== null ||
      effects.length > 0;
    let ops: RenderOp[];
    if (layer.type === "group") {
      // Group opacity is already inherited by each child, including overlapping ones.
      ops = this.scopeLayers(
        scope,
        effects.length ? { ...frame, cull: false } : frame,
        layer.id,
      );
      if (!isolated) return ops;
      return [
        {
          kind: "isolate",
          layer: key,
          ops,
          effects,
          masks,
          matte,
          opacity: 1,
          blend,
          clips: [],
        },
      ];
    } else if (layer.type === "precomp" && layer.collapseTransforms) {
      // Collapsed layers keep their own blend modes and land in this surface.
      ops = state.precomp
        ? this.scopeOps(state.precomp, this.precomp(layer.comp), {
            matrix,
            transforms,
            opacity: isolated ? state.opacity : opacity,
            clips: isolated ? [] : clips,
            viewport: frame.viewport,
            prefix: `${key}/`,
            ...(paintBlur ? { paintBlur } : {}),
            ...(effects.length || frame.cull === false ? { cull: false } : {}),
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
          ...(paintBlur ? { paintBlur } : {}),
        },
      ];
      if (!isolated) return ops;
    }
    return [
      {
        kind: "isolate",
        layer: key,
        ops,
        effects,
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
  options: RenderGraphOptions = {},
): RenderGraph {
  const builder = new GraphBuilder(comp, tree.time, options);
  return {
    root: builder.surface(tree, comp, ""),
    culled: builder.culled,
  };
}
