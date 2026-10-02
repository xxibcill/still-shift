import { sampleEffects, clampEffects, effectBounds } from "./effects.ts";
import {
  COMPOSITION_LIMITS,
  SIZED_LAYER_TYPES,
  type Composition,
  type CompositionLayer,
  type CompositionScope,
  type CompositionDriver,
  type PropertyPath,
  type Signal,
} from "@still-shift/scene-contract";
import { multiplyMatrix } from "../../node-transform.ts";
import { passageError } from "../../passage-diagnostics.ts";
import {
  blendValue,
  driverSamples,
  samplePeriodic,
} from "../../motion-sampling.ts";
import {
  compileComposition,
  layerKey,
  resolvedPath,
  type CompiledComposition,
} from "./compile.ts";
import { applyConstraints } from "./constraints.ts";
import { cameraMatrix, sampleCamera } from "./camera.ts";
import {
  identity,
  layerSize,
  localBounds,
  projectBounds,
  transformMatrix,
} from "./geometry.ts";
import { readProperty, writeProperty } from "./properties.ts";
import {
  color,
  discrete,
  motionScalar,
  path as samplePath,
  rgba,
  scalar,
  signal as sampleSignal,
  unit,
  vector,
} from "./sample.ts";
import type {
  EvaluatedLayer,
  EvaluatedLayerTree,
  EvaluationOptions,
  PropertyValue,
} from "./types.ts";

export const COMPOSITION_EVALUATOR_VERSION = "composition-evaluator-16";
const order = ["action", "response", "current", "carrier"] as const;
type Context = {
  scope: CompositionScope;
  time: number;
  fps: number;
  route: string[];
  states: Map<string, EvaluatedLayer>;
  active: Set<string>;
  activeClocks: Set<string>;
  clocks: Map<string, number>;
  children: Map<string, Context>;
  groupOpacity: Map<string, number>;
  groupVisible: Map<string, boolean>;
  soloLayers: Set<string> | null;
  matteLayers: Set<string>;
};

type Request = {
  evaluation: Evaluation;
  ctx: Context;
  layer: CompositionLayer;
  kind: "layer" | "clock";
};
type Task<T> = Generator<Request, T, unknown>;
type SignalCache = Map<Signal, Map<number, number>>;

function selectSoloLayers(scope: CompositionScope): Set<string> | null {
  if (!scope.layers.some((layer) => layer.solo)) return null;
  const layers = new Map(scope.layers.map((layer) => [layer.id, layer]));
  const mattes = new Set(
    scope.layers.flatMap((layer) =>
      layer.trackMatte ? [layer.trackMatte.layer] : [],
    ),
  );
  const selected = new Set<string>();
  for (const layer of scope.layers) {
    const groups: CompositionLayer[] = [];
    for (let id = layer.parent; id; ) {
      const parent = layers.get(id)!;
      if (parent.type === "group") groups.push(parent);
      id = parent.parent;
    }
    if (
      !layer.solo &&
      !groups.some((group) => group.solo || mattes.has(group.id))
    )
      continue;
    selected.add(layer.id);
    for (const group of groups) selected.add(group.id);
  }
  return selected;
}

function context(
  scope: CompositionScope,
  time: number,
  fps: number,
  route: string[] = [],
): Context {
  return {
    scope,
    time,
    fps,
    route,
    states: new Map(),
    active: new Set(),
    activeClocks: new Set(),
    clocks: new Map(),
    children: new Map(),
    groupOpacity: new Map(),
    groupVisible: new Map(),
    soloLayers: selectSoloLayers(scope),
    matteLayers: new Set(
      scope.layers.flatMap((l) => (l.trackMatte ? [l.trackMatte.layer] : [])),
    ),
  };
}

function localTime(layer: CompositionLayer, time: number) {
  const local = (time - (layer.startFrame ?? 0)) / (layer.stretch ?? 1);
  if (!Number.isFinite(local))
    passageError("comp-evaluation-time", "Layer time must be finite", {
      path: `${layer.id}.stretch`,
      frame: time,
    });
  return local;
}

function baseState(
  comp: Composition,
  ctx: Context,
  layer: CompositionLayer,
): EvaluatedLayer {
  const time = localTime(layer, ctx.time),
    fps = ctx.fps,
    t = layer.transform;
  const size = layerSize(comp, ctx.scope, layer);
  const anchor = vector(
    t?.anchor,
    time,
    fps,
    SIZED_LAYER_TYPES.has(layer.type) ? [size[0] / 2, size[1] / 2] : [0, 0],
  );
  const visible =
    ctx.time >= 0 &&
    ctx.time < ctx.scope.frameCount &&
    ctx.time >= (layer.inPoint ?? 0) &&
    ctx.time < (layer.outPoint ?? ctx.scope.frameCount) &&
    layer.enabled !== false &&
    (!ctx.soloLayers || ctx.soloLayers.has(layer.id));
  const state: EvaluatedLayer = {
    id: layer.id,
    layer,
    time,
    visible,
    drawable: false,
    transform: {
      anchor,
      position: vector(t?.position, time, fps, [0, 0]),
      scale: vector(t?.scale, time, fps, [1, 1]),
      rotation: scalar(t?.rotation, time, fps),
      skewX: scalar(t?.skewX, time, fps),
      skewY: scalar(t?.skewY, time, fps),
      opacity: unit(scalar(t?.opacity, time, fps, 1)),
    },
    constraintReference: vector(layer.constraintReference, time, fps, anchor),
    localMatrix: identity(),
    worldMatrix: identity(),
    screenMatrix: identity(),
    opacity: 1,
    bounds: null,
    effects: sampleEffects(layer, time, fps),
    masks: (layer.masks ?? []).map((m) => ({
      ...m,
      path: samplePath(m.path, time, fps),
      feather: scalar(m.feather, time, fps),
      expansion: scalar(m.expansion, time, fps),
      opacity: unit(scalar(m.opacity, time, fps, 1)),
    })),
  };
  if (layer.type === "solid" || layer.type === "text")
    state.color = color(layer.color, time, fps);
  if (
    layer.type === "image" ||
    layer.type === "text" ||
    layer.type === "provider"
  )
    state.state = layer.state === undefined ? 0 : discrete(layer.state, time);
  if (
    layer.type === "image" ||
    layer.type === "text" ||
    layer.type === "provider"
  ) {
    state.stateFrom =
      layer.stateFrom === undefined
        ? state.state!
        : discrete(layer.stateFrom, time, state.state!);
    state.stateMix =
      layer.stateMix === undefined
        ? 1
        : unit(scalar(layer.stateMix, time, fps, 1));
  }
  if (layer.type === "text") {
    state.text = layer.states?.[state.state!] ?? layer.text;
    state.reveal = unit(scalar(layer.reveal, time, fps, 1));
  }
  if (layer.type === "precomp") {
    const nested = comp.precomps!.find((p) => p.id === layer.comp)!;
    state.timeRemap =
      layer.timeRemap !== undefined
        ? scalar(layer.timeRemap, time, fps)
        : (time * (nested.fps ?? comp.fps)) / fps;
  }
  return state;
}

class Evaluation {
  readonly root: Context;
  private readonly history = new Map<number, Evaluation>();
  private count = 0;
  private readonly cameras = new Map<number, ReturnType<typeof cameraMatrix>>();
  constructor(
    readonly compiled: CompiledComposition,
    readonly time: number,
    readonly options: EvaluationOptions,
    private readonly signalCache: SignalCache = new Map(),
  ) {
    this.root = context(compiled.comp, time, compiled.comp.fps);
  }

  private bindings(ctx: Context, id: string) {
    return layerKey(ctx.route, id);
  }
  private layer(ctx: Context, id: string) {
    return this.compiled.layers.get(ctx.scope)!.get(id)!;
  }

  private camera(depth: number) {
    let matrix = this.cameras.get(depth);
    if (!matrix) {
      matrix = cameraMatrix(this.compiled.comp, this.time, depth);
      this.cameras.set(depth, matrix);
    }
    return matrix;
  }

  private run<T>(task: Task<T>): T {
    const stack: Task<unknown>[] = [task];
    let value: unknown;
    while (stack.length) {
      const step = stack.at(-1)!.next(value);
      value = undefined;
      if (step.done) {
        stack.pop();
        value = step.value;
        continue;
      }
      const { evaluation, ctx, layer, kind } = step.value;
      value =
        kind === "layer" ? ctx.states.get(layer.id) : ctx.clocks.get(layer.id);
      if (value === undefined)
        stack.push(
          kind === "layer"
            ? evaluation.layerTask(ctx, layer)
            : evaluation.clockTask(ctx, layer),
        );
    }
    return value as T;
  }

  private *layerState(
    ctx: Context,
    layer: CompositionLayer,
  ): Task<EvaluatedLayer> {
    return (yield {
      evaluation: this,
      ctx,
      layer,
      kind: "layer",
    }) as EvaluatedLayer;
  }

  private *clock(ctx: Context, layer: CompositionLayer): Task<number> {
    return (yield { evaluation: this, ctx, layer, kind: "clock" }) as number;
  }

  private at(time: number): Evaluation {
    if (time === this.time) return this;
    let evaluation = this.history.get(time);
    if (!evaluation) {
      if (this.history.size >= 128)
        this.history.delete(this.history.keys().next().value!);
      evaluation = new Evaluation(
        this.compiled,
        time,
        this.options,
        this.signalCache,
      );
      this.history.set(time, evaluation);
    }
    return evaluation;
  }

  private *child(ctx: Context, host: CompositionLayer): Task<Context> {
    const cached = ctx.children.get(host.id);
    if (cached) return cached;
    if (host.type !== "precomp")
      passageError("comp-path-scope", "Expected a precomp layer", {
        path: host.id,
      });
    const scope = this.compiled.scopes.get(host.comp)!;
    const sourceTime = yield* this.clock(ctx, host);
    const route = [...ctx.route, host.id];
    const next = context(
      scope,
      Math.max(
        0,
        Math.min(
          scope.frameCount - 1,
          this.options.scopeTimes?.[route.join("/")] ?? sourceTime,
        ),
      ),
      scope.fps ?? this.compiled.comp.fps,
      route,
    );
    ctx.children.set(host.id, next);
    return next;
  }

  private *clockTask(ctx: Context, host: CompositionLayer): Task<number> {
    const cached = ctx.clocks.get(host.id);
    if (cached !== undefined) return cached;
    if (ctx.activeClocks.has(host.id))
      passageError("comp-motion-cycle", "Precomp clock dependency cycle", {
        path: this.bindings(ctx, host.id) + ".timeRemap",
      });
    ctx.activeClocks.add(host.id);
    const state = baseState(this.compiled.comp, ctx, host);
    yield* this.motion(ctx, state, true);
    const time = state.timeRemap!;
    if (!Number.isFinite(time))
      passageError("comp-evaluation-time", "Precomp time must be finite", {
        path: `${host.id}.timeRemap`,
      });
    ctx.clocks.set(host.id, time);
    ctx.activeClocks.delete(host.id);
    return time;
  }

  private *scopeFor(path: PropertyPath): Task<Context> {
    let ctx = this.root;
    for (const id of path.scope)
      ctx = yield* this.child(ctx, this.layer(ctx, id));
    return ctx;
  }

  property(path: PropertyPath): PropertyValue {
    return this.run(this.propertyTask(path));
  }

  private *propertyTask(path: PropertyPath): Task<PropertyValue> {
    if (path.layer === "comp")
      return sampleCamera(this.compiled.comp, this.time)[
        path.segments[1]!.name as "x" | "y" | "zoom"
      ];
    const ctx = yield* this.scopeFor(path);
    const layer = this.layer(ctx, path.layer);
    // A clock can be read without asking for the enclosing layer's transform.
    if (layer.type === "precomp" && path.segments[0]!.name === "timeRemap")
      return yield* this.clock(ctx, layer);
    return readProperty(yield* this.layerState(ctx, layer), path.segments);
  }

  private *source(text: string, time: number): Task<number> {
    if (!text.includes(".")) return this.signalAt(text, time);
    return (yield* this.at(time).propertyTask(
      resolvedPath(this.compiled, text),
    )) as number;
  }

  private signalAt(id: string, time: number): number {
    const signal = this.compiled.signals.get(id)!;
    let samples = this.signalCache.get(signal);
    if (!samples) this.signalCache.set(signal, (samples = new Map()));
    const cached = samples.get(time);
    if (cached !== undefined) return cached;
    const value = sampleSignal(signal, time, this.compiled.comp.fps);
    if (samples.size >= 128) samples.delete(samples.keys().next().value!);
    samples.set(time, value);
    return value;
  }

  private *driverValue(motion: CompositionDriver): Task<number> {
    const samples = driverSamples(this.time, motion.map);
    let sample = samples.next();
    while (!sample.done) {
      let value = 0;
      for (const source of motion.sum ?? [motion.source ?? motion.signal!])
        value += yield* this.source(source, sample.value);
      sample = samples.next(value);
    }
    return sample.value;
  }

  private *motion(
    ctx: Context,
    state: EvaluatedLayer,
    remapOnly = false,
  ): Task<void> {
    const key = this.bindings(ctx, state.id),
      comp = this.compiled.comp;
    if (
      !state.masks.length &&
      !state.effects.length &&
      !this.compiled.periodic.has(key) &&
      !this.compiled.drivers.has(key)
    )
      return;
    const accepts = (path: PropertyPath) =>
      !remapOnly || path.segments[0]!.name === "timeRemap";
    for (const layer of order) {
      for (const { motion, path } of this.compiled.periodic.get(key) ?? []) {
        if (
          !accepts(path) ||
          (motion.layer ?? "carrier") !== layer ||
          this.time < motion.start ||
          this.time > motion.end
        )
          continue;
        const base = readProperty(state, path.segments) as number;
        const weight = motion.weight
          ? unit(motionScalar(motion.weight, this.time, comp.fps))
          : 1;
        writeProperty(
          state,
          path.segments,
          blendValue(
            base,
            samplePeriodic(motion, this.time - motion.start),
            motion.blend ?? "add",
            weight,
          ),
        );
      }
      for (const { motion, path } of this.compiled.drivers.get(key) ?? []) {
        if (!accepts(path) || (motion.layer ?? "action") !== layer) continue;
        const value = yield* this.driverValue(motion);
        const weight = motion.weight
          ? unit(motionScalar(motion.weight, this.time, comp.fps))
          : 1;
        const multiply =
          path.segments[0]!.name === "transform" &&
          ["scale", "opacity"].includes(path.segments[1]!.name);
        const blend =
          motion.blend ??
          (layer === "action"
            ? "replace"
            : layer === "response" && multiply
              ? "multiply"
              : "add");
        writeProperty(
          state,
          path.segments,
          blendValue(
            readProperty(state, path.segments) as number,
            value,
            blend,
            weight,
          ),
        );
      }
    }
    state.transform.opacity = unit(state.transform.opacity);
    clampEffects(state.effects);
    if (state.color) state.color = state.color.map(unit) as typeof state.color;
    if (state.reveal !== undefined) state.reveal = unit(state.reveal);
    if (state.stateMix !== undefined) state.stateMix = unit(state.stateMix);
    for (const mask of state.masks) {
      mask.opacity = unit(mask.opacity);
      mask.feather = Math.max(0, mask.feather);
    }
    if (state.layer.constraintReference === undefined) {
      const writers = [
        ...(this.compiled.drivers.get(key) ?? []),
        ...(this.compiled.periodic.get(key) ?? []).filter(
          ({ motion }) => this.time >= motion.start && this.time <= motion.end,
        ),
      ];
      for (const [axis, name] of ["x", "y"].entries())
        if (
          !writers.some(
            ({ path }) =>
              path.segments[0]!.name === "constraintReference" &&
              path.segments[1]?.name === name,
          )
        )
          state.constraintReference[axis] = state.transform.anchor[axis]!;
    }
  }

  evaluate(ctx: Context, layer: CompositionLayer): EvaluatedLayer {
    return this.run(this.layerTask(ctx, layer));
  }

  private *layerTask(
    ctx: Context,
    layer: CompositionLayer,
  ): Task<EvaluatedLayer> {
    const cached = ctx.states.get(layer.id);
    if (cached) return cached;
    if (ctx.active.has(layer.id))
      passageError("comp-motion-cycle", "Evaluation dependency cycle", {
        path: this.bindings(ctx, layer.id),
      });
    if (++this.count > 20_000)
      passageError(
        "comp-evaluation-limit",
        "Evaluation exceeds 20,000 layer instances",
        { path: "layers" },
      );
    ctx.active.add(layer.id);
    const state = baseState(this.compiled.comp, ctx, layer);
    yield* this.motion(ctx, state);
    if (layer.type === "precomp")
      state.timeRemap = yield* this.clock(ctx, layer);
    // Expressions are validated as unavailable until CE9; this stage is a no-op.
    const parent = layer.parent
      ? yield* this.layerState(ctx, this.layer(ctx, layer.parent))
      : undefined;
    const parentMatrix = parent?.worldMatrix ?? identity();
    for (const constraint of ctx.scope.constraints ?? []) {
      if (constraint.target !== layer.id) continue;
      const reference =
        "anchor" in constraint
          ? constraint.anchor
          : "surface" in constraint
            ? constraint.surface
            : "toward" in constraint
              ? constraint.toward
              : undefined;
      if (reference) yield* this.layerState(ctx, this.layer(ctx, reference));
    }
    applyConstraints(state, {
      comp: this.compiled.comp,
      scope: ctx.scope,
      time: ctx.time,
      fps: ctx.fps,
      options: this.options,
      parentMatrix,
      other: (id) => ctx.states.get(id)!,
    });
    state.localMatrix = transformMatrix(state.transform);
    state.worldMatrix = multiplyMatrix(parentMatrix, state.localMatrix);
    const inherited = parent
      ? (ctx.groupOpacity.get(parent.id) ?? 1) *
        (parent.layer.type === "group" ? parent.transform.opacity : 1)
      : 1;
    ctx.groupOpacity.set(layer.id, inherited);
    state.opacity = state.transform.opacity * inherited;
    let root = layer;
    while (root.parent) root = this.layer(ctx, root.parent);
    const camera =
      ctx.scope === this.compiled.comp && this.compiled.comp.camera2d
        ? this.camera(root.cameraDepth ?? 1)
        : identity();
    state.screenMatrix = multiplyMatrix(camera, state.worldMatrix);
    const local = localBounds(
      this.compiled.comp,
      ctx.scope,
      state,
      this.options,
    );
    state.bounds = local
      ? effectBounds(projectBounds(local, state.screenMatrix), state.effects)
      : null;
    state.visible &&= !layer.guide || this.options.includeGuides === true;
    // Group visibility gates descendants; ordinary null parenting only carries transforms.
    // A matte's enable/solo switches do not hide its alpha-producing children.
    const parentVisible =
      parent && ctx.matteLayers.has(parent.id)
        ? ctx.time >= (parent.layer.inPoint ?? 0) &&
          ctx.time < (parent.layer.outPoint ?? ctx.scope.frameCount)
        : parent?.visible;
    const groupVisible = parent
      ? (ctx.groupVisible.get(parent.id) ?? true) &&
        (parent.layer.type !== "group" || parentVisible === true)
      : true;
    ctx.groupVisible.set(layer.id, groupVisible);
    state.visible &&= groupVisible;
    state.drawable =
      state.visible &&
      !["null", "group"].includes(layer.type) &&
      !ctx.matteLayers.has(layer.id);
    ctx.active.delete(layer.id);
    ctx.states.set(layer.id, state);
    return state;
  }

  tree(ctx = this.root): EvaluatedLayerTree {
    const layers = ctx.scope.layers.map((layer) => this.evaluate(ctx, layer));
    const diagnostics: EvaluatedLayerTree["diagnostics"] = [];
    for (const state of layers) {
      if (state.layer.type === "text" && !state.bounds && state.visible)
        diagnostics.push({
          code: "comp-text-layout-missing",
          severity: "warning",
          message: "Supply measured text bounds for culling and diagnostics",
          node: state.id,
          path: this.bindings(ctx, state.id) + ".bounds",
          frame: ctx.time,
        });
      // Track mattes ignore `enabled` and solo, so matte precomps need content too.
      if (
        state.layer.type === "precomp" &&
        (state.visible || ctx.matteLayers.has(state.id))
      )
        state.precomp = this.tree(this.run(this.child(ctx, state.layer)));
    }
    return {
      id: ctx.scope.id,
      time: ctx.time,
      width: ctx.scope.width,
      height: ctx.scope.height,
      fps: ctx.fps,
      background:
        ctx.time >= 0 && ctx.time < ctx.scope.frameCount && ctx.scope.background
          ? rgba(ctx.scope.background)
          : null,
      layers,
      diagnostics,
    };
  }
}

function session(comp: Composition, time: number, options: EvaluationOptions) {
  if (
    [time, ...Object.values(options.scopeTimes ?? {})].some(
      (value) =>
        !Number.isFinite(value) ||
        Math.abs(value) > COMPOSITION_LIMITS.maxKeyFrame,
    )
  )
    passageError(
      "comp-evaluation-time",
      `Evaluation time must be finite and within ±${COMPOSITION_LIMITS.maxKeyFrame} frames`,
      { path: "time" },
    );
  return new Evaluation(compileComposition(comp), time, options);
}

/** Evaluate immutable, validated composition data at an integer or fractional frame. */
export function evaluateComp(
  comp: Composition,
  time: number,
  options: EvaluationOptions = {},
): EvaluatedLayerTree {
  return session(comp, time, options).tree();
}

export function evaluateProperty(
  comp: Composition,
  path: string,
  time: number,
  options: EvaluationOptions = {},
): PropertyValue {
  const evaluation = session(comp, time, options);
  return structuredClone(
    evaluation.property(resolvedPath(evaluation.compiled, path)),
  );
}
