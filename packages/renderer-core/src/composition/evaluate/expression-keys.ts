/**
 * Built-ins that work from a property's own keys (loops, inertia, anticipation and
 * roving). They sample keyed values in layer time and never re-enter the property's
 * expression. Motion-craft contributions at the current time are preserved by adding
 * `value − keyed(t)` to the keyed result.
 */
import {
  COMPOSITION_LIMITS,
  compositionEffectDefinition,
  locateShapeProperty,
  isKeyed,
  type CompositionLayer,
  type Keyed,
  type LoopMode,
  type PropertyPathSegment,
} from "@still-shift/scene-contract";
import type { Point } from "../../node-transform.ts";
import { passageError } from "../../passage-diagnostics.ts";
import { color, scalar, vector, vector3 } from "./sample.ts";
import type { Point3 } from "./spatial-geometry.ts";
import { lerp, zip, type ExpressionValue } from "./expression-math.ts";

type Raw = unknown;
export type OwnCurve = {
  /** Sorted key frames in layer time; empty when the property is not keyed. */
  frames: number[];
  sample: (time: number) => number | number[];
  /** Joint 2D keys with optional spatial tangents, for `rove()`. */
  joint?: Keyed<Point>;
  /** Opt-in xyz keys, including an implicit z for authored xy position/scale keys. */
  joint3?: { value: Keyed<Point3>; fallback: Point3 };
  /** Separate dimensions define a path through their independently eased samples. */
  separated?: {
    owner: object;
    fps: number;
    dimensions: 2 | 3;
    fallbackZ: number;
  };
};

const VECTOR_AXIS: Record<string, number> = { x: 0, y: 1, z: 2 };
const COLOR_AXIS: Record<string, number> = { r: 0, g: 1, b: 2, a: 3 };

function keyFrames(raw: Raw): number[] {
  if (isKeyed(raw)) return raw.keys.map((key) => key.frame);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const frames = new Set<number>();
    for (const part of Object.values(raw))
      if (isKeyed(part)) for (const key of part.keys) frames.add(key.frame);
    return [...frames].sort((a, b) => a - b);
  }
  return [];
}

function component(
  sample: (time: number) => number[],
  index: number | undefined,
): (time: number) => number | number[] {
  return index === undefined ? sample : (time) => sample(time)[index]!;
}

/** The authored animatable behind an expression target, with a keyed sampler. */
export function ownCurve(
  layer: CompositionLayer,
  segments: readonly PropertyPathSegment[],
  fps: number,
): OwnCurve | undefined {
  const [head, next, last] = segments;
  let raw: Raw;
  let kind: "scalar" | "vector" | "color" = "scalar";
  let axis: string | undefined;
  let spatial = false;
  let fallbackZ = 0;
  switch (head!.name) {
    case "contents": {
      if (layer.type !== "shape") return undefined;
      const location = locateShapeProperty(layer.contents, segments);
      if (!location || location.descriptor.type === "path") return undefined;
      raw = location.owner[location.key];
      kind =
        location.descriptor.type === "vec2"
          ? "vector"
          : location.descriptor.type;
      if (location.component !== undefined)
        axis = (kind === "color" ? ["r", "g", "b", "a"] : ["x", "y"])[
          location.component
        ];
      break;
    }
    case "transform":
      raw =
        layer.transform?.[
          next!.name as keyof NonNullable<CompositionLayer["transform"]>
        ];
      if (["anchor", "position", "scale", "orientation"].includes(next!.name)) {
        kind = "vector";
        axis = last?.name;
        spatial =
          layer.threeD === true ||
          layer.type === "camera" ||
          layer.type === "light";
        fallbackZ = next!.name === "scale" ? 1 : 0;
      }
      break;
    case "pointOfInterest":
      raw = layer.type === "camera" ? layer.pointOfInterest : undefined;
      kind = "vector";
      axis = next?.name;
      spatial = true;
      break;
    case "constraintReference":
      raw = layer.constraintReference;
      kind = "vector";
      axis = next?.name;
      spatial =
        layer.threeD === true ||
        layer.type === "camera" ||
        layer.type === "light";
      break;
    case "color":
      raw = "color" in layer ? layer.color : undefined;
      kind = "color";
      axis = next?.name;
      break;
    case "intensity":
    case "range":
    case "falloffStart":
    case "innerCone":
    case "outerCone":
      raw = layer.type === "light" ? layer[head!.name] : undefined;
      break;
    case "masks": {
      const mask = layer.masks?.find((m) => m.id === head!.index);
      raw = mask?.[next!.name as "feather" | "expansion" | "opacity"];
      break;
    }
    case "effects": {
      const effect = layer.effects?.find((e) => e.id === head!.index);
      raw = effect?.params?.[next!.name];
      const definition = effect && compositionEffectDefinition(effect.effect);
      if (definition?.properties[next!.name]?.type === "color") {
        kind = "color";
        axis = last?.name;
      }
      break;
    }
    default:
      raw = (layer as Record<string, unknown>)[head!.name];
  }
  // Separated vector components are keyed scalars of their own.
  if (
    kind === "vector" &&
    axis !== undefined &&
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    !isKeyed(raw)
  ) {
    raw = (raw as Record<string, unknown>)[axis];
    kind = "scalar";
    axis = undefined;
  }
  const frames = keyFrames(raw);
  if (frames.length === 0) return undefined;
  if (kind === "scalar")
    return { frames, sample: (time) => scalar(raw, time, fps) };
  if (kind === "color")
    return {
      frames,
      sample: component(
        (time) => color(raw, time, fps),
        axis === undefined ? undefined : COLOR_AXIS[axis],
      ),
    };
  const fallback: Point3 = [0, 0, fallbackZ];
  const sample = component(
    (time) =>
      spatial
        ? vector3(raw, time, fps, fallback)
        : vector(raw, time, fps, [0, 0]),
    axis === undefined ? undefined : VECTOR_AXIS[axis],
  );
  if (axis !== undefined) return { frames, sample };
  if (spatial && isKeyed(raw))
    return {
      frames,
      sample,
      joint3: { value: raw as Keyed<Point3>, fallback },
    };
  return isKeyed(raw)
    ? { frames, sample, joint: raw as Keyed<Point> }
    : {
        frames,
        sample,
        separated: {
          owner: raw as object,
          fps,
          dimensions: spatial ? 3 : 2,
          fallbackZ,
        },
      };
}

const mod = (a: number, b: number) => ((a % b) + b) % b;
const add = (a: ExpressionValue, b: ExpressionValue) =>
  zip(a, b, (x, y) => x + y);
const sub = (a: ExpressionValue, b: ExpressionValue) =>
  zip(a, b, (x, y) => x - y);
const scale = (a: ExpressionValue, s: number) => zip(a, s, (x, y) => x * y);
const zero = (value: ExpressionValue) => scale(value, 0);

/** loopIn / loopOut. `value` is the pre-expression value at layer time `time`. */
export function loop(
  curve: OwnCurve | undefined,
  direction: "in" | "out",
  mode: LoopMode,
  keyCount: number,
  time: number,
  value: ExpressionValue,
): ExpressionValue {
  if (!curve || curve.frames.length < 2) return value;
  const frames = curve.frames;
  const first = frames[0]!,
    last = frames.at(-1)!;
  if (direction === "out" ? time <= last : time >= first) return value;
  const span = keyCount
    ? direction === "out"
      ? [frames[Math.max(0, frames.length - 1 - keyCount)]!, last]
      : [first, frames[Math.min(frames.length - 1, keyCount)]!]
    : [first, last];
  const [start, end] = span as [number, number];
  const duration = end - start;
  if (duration <= 0) return value;
  const motion = sub(value, curve.sample(time));
  const at = (t: number) => add(curve.sample(t), motion);
  const elapsed = direction === "out" ? time - end : start - time;
  const cycles = Math.floor(elapsed / duration);
  const r = mod(elapsed, duration);
  switch (mode) {
    case "cycle":
      return at(direction === "out" ? start + r : end - r);
    case "pingpong":
      return at(
        (cycles % 2 === 0) === (direction === "out") ? end - r : start + r,
      );
    case "offset": {
      const delta = sub(curve.sample(end), curve.sample(start));
      return direction === "out"
        ? add(at(start + r), scale(delta, cycles + 1))
        : sub(at(end - r), scale(delta, cycles + 1));
    }
    case "continue": {
      const edge = direction === "out" ? end : start;
      const step = direction === "out" ? -0.1 : 0.1;
      const slope = scale(
        sub(curve.sample(edge), curve.sample(edge + step)),
        1 / 0.1,
      );
      return add(at(edge), scale(slope, elapsed));
    }
  }
}

/** Velocity per frame arriving at a key, from a 0.1-frame backward difference. */
const arriving = (curve: OwnCurve, frame: number) =>
  scale(sub(curve.sample(frame), curve.sample(frame - 0.1)), 10);

/**
 * Inertial bounce: after the latest passed key (other than the first), add
 * `v · amplitude · sin(2π f τ) / e^(decay τ)` with τ in seconds and v per second.
 */
export function inertia(
  curve: OwnCurve | undefined,
  time: number,
  fps: number,
  amplitude: number,
  frequency: number,
  decay: number,
  value: ExpressionValue,
): ExpressionValue {
  if (!curve) return zero(value);
  const n = curve.frames.findLastIndex((frame) => frame <= time);
  if (n < 1) return zero(value);
  const tau = (time - curve.frames[n]!) / fps;
  if (tau <= 0) return zero(value);
  const velocity = scale(arriving(curve, curve.frames[n]!), fps);
  return scale(
    velocity,
    (amplitude * Math.sin(2 * Math.PI * frequency * tau)) /
      Math.exp(decay * tau),
  );
}

/**
 * Anticipation: during the `duration` frames before a key that starts a move, while
 * the property is at rest, pull back against the move by `amount · sin(π·phase)`.
 */
export function anticipate(
  curve: OwnCurve | undefined,
  time: number,
  amount: number,
  duration: number,
  value: ExpressionValue,
): ExpressionValue {
  if (!curve || duration <= 0) return zero(value);
  const frames = curve.frames;
  const i = frames.findIndex((frame) => frame >= time);
  if (i < 0 || i === frames.length - 1) return zero(value);
  if (frames[i]! - time > duration) return zero(value);
  if (i > 0) {
    const previous = curve.sample(frames[i - 1]!),
      current = curve.sample(frames[i]!);
    // Already moving: anticipation belongs to moves that start from rest.
    if (!equal(previous, current)) return zero(value);
  }
  const a = curve.sample(frames[i]!),
    b = curve.sample(frames[i + 1]!);
  const delta = sub(b, a);
  const direction = Array.isArray(delta)
    ? (() => {
        const length = Math.hypot(...delta);
        return length ? delta.map((d) => d / length) : delta.map(() => 0);
      })()
    : Math.sign(delta as number);
  const phase = (time - (frames[i]! - duration)) / duration;
  return scale(direction, -amount * Math.sin(Math.PI * phase));
}

const equal = (a: number | number[], b: number | number[]) =>
  Array.isArray(a) ? a.every((x, i) => x === (b as number[])[i]) : a === b;

/** Points along joint 2D keys, 128 cubic subdivisions per segment as in `sample.ts`. */
function roveTable(keys: Keyed<Point>["keys"]) {
  const points: Point[] = [];
  const lengths: number[] = [];
  keys.slice(0, -1).forEach((key, index) => {
    const end = keys[index + 1]!;
    const a = key.value,
      b = end.value;
    const out = (key.spatialOut as Point | undefined) ?? [0, 0];
    const incoming = (end.spatialIn as Point | undefined) ?? [0, 0];
    for (let i = index ? 1 : 0; i <= 128; i++) {
      const t = i / 128;
      points.push(
        [0, 1].map(
          (axis) =>
            (1 - t) ** 3 * a[axis]! +
            3 * (1 - t) ** 2 * t * (a[axis]! + out[axis]!) +
            3 * (1 - t) * t ** 2 * (b[axis]! + incoming[axis]!) +
            t ** 3 * b[axis]!,
        ) as Point,
      );
    }
  });
  points.forEach((point, i) =>
    lengths.push(
      i
        ? lengths[i - 1]! +
            Math.hypot(
              point[0] - points[i - 1]![0],
              point[1] - points[i - 1]![1],
            )
        : 0,
    ),
  );
  return { points, lengths };
}
const roveTables = new WeakMap<object, ReturnType<typeof roveTable>>();
const roveTables3 = new WeakMap<
  object,
  Map<number, { points: Point3[]; lengths: number[] }>
>();
function roveTable3(joint: NonNullable<OwnCurve["joint3"]>) {
  let tables = roveTables3.get(joint.value);
  if (!tables) roveTables3.set(joint.value, (tables = new Map()));
  const cached = tables.get(joint.fallback[2]);
  if (cached) return cached;
  const points: Point3[] = [],
    lengths: number[] = [];
  joint.value.keys.slice(0, -1).forEach((key, index) => {
    const end = joint.value.keys[index + 1]!;
    const out = (key.spatialOut as number[] | undefined) ?? [0, 0, 0];
    const incoming = (end.spatialIn as number[] | undefined) ?? [0, 0, 0];
    for (let i = index ? 1 : 0; i <= 128; i++) {
      const t = i / 128;
      points.push(
        [0, 1, 2].map((axis) => {
          const a = key.value[axis] ?? joint.fallback[axis]!;
          const b = end.value[axis] ?? joint.fallback[axis]!;
          return (
            (1 - t) ** 3 * a +
            3 * (1 - t) ** 2 * t * (a + (out[axis] ?? 0)) +
            3 * (1 - t) * t ** 2 * (b + (incoming[axis] ?? 0)) +
            t ** 3 * b
          );
        }) as Point3,
      );
    }
  });
  points.forEach((point, index) =>
    lengths.push(
      index
        ? lengths[index - 1]! +
            Math.hypot(
              ...point.map((value, axis) => value - points[index - 1]![axis]!),
            )
        : 0,
    ),
  );
  const table = { points, lengths };
  tables.set(joint.fallback[2], table);
  return table;
}
const separatedRoveTables = new WeakMap<
  object,
  Map<string, { points: number[][]; lengths: number[] }>
>();
const ROVE_SUBDIVISIONS = 128;
const SPRING_SAMPLES_PER_PERIOD = 512;

/** Natural spring frequency bounds oscillation speed, including damped responses. */
function springRate(raw: unknown, start: number) {
  if (!isKeyed(raw)) return 0;
  const index = raw.keys.findIndex((key) => key.frame > start);
  if (index < 1) return 0;
  const a = raw.keys[index - 1]!,
    b = raw.keys[index]!;
  if (
    a.value === b.value ||
    b.interpolation === "linear" ||
    b.interpolation === "hold" ||
    b.step ||
    b.bezier ||
    a.smooth ||
    b.smooth ||
    a.interpolation === "smooth" ||
    b.interpolation === "smooth" ||
    a.out ||
    b.in
  )
    return 0;
  const easing = b.easing as
    | { spring?: { stiffness: number; mass: number } }
    | string
    | undefined;
  return typeof easing === "object" && easing.spring
    ? Math.sqrt(easing.spring.stiffness / easing.spring.mass)
    : 0;
}

function separatedSubdivisions(curve: OwnCurve) {
  const { owner, fps, dimensions } = curve.separated!;
  const axes = owner as { x: unknown; y: unknown; z?: unknown };
  const subdivisions = curve.frames.slice(0, -1).map((start, index) => {
    const duration = curve.frames[index + 1]! - start;
    const frequency = Math.max(
      springRate(axes.x, start),
      springRate(axes.y, start),
      dimensions === 3 ? springRate(axes.z, start) : 0,
    );
    return Math.max(
      ROVE_SUBDIVISIONS,
      Math.ceil(
        (duration * frequency * SPRING_SAMPLES_PER_PERIOD) /
          (2 * Math.PI * fps),
      ),
    );
  });
  const points = 1 + subdivisions.reduce((total, count) => total + count, 0);
  const maxPoints =
    dimensions * COMPOSITION_LIMITS.maxKeys * ROVE_SUBDIVISIONS + 1;
  if (points > maxPoints)
    passageError(
      "comp-expression-value",
      `rove(): resolving this separated path requires ${points.toLocaleString("en-US")} points; at most ${maxPoints.toLocaleString("en-US")} are allowed`,
      { path: "expressions" },
    );
  return subdivisions;
}

/** Sample each interval in the union of separate key times, retaining axis easing. */
function separatedRoveTable(curve: OwnCurve) {
  const subdivisions = separatedSubdivisions(curve);
  const points: number[][] = [];
  const lengths: number[] = [];
  curve.frames.slice(0, -1).forEach((start, index) => {
    const duration = curve.frames[index + 1]! - start;
    const count = subdivisions[index]!;
    for (let i = index ? 1 : 0; i <= count; i++) {
      const point = curve.sample(start + (duration * i) / count) as number[];
      const previous = points.at(-1);
      lengths.push(
        previous
          ? lengths.at(-1)! +
              Math.hypot(...point.map((axis, i) => axis - previous[i]!))
          : 0,
      );
      points.push(point);
    }
  });
  return { points, lengths };
}

function rovingPath(curve: OwnCurve) {
  if (curve.joint3) return roveTable3(curve.joint3);
  if (curve.joint) {
    let table = roveTables.get(curve.joint);
    if (!table)
      roveTables.set(curve.joint, (table = roveTable(curve.joint.keys)));
    return table;
  }
  if (!curve.separated) return undefined;
  const { owner, fps, dimensions, fallbackZ } = curve.separated;
  const key = `${fps}/${dimensions}/${fallbackZ}`;
  let tables = separatedRoveTables.get(owner);
  if (!tables) separatedRoveTables.set(owner, (tables = new Map()));
  let table = tables.get(key);
  if (!table) tables.set(key, (table = separatedRoveTable(curve)));
  return table;
}

/** Constant-speed traversal of the whole keyed path between its first and last keys. */
export function rove(
  curve: OwnCurve | undefined,
  time: number,
  value: ExpressionValue,
): ExpressionValue {
  if (!curve || curve.frames.length < 2) return value;
  const table = rovingPath(curve);
  if (!table) return value;
  const first = curve.frames[0]!,
    last = curve.frames.at(-1)!;
  const progress = Math.max(0, Math.min(1, (time - first) / (last - first)));
  const distance = progress * table.lengths.at(-1)!;
  let at = table.lengths.findIndex((length, i) => i > 0 && length >= distance);
  if (at < 1) at = table.points.length - 1;
  const span = table.lengths[at]! - table.lengths[at - 1]!;
  const t = span ? (distance - table.lengths[at - 1]!) / span : 0;
  const point = lerp(table.points[at - 1]!, table.points[at]!, t);
  return add(point, sub(value, curve.sample(time)));
}
