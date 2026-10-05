import { ShapeGeometryBudget } from "../shapes/budget.ts";
import { sampleShapes, clampShapes, cloneShapes } from "../shapes/sample.ts";
import { compileShapes } from "../shapes/compile.ts";
import {
  sampleEffects,
  clampEffects,
  effectBounds,
  validateEffectParameters,
} from "./effects.ts";
import {
  COMPOSITION_LIMITS,
  SIZED_LAYER_TYPES,
  type Composition,
  type CompositionLayer,
  type CompositionScope,
  type CompositionDriver,
  type ExpressionAst,
  type LoopMode,
  type PropertyPath,
  type PropertyPathSegment,
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
  type ExpressionBinding,
} from "./compile.ts";
import {
  angleOf,
  easeProgress,
  lerp,
  map,
  noise,
  random,
  secondsToFrames,
  springStep,
  squash,
  vectorLength,
  wiggleOffset,
  zip,
  type EaseKind,
  type ExpressionValue,
} from "./expression-math.ts";
import {
  anticipate,
  inertia,
  loop,
  ownCurve,
  rove,
  type OwnCurve,
} from "./expression-keys.ts";
import { applyConstraints } from "./constraints.ts";
import { cameraMatrix, sampleCamera } from "./camera.ts";
import { compositionSampleIndex } from "./sample-clock.ts";
import {
  layerContentTime,
  loopedPrecompTime,
  scopeTimeOverride,
} from "./time-controls.ts";
import {
  identity,
  layerSize,
  localBounds,
  projectBounds,
  transformMatrix,
} from "./geometry.ts";
import { readProperty, writeProperty, writeValue } from "./properties.ts";
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

export const COMPOSITION_EVALUATOR_VERSION = "composition-evaluator-42";
export const AUTO_ORIENT_LOOKAROUND_FRAMES = 64;
const order = ["action", "response", "current", "carrier"] as const;
/** Keyed and motion-craft values of one layer, before constraints (CE9 expression stage). */
type Stage = {
  state: EvaluatedLayer;
  /** Pre-expression value per applied expression key (`value`); created on first use. */
  pre?: Map<string, Numeric>;
  applied?: Set<string>;
  active?: Set<string>;
  /** Expression-stage copy taken before constraints mutate the state. */
  sealed?: EvaluatedLayer;
  /** Constraints ran without a seal because nothing reads stages. */
  constrained?: boolean;
};
type Context = {
  scope: CompositionScope;
  time: number;
  fps: number;
  route: string[];
  states: Map<string, EvaluatedLayer>;
  stages: Map<string, Stage>;
  stageActive: Set<string>;
  active: Set<string>;
  activeClocks: Set<string>;
  clocks: Map<string, number>;
  children: Map<string, Context>;
  groupOpacity: Map<string, number>;
  groupVisible: Map<string, boolean>;
  soloLayers: Set<string> | null;
  matteLayers: Set<string>;
};

/** A dependency the explicit evaluation stack resolves without JS recursion. */
type Request = {
  evaluation: Evaluation;
  ctx: Context;
  layer: CompositionLayer;
  kind: "layer" | "clock" | "stage" | "expression";
  binding?: ExpressionBinding;
};
type Task<T> = Generator<Request, T, unknown>;
type SignalCache = Map<Signal, Map<number, number>>;
type Session = {
  history: Map<number, Evaluation>;
  signals: SignalCache;
  shapes: ShapeGeometryBudget;
  /** Work bound shared by every time-shifted evaluation in one call. */
  steps: number;
};
type ExpressionEnv = {
  ctx: Context;
  layer: CompositionLayer;
  binding: ExpressionBinding;
  state: EvaluatedLayer;
  value: Numeric;
  curve?: OwnCurve | null;
};

const MAX_SESSION_STEPS = 4_000_000;
const COMPONENT: Record<string, number> = {
  x: 0,
  y: 1,
  z: 2,
  r: 0,
  g: 1,
  b: 2,
  a: 3,
};
/** Expression reads and results; bezier paths are never read by expressions. */
type Numeric = number | number[];
/** An expression-stage value with its layer time and key time (sample index if baked). */
export type StageSample = { value: Numeric; time: number; keyTime: number };
const copy = (value: PropertyValue | Numeric): Numeric =>
  Array.isArray(value) ? [...(value as number[])] : (value as Numeric);

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
  compiled: CompiledComposition,
  scope: CompositionScope,
  time: number,
  fps: number,
  route: string[] = [],
): Context {
  let soloLayers = compiled.solo.get(scope);
  if (soloLayers === undefined)
    compiled.solo.set(scope, (soloLayers = selectSoloLayers(scope)));
  let matteLayers = compiled.mattes.get(scope);
  if (!matteLayers)
    compiled.mattes.set(
      scope,
      (matteLayers = new Set(
        scope.layers.flatMap((l) => (l.trackMatte ? [l.trackMatte.layer] : [])),
      )),
    );
  return {
    scope,
    time,
    fps,
    route,
    states: new Map(),
    stages: new Map(),
    stageActive: new Set(),
    active: new Set(),
    activeClocks: new Set(),
    clocks: new Map(),
    children: new Map(),
    groupOpacity: new Map(),
    groupVisible: new Map(),
    soloLayers,
    matteLayers,
  };
}

function baseState(
  comp: Composition,
  ctx: Context,
  layer: CompositionLayer,
  budget: ShapeGeometryBudget,
): EvaluatedLayer {
  const sourceTime = layerContentTime(layer, ctx.time, ctx.fps),
    sampleIndex = layer.sampleTimes
      ? compositionSampleIndex(layer.sampleTimes, sourceTime)
      : undefined,
    time = sampleIndex ?? sourceTime,
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
    time:
      sampleIndex === undefined ? sourceTime : layer.sampleTimes![sampleIndex]!,
    ...(sampleIndex === undefined ? {} : { sampleIndex }),
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
    effects: sampleEffects(layer, sourceTime, fps, time),
    masks: (layer.masks ?? []).map((m) => ({
      ...m,
      path: samplePath(m.path, time, fps),
      feather: scalar(m.feather, time, fps),
      expansion: scalar(m.expansion, time, fps),
      opacity: unit(scalar(m.opacity, time, fps, 1)),
    })),
  };
  if (layer.type === "shape")
    state.contents = sampleShapes(layer.contents, time, fps, budget);
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
        : (state.time * (nested.fps ?? comp.fps)) / fps;
  }
  return state;
}

class Evaluation {
  readonly root: Context;
  private count = 0;
  private readonly cameras = new Map<number, ReturnType<typeof cameraMatrix>>();
  constructor(
    readonly compiled: CompiledComposition,
    readonly time: number,
    readonly options: EvaluationOptions,
    private readonly session: Session = {
      history: new Map(),
      signals: new Map(),
      shapes: new ShapeGeometryBudget({ frame: time }),
      steps: 0,
    },
  ) {
    this.root = context(compiled, compiled.comp, time, compiled.comp.fps);
  }

  private shapeBudget(ctx: Context, layer: CompositionLayer) {
    if (!this.compiled.shapeWork) return this.session.shapes;
    return this.session.shapes.located({
      node: layer.id,
      path: this.bindings(ctx, layer.id),
    });
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
      const { evaluation, ctx, layer, kind, binding } = step.value;
      value =
        kind === "layer"
          ? ctx.states.get(layer.id)
          : kind === "clock"
            ? ctx.clocks.get(layer.id)
            : kind === "stage"
              ? ctx.stages.get(layer.id)
              : ctx.stages.get(layer.id)?.applied?.has(binding!.key) ||
                undefined;
      if (value === undefined) {
        if (++this.session.steps > MAX_SESSION_STEPS)
          passageError(
            "comp-evaluation-limit",
            `Evaluation exceeds ${MAX_SESSION_STEPS.toLocaleString("en-US")} dependency steps`,
            { path: "expressions", frame: this.time },
          );
        stack.push(
          kind === "layer"
            ? evaluation.layerTask(ctx, layer)
            : kind === "clock"
              ? evaluation.clockTask(ctx, layer)
              : kind === "stage"
                ? evaluation.stageTask(ctx, layer)
                : evaluation.expressionTask(ctx, layer, binding!),
        );
      }
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

  private *stage(ctx: Context, layer: CompositionLayer): Task<Stage> {
    return (yield { evaluation: this, ctx, layer, kind: "stage" }) as Stage;
  }

  private *applied(
    ctx: Context,
    layer: CompositionLayer,
    binding: ExpressionBinding,
  ): Task<void> {
    yield { evaluation: this, ctx, layer, kind: "expression", binding };
  }

  private at(time: number): Evaluation {
    if (time === this.time) return this;
    const history = this.session.history;
    let evaluation = history.get(time);
    if (!evaluation) {
      if (history.size >= 1024) history.delete(history.keys().next().value!);
      evaluation = new Evaluation(
        this.compiled,
        time,
        this.options,
        this.session,
      );
      history.set(time, evaluation);
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
    const remappedTime = yield* this.clock(ctx, host);
    const sourceTime = loopedPrecompTime(remappedTime, scope.frameCount, host, {
      node: host.id,
      path: `${this.bindings(ctx, host.id)}.loop`,
      frame: this.time,
    });
    const route = [...ctx.route, host.id];
    const next = context(
      this.compiled,
      scope,
      Math.max(
        0,
        Math.min(
          scope.frameCount - 1,
          scopeTimeOverride(this.options.scopeTimes, route.join("/")) ??
            sourceTime,
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
    const state = yield* this.clockBase(ctx, host);
    const binding = this.compiled.expressions
      .get(this.bindings(ctx, host.id))
      ?.find((candidate) => candidate.clock);
    if (binding)
      state.timeRemap = (yield* this.expressionValue({
        ctx,
        layer: host,
        binding,
        state,
        value: state.timeRemap!,
      })) as number;
    const time = state.timeRemap!;
    if (!Number.isFinite(time))
      passageError("comp-evaluation-time", "Precomp time must be finite", {
        path: `${host.id}.timeRemap`,
      });
    ctx.clocks.set(host.id, time);
    ctx.activeClocks.delete(host.id);
    return time;
  }

  /** A precomp clock's keyed and driven remap value, before its expression. */
  private *clockBase(
    ctx: Context,
    host: CompositionLayer,
  ): Task<EvaluatedLayer> {
    const state = baseState(
      this.compiled.comp,
      ctx,
      host,
      this.shapeBudget(ctx, host),
    );
    yield* this.motion(ctx, state, true);
    return state;
  }

  private *scopeFor(path: Pick<PropertyPath, "scope">): Task<Context> {
    let ctx = this.root;
    for (const id of path.scope)
      ctx = yield* this.child(ctx, this.layer(ctx, id));
    return ctx;
  }

  property(path: PropertyPath): PropertyValue {
    return this.run(this.propertyTask(path));
  }

  /** Expression-stage value of a property: keys, motion craft and expressions. */
  stageProperty(path: PropertyPath): StageSample {
    return this.run(this.stagePropertyTask(path));
  }

  private *stagePropertyTask(path: PropertyPath): Task<StageSample> {
    const ctx = yield* this.scopeFor(path);
    const layer = this.layer(ctx, path.layer);
    const value = yield* this.readStage(ctx, layer, path.segments);
    const { state } = yield* this.stage(ctx, layer);
    return {
      value,
      time: state.time,
      keyTime: state.sampleIndex ?? state.time,
    };
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
    let samples = this.session.signals.get(signal);
    if (!samples) this.session.signals.set(signal, (samples = new Map()));
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

  /** Whether drivers, active periodic motion or expressions write constraintReference.axis. */
  private writesReference(ctx: Context, state: EvaluatedLayer) {
    const key = this.bindings(ctx, state.id);
    const written = [false, false];
    const mark = ({ path }: { path: PropertyPath }) => {
      if (path.segments[0]!.name !== "constraintReference") return;
      const axis = path.segments[1]?.name;
      if (axis !== "y") written[0] = true;
      if (axis !== "x") written[1] = true;
    };
    this.compiled.drivers.get(key)?.forEach(mark);
    this.compiled.periodic
      .get(key)
      ?.forEach(
        (binding) =>
          this.time >= binding.motion.start &&
          this.time <= binding.motion.end &&
          mark(binding),
      );
    this.compiled.expressions.get(key)?.forEach(mark);
    return written;
  }

  /** Clamp written values and keep an unauthored constraint reference on the anchor. */
  private normalize(ctx: Context, state: EvaluatedLayer) {
    state.transform.opacity = unit(state.transform.opacity);
    clampEffects(state.effects);
    if (state.contents)
      clampShapes(state.contents, this.shapeBudget(ctx, state.layer));
    if (state.color) state.color = state.color.map(unit) as typeof state.color;
    if (state.reveal !== undefined) state.reveal = unit(state.reveal);
    if (state.stateMix !== undefined) state.stateMix = unit(state.stateMix);
    for (const mask of state.masks) {
      mask.opacity = unit(mask.opacity);
      mask.feather = Math.max(0, mask.feather);
    }
    if (state.layer.constraintReference === undefined) {
      const written = this.writesReference(ctx, state);
      for (const axis of [0, 1])
        if (!written[axis])
          state.constraintReference[axis] = state.transform.anchor[axis]!;
    }
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
    this.normalize(ctx, state);
  }

  private *stageTask(ctx: Context, layer: CompositionLayer): Task<Stage> {
    const cached = ctx.stages.get(layer.id);
    if (cached) return cached;
    if (ctx.stageActive.has(layer.id))
      passageError(
        "comp-expression-cycle",
        "Expression stage dependency cycle",
        {
          path: this.bindings(ctx, layer.id),
          frame: this.time,
        },
      );
    ctx.stageActive.add(layer.id);
    const state = baseState(
      this.compiled.comp,
      ctx,
      layer,
      this.shapeBudget(ctx, layer),
    );
    yield* this.motion(ctx, state);
    const stage: Stage = { state };
    ctx.stageActive.delete(layer.id);
    ctx.stages.set(layer.id, stage);
    return stage;
  }

  private *expressionTask(
    ctx: Context,
    layer: CompositionLayer,
    binding: ExpressionBinding,
  ): Task<true> {
    const stage = yield* this.stage(ctx, layer);
    if (stage.applied?.has(binding.key)) return true;
    if (stage.active?.has(binding.key))
      passageError("comp-expression-cycle", "Expression dependency cycle", {
        path: binding.expression.entry.target,
        frame: this.time,
      });
    (stage.active ??= new Set()).add(binding.key);
    const value = copy(readProperty(stage.state, binding.segments));
    const result = yield* this.expressionValue({
      ctx,
      layer,
      binding,
      state: stage.state,
      value,
    });
    writeValue(stage.state, binding.segments, result);
    this.normalize(ctx, stage.state);
    (stage.pre ??= new Map()).set(binding.key, value);
    (stage.applied ??= new Set()).add(binding.key);
    stage.active.delete(binding.key);
    return true;
  }

  /** A property's expression-stage value; overlapping expressions apply first. */
  private *readStage(
    ctx: Context,
    layer: CompositionLayer,
    segments: PropertyPathSegment[],
  ): Task<Numeric> {
    if (layer.type === "precomp" && segments[0]!.name === "timeRemap")
      return yield* this.clock(ctx, layer);
    const stage = yield* this.stage(ctx, layer);
    if (stage.constrained && !stage.sealed) {
      // Without expressions the stage is keys plus motion craft; rebuild it.
      const fresh = baseState(
        this.compiled.comp,
        ctx,
        layer,
        this.shapeBudget(ctx, layer),
      );
      yield* this.motion(ctx, fresh);
      return copy(readProperty(fresh, segments));
    }
    if (!stage.sealed)
      for (const binding of this.compiled.expressions.get(
        this.bindings(ctx, layer.id),
      ) ?? [])
        if (!binding.clock && overlaps(binding.segments, segments))
          yield* this.applied(ctx, layer, binding);
    return copy(readProperty(stage.sealed ?? stage.state, segments));
  }

  /** This property's pre-expression value at another root frame. */
  private *ownValueAt(env: ExpressionEnv, frame: number): Task<Numeric> {
    const evaluation = this.at(frame);
    const ctx = yield* evaluation.scopeFor({ scope: env.ctx.route });
    if (env.binding.clock)
      return (yield* evaluation.clockBase(ctx, env.layer)).timeRemap!;
    const stage = yield* evaluation.stage(ctx, env.layer);
    return copy(
      stage.pre?.get(env.binding.key) ??
        readProperty(stage.state, env.binding.segments),
    );
  }

  private *readPath(path: PropertyPath, frame: number): Task<Numeric> {
    checkFrame(frame, path);
    const evaluation = this.at(frame);
    if (path.layer === "comp")
      return sampleCamera(this.compiled.comp, frame)[
        path.segments[1]!.name as "x" | "y" | "zoom"
      ];
    const ctx = yield* evaluation.scopeFor(path);
    return yield* evaluation.readStage(
      ctx,
      evaluation.layer(ctx, path.layer),
      path.segments,
    );
  }

  private *expressionValue(env: ExpressionEnv): Task<Numeric> {
    const result = (yield* this.expr(
      env.binding.expression.ast,
      env,
    )) as Numeric;
    const values = Array.isArray(result) ? result : [result];
    if (!values.every((v) => typeof v === "number" && Number.isFinite(v)))
      passageError(
        "comp-expression-value",
        `Expression for "${env.binding.expression.entry.target}" produced a non-finite value`,
        { path: env.binding.expression.entry.target, frame: this.time },
      );
    return result;
  }

  private *expr(
    node: ExpressionAst,
    env: ExpressionEnv,
  ): Task<ExpressionValue> {
    if ("num" in node) return node.num;
    if ("bool" in node) return node.bool;
    if ("str" in node) return node.str;
    if ("color" in node) return rgba(node.color);
    if ("vec" in node) {
      const items: number[] = [];
      for (const item of node.vec)
        items.push((yield* this.expr(item, env)) as number);
      return items;
    }
    if ("id" in node) {
      const fps = this.compiled.comp.fps;
      switch (node.id) {
        case "time":
          return this.time / fps;
        case "frame":
          return this.time;
        case "fps":
          return fps;
        case "value":
          return copy(env.value);
        case "index":
          return env.ctx.scope.layers.indexOf(env.layer) + 1;
        case "layerCount":
          return env.ctx.scope.layers.length;
      }
    }
    if ("member" in node)
      return ((yield* this.expr(node.of, env)) as number[])[
        COMPONENT[node.member]!
      ]!;
    if ("call" in node) return yield* this.call(node, env);
    const [a, b, c] = node.args;
    switch (node.op) {
      case "neg":
        return map((yield* this.expr(a!, env)) as number, (x) => -x);
      case "!":
        return !(yield* this.expr(a!, env));
      case "?:":
        return (yield* this.expr(a!, env))
          ? yield* this.expr(b!, env)
          : yield* this.expr(c!, env);
      case "&&":
        return (
          ((yield* this.expr(a!, env)) as boolean) &&
          ((yield* this.expr(b!, env)) as boolean)
        );
      case "||":
        return (
          ((yield* this.expr(a!, env)) as boolean) ||
          ((yield* this.expr(b!, env)) as boolean)
        );
    }
    const left = yield* this.expr(a!, env),
      right = yield* this.expr(b!, env);
    switch (node.op) {
      case "+":
        return zip(left, right, (x, y) => x + y);
      case "-":
        return zip(left, right, (x, y) => x - y);
      case "*":
        return zip(left, right, (x, y) => x * y);
      case "/":
        return zip(left, right, (x, y) => x / y);
      case "%":
        return zip(left, right, (x, y) => x % y);
      case "<":
        return (left as number) < (right as number);
      case "<=":
        return (left as number) <= (right as number);
      case ">":
        return (left as number) > (right as number);
      case ">=":
        return (left as number) >= (right as number);
      case "==":
        return left === right;
      case "!=":
        return left !== right;
    }
    return passageError("comp-expression-type", `Unknown operator`, {
      path: env.binding.expression.entry.target,
    });
  }

  /** Own keys of the expression target, for loops, inertia, anticipation and roving. */
  private curve(env: ExpressionEnv) {
    if (env.curve === undefined)
      env.curve =
        ownCurve(env.layer, env.binding.segments, env.ctx.fps) ?? null;
    return env.curve ?? undefined;
  }

  private *call(
    node: Extract<ExpressionAst, { call: string }>,
    env: ExpressionEnv,
  ): Task<ExpressionValue> {
    const fps = this.compiled.comp.fps;
    const args: ExpressionValue[] = [];
    const reads = env.binding.expression.reads;
    // Path arguments are string literals resolved during validation.
    const pathOf = (arg: ExpressionAst) =>
      reads.find((read) => read.text === (arg as { str: string }).str)!.path;
    const evaluated = (from = 0) => this.evaluateArgs(node, env, args, from);
    const keyTime = env.state.sampleIndex ?? env.state.time;
    const seconds = (value: ExpressionValue) =>
      secondsToFrames(value as number, fps);
    const fail = (message: string): never =>
      passageError("comp-expression-value", `${node.call}(): ${message}`, {
        path: env.binding.expression.entry.target,
        frame: this.time,
      });
    switch (node.call) {
      case "if":
        return (yield* this.expr(node.args[0]!, env))
          ? yield* this.expr(node.args[1]!, env)
          : yield* this.expr(node.args[2]!, env);
      case "ref":
        return yield* this.readPath(pathOf(node.args[0]!), this.time);
      case "valueAtTime":
      case "velocityAtTime": {
        const own = node.args.length === 1;
        const [t] = yield* evaluated(own ? 0 : 1);
        const frame = seconds(t!);
        const read = (at: number) =>
          own
            ? this.ownValueAt(env, checkFrame(at, env.binding.path))
            : this.readPath(pathOf(node.args[0]!), at);
        if (node.call === "valueAtTime") return yield* read(frame);
        const after = yield* read(frame + 1),
          before = yield* read(frame - 1);
        return zip(after, before, (x, y) => ((x - y) * fps) / 2);
      }
      case "signal":
        return this.signalAt((node.args[0] as { str: string }).str, this.time);
      case "spring": {
        const [frequency, damping, delay = 0] = (yield* evaluated(
          1,
        )) as number[];
        if (!(frequency! > 0 && frequency! <= 30))
          fail("frequency must be in (0, 30] Hz");
        if (!(damping! > 0 && damping! <= 4)) fail("damping must be in (0, 4]");
        if (!(delay >= 0 && delay * fps <= COMPOSITION_LIMITS.maxKeyFrame))
          fail("delay must be a non-negative number of seconds");
        const path = pathOf(node.args[0]!);
        const shift = secondsToFrames(delay, fps);
        const input = (frame: number) => this.readPath(path, frame - shift);
        const end = this.time;
        if (end <= 0) return yield* input(end);
        const omega = (2 * Math.PI * frequency!) / fps;
        const first = (yield* input(0)) as ExpressionValue;
        let x = Array.isArray(first) ? [...first] : [first as number];
        let v = x.map(() => 0);
        let previous = x;
        for (let start = 0; start < end; start++) {
          const h = Math.min(1, end - start);
          const next = (yield* input(start + h)) as ExpressionValue;
          const b = Array.isArray(next) ? next : [next as number];
          const stepped = x.map((xi, i) =>
            springStep(xi, v[i]!, previous[i]!, b[i]!, h, omega, damping!),
          );
          x = stepped.map(([position]) => position);
          v = stepped.map(([, velocity]) => velocity);
          previous = b;
        }
        return Array.isArray(first) ? x : x[0]!;
      }
      case "heading":
        return yield* this.heading(pathOf(node.args[0]!));
    }
    yield* evaluated();
    const n = args as number[];
    switch (node.call) {
      case "clamp":
        return zip(zip(args[0]!, args[1]!, Math.max), args[2]!, Math.min);
      case "mix":
        return lerp(args[0]!, args[1]!, n[2]!);
      case "linear":
      case "ease":
      case "easeIn":
      case "easeOut": {
        const [t, low, high, from, to] =
          args.length === 3 ? [n[0]!, 0, 1, args[1]!, args[2]!] : args;
        const span = (high as number) - (low as number);
        const progress = span ? ((t as number) - (low as number)) / span : 1;
        return lerp(from!, to!, easeProgress(node.call as EaseKind, progress));
      }
      case "wiggle": {
        const [frequency, amplitude, seed = 0, octaves = 1] = n;
        const t = this.time / fps;
        return Array.isArray(env.value)
          ? env.value.map(
              (x, i) =>
                x + wiggleOffset(frequency!, amplitude!, seed, octaves, t, i),
            )
          : (env.value as number) +
              wiggleOffset(frequency!, amplitude!, seed, octaves, t, 0);
      }
      case "noise":
        return noise(n[0]!, n[1]!);
      case "random":
        return random(n[0]!, n[1]!);
      case "loopIn":
      case "loopOut":
        return loop(
          this.curve(env),
          node.call === "loopIn" ? "in" : "out",
          ((args[0] as string | undefined) ?? "cycle") as LoopMode,
          n[1] ?? 0,
          keyTime,
          env.value,
        );
      case "smooth": {
        const width = Math.min(60, Math.abs(n[0] ?? 0.2));
        const samples = n[1] ?? 5;
        let total: ExpressionValue | undefined;
        for (let i = 0; i < samples; i++) {
          const offset = samples === 1 ? 0 : (i / (samples - 1) - 0.5) * width;
          const value = yield* this.ownValueAt(
            env,
            this.time + secondsToFrames(offset, fps),
          );
          total =
            total === undefined ? value : zip(total, value, (x, y) => x + y);
        }
        return map(total!, (x) => x / samples);
      }
      case "lookAt": {
        const [from, to] = args as number[][];
        return angleOf(to![0]! - from![0]!, to![1]! - from![1]!);
      }
      case "length":
        return args.length === 1
          ? vectorLength(args[0] as number[])
          : vectorLength(zip(args[0]!, args[1]!, (x, y) => x - y) as number[]);
      case "normalize": {
        const vector = args[0] as number[];
        const length = vectorLength(vector);
        return length ? vector.map((x) => x / length) : vector.map(() => 0);
      }
      case "step":
        return n[1]! < n[0]! ? 0 : 1;
      case "abs":
        return map(args[0]!, Math.abs);
      case "floor":
        return map(args[0]!, Math.floor);
      case "ceil":
        return map(args[0]!, Math.ceil);
      case "round":
        return map(args[0]!, (x) => Math.sign(x) * Math.round(Math.abs(x)));
      case "sign":
        return map(args[0]!, Math.sign);
      case "sqrt":
        return map(args[0]!, Math.sqrt);
      case "exp":
        return map(args[0]!, Math.exp);
      case "log":
        return map(args[0]!, Math.log);
      case "sin":
        return map(args[0]!, Math.sin);
      case "cos":
        return map(args[0]!, Math.cos);
      case "tan":
        return map(args[0]!, Math.tan);
      case "degrees":
        return map(args[0]!, (x) => (x * 180) / Math.PI);
      case "radians":
        return map(args[0]!, (x) => (x * Math.PI) / 180);
      case "min":
        return zip(args[0]!, args[1]!, Math.min);
      case "max":
        return zip(args[0]!, args[1]!, Math.max);
      case "pow":
        return zip(args[0]!, args[1]!, (x, y) => x ** y);
      case "atan2":
        return Math.atan2(n[0]!, n[1]!);
      case "rgba":
        return [n[0]!, n[1]!, n[2]!, n[3]!];
      case "inertia":
        return inertia(
          this.curve(env),
          keyTime,
          env.ctx.fps,
          n[0]!,
          n[1]!,
          n[2]!,
          env.value,
        );
      case "anticipate":
        return anticipate(
          this.curve(env),
          keyTime,
          n[0]!,
          secondsToFrames(n[1]!, env.ctx.fps),
          env.value,
        );
      case "rove":
        return rove(this.curve(env), keyTime, env.value);
      case "squash":
        return squash(args[0] as number[], n[1]!, n[2]!, args[3] === true);
    }
    return fail("unknown built-in");
  }

  private *evaluateArgs(
    node: Extract<ExpressionAst, { call: string }>,
    env: ExpressionEnv,
    into: ExpressionValue[],
    from: number,
  ): Task<ExpressionValue[]> {
    for (const arg of node.args.slice(from))
      into.push(yield* this.expr(arg, env));
    return into;
  }

  /**
   * Clockwise direction of travel of a 2D path in degrees: the ±1 frame chord, else
   * the last direction within 64 frames, else the first within the next 64.
   */
  private *heading(path: PropertyPath): Task<number> {
    const at = (frame: number) => this.readPath(path, frame) as Task<number[]>;
    const direction = (a: number[], b: number[]) =>
      vectorLength([a[0]! - b[0]!, a[1]! - b[1]!]) > 1e-9
        ? angleOf(a[0]! - b[0]!, a[1]! - b[1]!)
        : undefined;
    const here = yield* at(this.time);
    let angle = direction(yield* at(this.time + 1), yield* at(this.time - 1));
    for (
      let k = 1;
      angle === undefined && k <= AUTO_ORIENT_LOOKAROUND_FRAMES;
      k++
    )
      angle = direction(here, yield* at(this.time - k));
    for (
      let k = 1;
      angle === undefined && k <= AUTO_ORIENT_LOOKAROUND_FRAMES;
      k++
    )
      angle = direction(yield* at(this.time + k), here);
    return angle ?? 0;
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
    // Evaluated inline: the stage's own dependencies still go through the stack.
    const stage =
      ctx.stages.get(layer.id) ?? (yield* this.stageTask(ctx, layer));
    const state = stage.state;
    if (this.compiled.expressions.size)
      for (const binding of this.compiled.expressions.get(
        this.bindings(ctx, layer.id),
      ) ?? [])
        if (!binding.clock) yield* this.applied(ctx, layer, binding);
    if (layer.type === "precomp")
      state.timeRemap = yield* this.clock(ctx, layer);
    if (state.contents)
      state.shapes = compileShapes(
        state.contents,
        state.time / ctx.fps,
        this.shapeBudget(ctx, layer),
      );
    validateEffectParameters(state.effects, {
      node: layer.id,
      path: layerKey(ctx.route, layer.id),
      frame: this.time,
    });
    // Only compositions with stage readers pay for the pre-constraint copy.
    if (this.compiled.stageReads)
      stage.sealed = sealStage(state, this.shapeBudget(ctx, layer));
    else stage.constrained = true;
    // AE auto-orient: added after expressions, invisible to rotation reads.
    if (layer.transform?.autoOrient === "path")
      state.transform.rotation += yield* this.heading({
        scope: ctx.route,
        layer: layer.id,
        segments: AUTO_ORIENT_POSITION,
      });
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
              : "path" in constraint
                ? constraint.path
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
      budget: this.shapeBudget(ctx, layer),
      signal: (id) => this.signalAt(id, this.time),
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
      ? effectBounds(projectBounds(local, state.screenMatrix), state.effects, {
          node: layer.id,
          path: layerKey(ctx.route, layer.id),
          frame: this.time,
        })
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

  private readonly effectSources = new WeakMap<CompositionScope, Set<string>>();
  private effectSourceLayer(scope: CompositionScope, id: string): boolean {
    let sources = this.effectSources.get(scope);
    if (!sources) {
      sources = new Set(
        scope.layers.flatMap((layer) =>
          (layer.effects ?? []).flatMap((effect) =>
            Object.values(effect.inputs ?? {}),
          ),
        ),
      );
      this.effectSources.set(scope, sources);
    }
    if (!sources.size) return false;
    for (
      let layer = scope.layers.find((layer) => layer.id === id);
      layer;
      layer = scope.layers.find((parent) => parent.id === layer!.parent)
    ) {
      if (sources.has(layer.id)) return true;
      if (!layer.parent) break;
    }
    return false;
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
        (state.visible ||
          ctx.matteLayers.has(state.id) ||
          this.effectSourceLayer(ctx.scope, state.id))
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

function overlaps(a: PropertyPathSegment[], b: PropertyPathSegment[]) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++)
    if (a[i]!.name !== b[i]!.name || a[i]!.index !== b[i]!.index) return false;
  return true;
}

function checkFrame(frame: number, path: Pick<PropertyPath, "layer">) {
  if (
    !Number.isFinite(frame) ||
    Math.abs(frame) > COMPOSITION_LIMITS.maxKeyFrame
  )
    passageError(
      "comp-evaluation-time",
      `Expression time must be finite and within ±${COMPOSITION_LIMITS.maxKeyFrame} frames`,
      { path: path.layer, frame },
    );
  return frame;
}

/** Copy the values expression reads may observe; constraints mutate the live state. */
function sealStage(
  state: EvaluatedLayer,
  budget: ShapeGeometryBudget,
): EvaluatedLayer {
  return {
    ...state,
    transform: {
      ...state.transform,
      anchor: [...state.transform.anchor],
      position: [...state.transform.position],
      scale: [...state.transform.scale],
    },
    constraintReference: [...state.constraintReference],
    ...(state.color ? { color: [...state.color] as typeof state.color } : {}),
    ...(state.contents
      ? { contents: cloneShapes(state.contents, budget) }
      : {}),
  };
}

/** Auto-orient reads the layer's own position path through `heading()`. */
const AUTO_ORIENT_POSITION: PropertyPathSegment[] = [
  { name: "transform" },
  { name: "position" },
];
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

/**
 * A property's expression-stage value (keys, motion craft and expressions, before
 * constraints) and its layer time. This is what expression reads observe and what
 * `comp bake` writes as keys.
 */
export function evaluateStageProperty(
  comp: Composition,
  path: string,
  time: number,
  options: EvaluationOptions = {},
): StageSample {
  return evaluateStageProperties(comp, [path], time, options)[0]!;
}

/** Several expression-stage values at one time, sharing one evaluation session. */
export function evaluateStageProperties(
  comp: Composition,
  paths: readonly string[],
  time: number,
  options: EvaluationOptions = {},
): StageSample[] {
  const evaluation = session(comp, time, options);
  return paths.map((path) =>
    structuredClone(
      evaluation.stageProperty(resolvedPath(evaluation.compiled, path)),
    ),
  );
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
