import type { CompositionLayer } from "@still-shift/scene-contract";
import { color, scalar } from "./sample.ts";
import { worldPoint, type Matrix4, type Point3 } from "./spatial-geometry.ts";
import type { Rgba } from "./types.ts";

type LightLayer = Extract<CompositionLayer, { type: "light" }>;
export const FLAT_LIGHTING_VERSION = "flat-lighting-1";
export type SampledLight = {
  type: LightLayer["lightType"];
  intensity: number;
  range: number;
  falloffStart: number;
  innerCone: number;
  outerCone: number;
};
export type WorldLight = SampledLight & {
  id: string;
  color: Rgba;
  position: Point3;
  direction: Point3;
};

/** Controls use the same keyed clock as the receiver. Relations settle after all writers. */
export function sampleLight(layer: LightLayer, time: number, fps: number) {
  return {
    controls: {
      type: layer.lightType,
      intensity: scalar(layer.intensity, time, fps, 1),
      range: scalar(layer.range, time, fps, 1000),
      falloffStart: scalar(layer.falloffStart, time, fps, 0),
      innerCone: scalar(layer.innerCone, time, fps, 30),
      outerCone: scalar(layer.outerCone, time, fps, 60),
    } satisfies SampledLight,
    color: color(layer.color ?? "#ffffff", time, fps),
  };
}

export function validateLight(light: SampledLight, relations = true) {
  const bounds = {
    intensity: [0, 16],
    range: [0.001, 1_000_000],
    falloffStart: [0, 1_000_000],
    innerCone: [0, 180],
    outerCone: [0.001, 180],
  } as const;
  for (const name of Object.keys(bounds) as (keyof typeof bounds)[]) {
    const value = light[name],
      [low, high] = bounds[name];
    if (!Number.isFinite(value) || value < low || value > high)
      throw Error(`Light ${name} must be finite and within ${low}..${high}`);
  }
  if (!relations) return;
  if (light.type !== "ambient" && light.falloffStart >= light.range)
    throw Error("Light falloffStart must be less than range");
  if (light.type === "spot" && light.innerCone > light.outerCone)
    throw Error("Spot innerCone must not exceed outerCone");
}

const unit = (v: Point3): Point3 => {
  const n = Math.hypot(...v);
  return n > 1e-12 ? (v.map((x) => x / n) as Point3) : [0, 0, 0];
};
/** A single two-sided geometric normal; source artwork never supplies inferred detail. */
export function planeNormal(world: Matrix4): Point3 {
  const x = unit([world[0], world[1], world[2]]),
    y = unit([world[4], world[5], world[6]]);
  return unit([
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ]);
}

export function worldLight(
  id: string,
  light: SampledLight,
  rgba: Rgba,
  world: Matrix4,
): WorldLight {
  validateLight(light);
  return {
    ...light,
    id,
    color: [...rgba],
    position: worldPoint(world, [0, 0, 0]),
    direction: unit([world[8], world[9], world[10]]),
  };
}

const smooth = (a: number, b: number, value: number) => {
  if (a === b) return value >= b ? 1 : 0;
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const decodeLightColor = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
export const encodeLightColor = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;

/** Independent CPU reference of the versioned linear diffuse model, in authored light order. */
export function shadeFlatColor(
  source: Rgba,
  position: Point3,
  normal: Point3,
  lights: readonly WorldLight[],
): Rgba {
  if (!lights.length) return [...source];
  const sum = [0, 0, 0];
  for (const light of lights) {
    let weight = light.intensity * light.color[3];
    if (light.type !== "ambient") {
      const delta = position.map(
        (v, axis) => light.position[axis]! - v,
      ) as Point3;
      const distance = Math.hypot(...delta);
      if (distance >= light.range) continue;
      const direction =
        distance > 1e-12 ? (delta.map((v) => v / distance) as Point3) : normal;
      const angular = Math.abs(
        normal.reduce((n, v, i) => n + v * direction[i]!, 0),
      );
      weight *=
        angular * (1 - smooth(light.falloffStart, light.range, distance));
      if (light.type === "spot" && distance > 1e-12) {
        const cone = -light.direction.reduce(
          (n, v, i) => n + v * direction[i]!,
          0,
        );
        weight *= smooth(
          Math.cos((light.outerCone * Math.PI) / 360),
          Math.cos((light.innerCone * Math.PI) / 360),
          cone,
        );
      }
    }
    for (let c = 0; c < 3; c++)
      sum[c]! += decodeLightColor(light.color[c]!) * weight;
  }
  return [
    ...sum.map((v, c) =>
      encodeLightColor(
        Math.max(0, Math.min(1, decodeLightColor(source[c]!) * v)),
      ),
    ),
    source[3],
  ] as Rgba;
}
