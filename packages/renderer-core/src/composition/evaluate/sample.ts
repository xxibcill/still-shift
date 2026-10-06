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
import type { Point3 } from "./spatial-geometry.ts";

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

type Handle = {
  ease: number;
  speed?: number | number[];
  spatialSpeed?: number;
};
/** Pick one component of a grouped speed tuple (CE9); scalar speeds pass through. */
function axisHandle(handle: unknown, axis: number | undefined) {
  const h = handle as Handle | undefined;
  if (!h || !Array.isArray(h.speed)) return h;
  return {
    ease: h.ease,
    speed: axis === undefined ? undefined : h.speed[axis],
  };
}

function numericCurve(
  owner: object,
  keys: Key[],
  id: string,
  read: (key: Key) => number,
  axis?: number,
  handles?: (key: Key, index: number) => Pick<CurveKey, "in" | "out">,
) {
  let channels = curves.get(owner);
  if (!channels) curves.set(owner, (channels = new Map()));
  let curve = channels.get(id);
  if (!curve) {
    const numeric = keys.map(({ frame, value: _value, ...fields }, i) => {
      const key: Record<string, unknown> = {
        ...fields,
        time: frame,
        value: read(keys[i]!),
      };
      for (const side of ["in", "out"] as const)
        if (key[side] !== undefined) key[side] = axisHandle(key[side], axis);
      return handles ? { ...key, ...handles(keys[i]!, i) } : key;
    }) as CurveKey[];
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
  axis?: number,
  handles?: (key: Key, index: number) => Pick<CurveKey, "in" | "out">,
) {
  const curve = numericCurve(owner, keys, id, read, axis, handles);
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
    // Spatial speed is arc pixels/frame; progress counts keys, so divide by arc length.
    const progressHandles = (key: Key, i: number) => {
      const handle = (side: "in" | "out", segment: number) => {
        const h = key[side] as Handle | undefined;
        if (!h) return undefined;
        if (h.spatialSpeed === undefined) return { ease: h.ease };
        const total =
          segment < 0 || segment >= value.keys.length - 1
            ? 0
            : spatialTable(
                value,
                value.keys[segment]!,
                value.keys[segment + 1]!,
                segment,
              ).total;
        return { ease: h.ease, speed: total ? h.spatialSpeed / total : 0 };
      };
      return { in: handle("in", i - 1), out: handle("out", i) };
    };
    const progress =
      channel(
        value,
        value.keys,
        "progress",
        (k) => value.keys.indexOf(k),
        time,
        fps,
        undefined,
        progressHandles,
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
      axis,
    ),
  ) as Point;
}

type SpatialTable3 = { points: Point3[]; lengths: number[]; total: number };
const spatial3 = new WeakMap<object, Map<string, SpatialTable3>>();
const point3 = (value: unknown, fallback: Point3): Point3 => {
  const point=value as number[];
  return [point[0] ?? fallback[0],point[1] ?? fallback[1],point[2] ?? fallback[2]];
};
function spatialTable3(owner: object, a: Key, b: Key, index: number, fallback: Point3): SpatialTable3 {
  let tables=spatial3.get(owner);
  if (!tables) spatial3.set(owner,(tables=new Map()));
  const id=`${index}/${fallback[2]}`;
  const cached=tables.get(id);
  if(cached) return cached;
  const start=point3(a.value,fallback),end=point3(b.value,fallback);
  const out=a.spatialOut ? point3(a.spatialOut,[0,0,0]) : [0,0,0];
  const incoming=b.spatialIn ? point3(b.spatialIn,[0,0,0]) : [0,0,0];
  const points=Array.from({length:129},(_,index)=>{
    const t=index/128;
    return [0,1,2].map(axis=>(1-t)**3*start[axis]!+3*(1-t)**2*t*(start[axis]!+out[axis]!)+3*(1-t)*t**2*(end[axis]!+incoming[axis]!)+t**3*end[axis]!) as Point3;
  });
  const lengths=[0];
  for(let index=1;index<points.length;index++)
    lengths.push(lengths[index-1]!+Math.hypot(...points[index]!.map((value,axis)=>value-points[index-1]![axis]!)));
  const table={points,lengths,total:lengths.at(-1)!};
  tables.set(id,table);
  return table;
}

/** Opt-in xyz sampling; the established 2D sampler and arithmetic stay unchanged. */
export function vector3(value: unknown,time: number,fps: number,fallback: Point3): Point3 {
  if(Array.isArray(value)) return point3(value,fallback);
  if(!isKeyed(value)) {
    const separated=value as {x?:unknown;y?:unknown;z?:unknown}|undefined;
    return [scalar(separated?.x,time,fps,fallback[0]),scalar(separated?.y,time,fps,fallback[1]),scalar(separated?.z,time,fps,fallback[2])];
  }
  if(!value.keys.some(key=>key.spatialIn||key.spatialOut))
    return [0,1,2].map(axis=>channel(value,value.keys,`v3${axis}/${fallback[axis]}`,(key)=>(key.value as number[])[axis] ?? fallback[axis]!,time,fps,axis)) as Point3;
  if(time<=value.keys[0]!.frame) return point3(value.keys[0]!.value,fallback);
  if(time>=value.keys.at(-1)!.frame) return point3(value.keys.at(-1)!.value,fallback);
  const index=value.keys.findIndex((key,i)=>i>0&&key.frame>time)-1;
  const progressHandles=(key:Key,index:number)=>{
    const handle=(side:"in"|"out",segment:number)=>{
      const authored=key[side] as Handle|undefined;
      if(!authored) return undefined;
      if(authored.spatialSpeed===undefined) return {ease:authored.ease};
      const total=segment<0||segment>=value.keys.length-1 ? 0 : spatialTable3(value,value.keys[segment]!,value.keys[segment+1]!,segment,fallback).total;
      return {ease:authored.ease,speed:total ? authored.spatialSpeed/total : 0};
    };
    return {in:handle("in",index-1),out:handle("out",index)};
  };
  const progress=channel(value,value.keys,`progress3/${fallback[2]}`,key=>value.keys.indexOf(key),time,fps,undefined,progressHandles)-index;
  const table=spatialTable3(value,value.keys[index]!,value.keys[index+1]!,index,fallback);
  const distance=Math.max(0,Math.min(1,progress))*table.total;
  const at=Math.max(1,table.lengths.findIndex((length,index)=>index>0&&length>=distance));
  const length=table.lengths[at]!-table.lengths[at-1]!;
  const t=length ? (distance-table.lengths[at-1]!)/length : 0;
  return [0,1,2].map(axis=>table.points[at-1]![axis]!+(table.points[at]![axis]!-table.points[at-1]![axis]!)*t) as Point3;
}

/** Stable-topology color curve points, keyed together or with per-point numeric clocks. */
export function effectCurve(
  value: unknown,
  time: number,
  fps: number,
  fallback: readonly (readonly [number, number])[],
): Point[] {
  if (Array.isArray(value))
    return value.map((point, i) =>
      vector(point, time, fps, [...(fallback[i] ?? [0, 0])]),
    );
  if (!isKeyed(value)) return fallback.map((point) => [...point]);
  const first = value.keys[0]!.value as Point[];
  return first.map(
    (_, point) =>
      [0, 1].map((axis) =>
        channel(
          value,
          value.keys,
          `curve${point}.${axis}`,
          (key) => (key.value as Point[])[point]![axis]!,
          time,
          fps,
        ),
      ) as Point,
  );
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
          axis,
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
  if (!isKeyed(value)) {
    const start = value.firstVertex ?? 0;
    if (!start) return structuredClone(value);
    const rotated = (points: Point[]) =>
      points.map(
        (_, index) => [...points[(index + start) % points.length]!] as Point,
      );
    return {
      closed: value.closed,
      vertices: rotated(value.vertices),
      ...(value.inTangents ? { inTangents: rotated(value.inTangents) } : {}),
      ...(value.outTangents ? { outTangents: rotated(value.outTangents) } : {}),
    };
  }
  const first = value.keys[0]!.value as BezierPath;
  const points = (field: "vertices" | "inTangents" | "outTangents") =>
    first.vertices.map(
      (_, vertex) =>
        [0, 1].map((axis) =>
          channel(
            value,
            value.keys,
            `${field}${vertex}.${axis}`,
            (k) => {
              const keyPath = k.value as BezierPath;
              const aligned =
                (vertex + (keyPath.firstVertex ?? 0)) % keyPath.vertices.length;
              return keyPath[field]?.[aligned]?.[axis] ?? 0;
            },
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
