import {
  isKeyed,
  type BezierPath,
  type Keyed,
  type Signal,
} from "@still-shift/scene-contract";
import { monotoneTangents, sampleCurve, type CurveKey } from "../../curve.ts";
import type { Point } from "../../node-transform.ts";
import { addSignalMotion } from "../../motion-sampling.ts";
import type { Rgba } from "./types.ts";

type Key = Keyed<unknown>["keys"][number];
type Compiled = { keys: CurveKey[]; tangents: number[] };
const curves = new WeakMap<object, Map<string, Compiled>>();
const colors = new Map<string, Rgba>();

export function rgba(hex: string): Rgba {
  let color = colors.get(hex);
  if (!color) {
    color = [1, 3, 5, 7].map((at) =>
      at === 7 && hex.length === 7
        ? 1
        : parseInt(hex.slice(at, at + 2), 16) / 255,
    ) as Rgba;
    // Do not retain unbounded authoring history.
    if (colors.size >= 1024) colors.clear();
    colors.set(hex, color);
  }
  return [...color];
}

function numericCurve(
  owner: object,
  keys: Key[],
  id: string,
  read: (key: Key) => number,
) {
  let channels = curves.get(owner);
  if (!channels) curves.set(owner, (channels = new Map()));
  let curve = channels.get(id);
  if (!curve) {
    const numeric = keys.map(({ frame, value: _value, ...fields }, i) => ({
      ...fields,
      time: frame,
      value: read(keys[i]!),
    })) as CurveKey[];
    curve = {
      keys: numeric,
      tangents:
        numeric.length > 1
          ? monotoneTangents(
              numeric.map((k) => k.time),
              numeric.map((k) => k.value),
            )
          : [0],
    };
    channels.set(id, curve);
  }
  return curve;
}

function channel(
  owner: object,
  keys: Key[],
  id: string,
  read: (key: Key) => number,
  time: number,
  fps: number,
) {
  const curve = numericCurve(owner, keys, id, read);
  return sampleCurve(curve.keys, time, fps, curve.tangents);
}

export function scalar(
  value: unknown,
  time: number,
  fps: number,
  fallback = 0,
): number {
  if (typeof value === "number") return value;
  if (!isKeyed(value)) return fallback;
  return channel(
    value,
    value.keys,
    "scalar",
    (k) => k.value as number,
    time,
    fps,
  );
}

/** Imported motion curves use an array rather than a keyed object. */
export function motionScalar(keys: Key[], time: number, fps: number) {
  return channel(keys, keys, "scalar", (k) => k.value as number, time, fps);
}

export function signal(value: Signal, time: number, fps: number): number {
  return addSignalMotion(
    value,
    time,
    channel(
      value,
      value.keys,
      "scalar",
      (key) => key.value as number,
      time,
      fps,
    ),
  );
}

export function discrete(value: unknown, time: number, fallback = 0): number {
  if (typeof value === "number") return value;
  if (!isKeyed(value)) return fallback;
  let lo = 0,
    hi = value.keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (value.keys[mid]!.frame <= time) lo = mid + 1;
    else hi = mid;
  }
  return value.keys[Math.max(0, lo - 1)]!.value as number;
}

type ArcTable = { points: Point[]; lengths: number[]; total: number };
const arcs = new WeakMap<object, Map<number, ArcTable>>();
function spatialTable(owner: object, a: Key, b: Key, index: number): ArcTable {
  let tables = arcs.get(owner);
  if (!tables) arcs.set(owner, (tables = new Map()));
  let table = tables.get(index);
  if (table) return table;
  const start = a.value as Point,
    end = b.value as Point;
  const out = (a.spatialOut as Point | undefined) ?? [0, 0];
  const incoming = (b.spatialIn as Point | undefined) ?? [0, 0];
  // Match SpatialPathSchema's deterministic 128 subdivisions per cubic.
  const points = Array.from({ length: 129 }, (_, i) => {
    const t = i / 128;
    return [0, 1].map(
      (axis) =>
        (1 - t) ** 3 * start[axis]! +
        3 * (1 - t) ** 2 * t * (start[axis]! + out[axis]!) +
        3 * (1 - t) * t ** 2 * (end[axis]! + incoming[axis]!) +
        t ** 3 * end[axis]!,
    ) as Point;
  });
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1]! +
        Math.hypot(
          points[i]![0] - points[i - 1]![0],
          points[i]![1] - points[i - 1]![1],
        ),
    );
  table = { points, lengths, total: lengths.at(-1)! };
  tables.set(index, table);
  return table;
}

export function vector(
  value: unknown,
  time: number,
  fps: number,
  fallback: Point,
): Point {
  if (Array.isArray(value)) return [value[0] as number, value[1] as number];
  if (!isKeyed(value)) {
    const separated = value as { x?: unknown; y?: unknown } | undefined;
    return [
      scalar(separated?.x, time, fps, fallback[0]),
      scalar(separated?.y, time, fps, fallback[1]),
    ];
  }
  if (value.keys.some((k) => k.spatialIn || k.spatialOut)) {
    if (time <= value.keys[0]!.frame)
      return [...(value.keys[0]!.value as Point)];
    if (time >= value.keys.at(-1)!.frame)
      return [...(value.keys.at(-1)!.value as Point)];
    const index = value.keys.findIndex((k, i) => i > 0 && k.frame > time) - 1;
    const a = value.keys[index]!,
      b = value.keys[index + 1]!;
    const progress =
      channel(
        value,
        value.keys,
        "progress",
        (k) => value.keys.indexOf(k),
        time,
        fps,
      ) - index;
    const table = spatialTable(value, a, b, index);
    const distance = Math.max(0, Math.min(1, progress)) * table.total;
    const at = Math.max(
      1,
      table.lengths.findIndex((length, i) => i > 0 && length >= distance),
    );
    const length = table.lengths[at]! - table.lengths[at - 1]!;
    const t = length ? (distance - table.lengths[at - 1]!) / length : 0;
    return [0, 1].map(
      (axis) =>
        table.points[at - 1]![axis]! +
        (table.points[at]![axis]! - table.points[at - 1]![axis]!) * t,
    ) as Point;
  }
  return [0, 1].map((axis) =>
    channel(
      value,
      value.keys,
      `v${axis}`,
      (k) => (k.value as Point)[axis]!,
      time,
      fps,
    ),
  ) as Point;
}

export function color(value: unknown, time: number, fps: number): Rgba {
  if (typeof value === "string") return rgba(value);
  const keyed = value as Keyed<string>;
  return [0, 1, 2, 3].map((axis) =>
    Math.max(
      0,
      Math.min(
        1,
        channel(
          keyed,
          keyed.keys,
          `c${axis}`,
          (k) => rgba(k.value as string)[axis]!,
          time,
          fps,
        ),
      ),
    ),
  ) as Rgba;
}

export function path(
  value: BezierPath | Keyed<BezierPath>,
  time: number,
  fps: number,
): BezierPath {
  if (!isKeyed(value)) return structuredClone(value);
  const first = value.keys[0]!.value as BezierPath;
  const points = (field: "vertices" | "inTangents" | "outTangents") =>
    first.vertices.map(
      (_, vertex) =>
        [0, 1].map((axis) =>
          channel(
            value,
            value.keys,
            `${field}${vertex}.${axis}`,
            (k) => (k.value as BezierPath)[field]?.[vertex]?.[axis] ?? 0,
            time,
            fps,
          ),
        ) as Point,
    );
  const at = value.keys.findLast((k) => k.frame <= time) ?? value.keys[0]!;
  return {
    closed: (at.value as BezierPath).closed,
    vertices: points("vertices"),
    inTangents: points("inTangents"),
    outTangents: points("outTangents"),
  };
}

export const unit = (value: number) => Math.max(0, Math.min(1, value));
