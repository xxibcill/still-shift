import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  type PreparedNode,
} from "@still-shift/scene-contract";
import { evaluateMotionAppearance } from "../../motion-appearance.ts";
import type { Samples } from "./prepared.ts";

const values = <T extends z.ZodType>(value: T) =>
  z.array(value).min(1).max(COMPOSITION_LIMITS.maxKeys);
const color = values(z.string().regex(/^#[\da-fA-F]{6}$/));
const finite = values(z.number().finite());
export const AppearanceSchema = z
  .object({
    fill: color.optional(),
    stroke: color.optional(),
    color: color.optional(),
    strokeWidth: finite.optional(),
    trimStart: finite.optional(),
    trimEnd: finite.optional(),
    trimOffset: finite.optional(),
  })
  .strict();
export type Appearance = z.infer<typeof AppearanceSchema>;
type AppearanceSample = {
  [K in keyof Appearance]?: NonNullable<Appearance[K]>[number];
};

function compact<T>(values: T[]) {
  let end = values.length;
  while (end > 1 && values[end - 2] === values[end - 1]) end--;
  return values.slice(0, end);
}

/** Resolve authored paint interpolation once, alongside the existing transform samples. */
export function compileAppearance(
  scene: Parameters<typeof evaluateMotionAppearance>[0],
  node: PreparedNode,
  samples: Samples,
): Appearance | undefined {
  const result: Appearance = {};
  const paints =
    scene.schemaVersion === "story-scene-1" &&
    scene.motionModel &&
    scene.recipe.moves.some(
      (move) =>
        move.node === node.id &&
        [move.to, ...(move.keys ?? [])].some(
          (pose) =>
            pose &&
            (pose.fill !== undefined ||
              pose.stroke !== undefined ||
              pose.color !== undefined),
        ),
    );
  const painted = paints
    ? samples.map((_, frame) =>
        evaluateMotionAppearance(scene, node, samples.times?.[frame] ?? frame),
      )
    : [];
  for (const key of ["fill", "stroke", "color"] as const) {
    if (!(key in node)) continue;
    const base = (node as unknown as Record<string, string>)[key];
    const values = painted.map(
      (node) => (node as unknown as Record<string, string>)[key]!,
    );
    if (values.some((value) => value !== base)) result[key] = compact(values);
  }
  for (const key of [
    "strokeWidth",
    "trimStart",
    "trimEnd",
    "trimOffset",
  ] as const) {
    if (!samples.some((sample) => sample[key] !== undefined)) continue;
    if (key === "strokeWidth" && !["path", "rect"].includes(node.type))
      continue;
    if (key !== "strokeWidth" && node.type !== "path") continue;
    const base =
      key === "strokeWidth" && "lineWidth" in node
        ? node.lineWidth
        : key === "trimEnd"
          ? 1
          : 0;
    result[key] = compact(samples.map((sample) => sample[key] ?? base));
  }
  return Object.keys(result).length ? result : undefined;
}

export function appearanceAt(appearance: Appearance | undefined, time: number) {
  const frame = Math.max(0, Math.floor(time));
  return Object.fromEntries(
    Object.entries(appearance ?? {}).flatMap(([key, values]) =>
      values ? [[key, values[Math.min(frame, values.length - 1)]!]] : [],
    ),
  ) as AppearanceSample;
}

export function paintNode<T extends PreparedNode>(
  node: T,
  appearance: Appearance | undefined,
  time: number,
): T {
  if (!appearance) return node;
  const sampled = appearanceAt(appearance, time);
  return {
    ...node,
    ...(sampled.fill !== undefined ? { fill: sampled.fill } : {}),
    ...(sampled.stroke !== undefined ? { stroke: sampled.stroke } : {}),
    ...(sampled.color !== undefined ? { color: sampled.color } : {}),
    ...(sampled.strokeWidth !== undefined && "lineWidth" in node
      ? { lineWidth: sampled.strokeWidth, textureWidth: node.lineWidth }
      : {}),
  };
}
