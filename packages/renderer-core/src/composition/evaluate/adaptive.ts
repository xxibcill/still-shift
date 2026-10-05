import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { multiplyMatrix, type Matrix } from "../../node-transform.ts";
import type { EvaluatedLayerTree } from "./types.ts";

type Key = { frame: number; value: unknown; interpolation?: string };
const eligibility = new WeakMap<Composition, boolean>();
const identity: Matrix = [1, 0, 0, 1, 0, 0];

function keys(value: unknown): readonly Key[] {
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return Array.isArray(object.keys) ? (object.keys as Key[]) : [];
}
function keyed(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (keys(value).length > 0 ||
      Object.entries(value).some(
        ([field, child]) => field !== "metadata" && keyed(child),
      ))
  );
}
function linear(value: unknown): boolean {
  if (value === undefined || typeof value === "number" || Array.isArray(value))
    return true;
  if (!value || typeof value !== "object") return false;
  const channel = value as Record<string, unknown>,
    curve = keys(value);
  if (curve.length)
    return (
      curve.length <= 2 &&
      curve.every(
        (key, index) =>
          Object.keys(key).every((field) =>
            ["frame", "value", "interpolation"].includes(field),
          ) &&
          (index === 0 || key.interpolation === "linear"),
      )
    );
  return Object.keys(channel).every(
    (axis) => ["x", "y"].includes(axis) && linear(channel[axis]),
  );
}
function positionKeys(value: unknown): readonly Key[] {
  if (!value || typeof value !== "object") return [];
  const channel = value as Record<string, unknown>;
  return [...keys(value), ...keys(channel.x), ...keys(channel.y)];
}
function timedShape(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const content = value as Record<string, unknown>;
  return (
    content.type === "wiggle-paths" ||
    Object.entries(content).some(
      ([field, child]) => field !== "metadata" && timedShape(child),
    )
  );
}

/** Adaptive reduction is restricted to provable translation of static 2D pixels. */
function eligible(comp: Composition): boolean {
  const cached = eligibility.get(comp);
  if (cached !== undefined) return cached;
  const allowed =
    !comp.camera2d &&
    !(
      comp.drivers?.length ||
      comp.periodic?.length ||
      comp.behaviours?.length ||
      Object.keys(comp.expressions ?? {}).length
    ) &&
    [comp, ...(comp.precomps ?? [])].every(
      (scope) =>
        !scope.constraints?.length &&
        scope.layers.every((layer) => {
          if (
            !["solid", "image", "shape", "null", "group", "precomp"].includes(
              layer.type,
            ) ||
            layer.threeD ||
            layer.masks?.length ||
            layer.effects?.length ||
            layer.trackMatte ||
            layer.sampleTimes ||
            layer.posterizeFps ||
            layer.transform?.autoOrient ||
            !linear(layer.transform?.position)
          )
            return false;
          if (
            layer.type === "precomp" &&
            (layer.loop || !linear(layer.timeRemap))
          )
            return false;
          if (layer.type === "shape" && timedShape(layer.contents))
            return false;
          const affine = Object.fromEntries(
            Object.entries(layer.transform ?? {}).filter(
              ([field]) => field !== "position",
            ),
          );
          const appearance = Object.fromEntries(
            Object.entries(layer).filter(
              ([field]) =>
                !["metadata", "transform", "timeRemap"].includes(field),
            ),
          );
          return !keyed(affine) && !keyed(appearance);
        }),
    );
  eligibility.set(comp, allowed);
  return allowed;
}

type Probe = {
  matrix: Matrix;
  localTime: number;
  layer: CompositionLayer;
  scopeTime: number;
  scopeEnd: number;
};
function collect(
  comp: Composition,
  tree: EvaluatedLayerTree,
  parent: Matrix,
  route: string,
  result: Map<string, Probe>,
) {
  for (const state of tree.layers) {
    const matrix = multiplyMatrix(parent, state.screenMatrix),
      key = route + state.id;
    // Dependency clocks also matter: an ancestor entering a keyed segment can
    // change a child's speed even when the ancestor draws no pixels of its own.
    result.set(key, {
      matrix,
      localTime: state.time,
      layer: state.layer,
      scopeTime: state.exposure?.tree.time ?? tree.time,
      scopeEnd:
        (route === ""
          ? comp.frameCount
          : comp.precomps!.find((scope) => scope.id === tree.id)!.frameCount) -
        1,
    });
    if (state.precomp) collect(comp, state.precomp, matrix, key + "/", result);
  }
}
function crossesKey(a: Probe, b: Probe): boolean {
  const low = Math.min(a.localTime, b.localTime),
    high = Math.max(a.localTime, b.localTime);
  const curve = [
    ...positionKeys(a.layer.transform?.position),
    ...(a.layer.type === "precomp" ? keys(a.layer.timeRemap) : []),
  ];
  const before = Math.min(a.scopeTime, b.scopeTime),
    after = Math.max(a.scopeTime, b.scopeTime);
  if (before !== after && (before === 0 || after === a.scopeEnd)) return true;
  return (
    low !== high && curve.some((key) => key.frame >= low && key.frame <= high)
  );
}

/** Fixed probes, no previous-frame history, randomness or wall-clock measurements. */
export function adaptiveExposureSamples(
  comp: Composition,
  times: readonly number[],
  sample: (time: number) => EvaluatedLayerTree,
): number {
  const cap = comp.motionBlur!.samples;
  if (!eligible(comp)) return cap;
  let previous: Map<string, Probe> | undefined,
    previousTime = times[0]!,
    velocity = 0;
  for (const time of times) {
    const current = new Map<string, Probe>();
    collect(comp, sample(time), identity, "", current);
    if (previous)
      for (const [key, a] of previous) {
        const b = current.get(key)!;
        if (
          crossesKey(a, b) ||
          a.matrix.slice(0, 4).some((v, i) => v !== b.matrix[i])
        )
          return cap;
        const dt = Math.abs(time - previousTime);
        if (dt)
          velocity = Math.max(
            velocity,
            Math.hypot(b.matrix[4] - a.matrix[4], b.matrix[5] - a.matrix[5]) /
              dt,
          );
      }
    previous = current;
    previousTime = time;
  }
  return velocity === 0
    ? 1
    : Math.min(
        cap,
        Math.max(
          2,
          Math.ceil(
            Math.max(
              0,
              (velocity * comp.motionBlur!.shutterAngle) / 360 - 1e-7,
            ),
          ) + 1,
        ),
      );
}
