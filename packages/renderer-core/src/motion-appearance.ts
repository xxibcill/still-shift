import type { StoryRenderScene } from "./story-scene.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { SpatialPath } from "../../scene-contract/src/motion-craft.ts";
import { sampleCurve } from "./curve.ts";
import { easeMotion } from "./motion-easing.ts";
import { path as sampleBezierPath } from "./composition/evaluate/sample.ts";
import { flattenBezier } from "./composition/shapes/path.ts";
import type { BezierPath, Keyed } from "@still-shift/scene-contract";

type Point = [number, number];
type Morph = NonNullable<StoryRenderScene["pathMorphs"]>[number];
const richMorphs = new WeakMap<Morph, Keyed<BezierPath>>();

function richMorphPath(morph: Morph, frame: number, fps: number): Point[] {
  let value = richMorphs.get(morph);
  if (!value) {
    value = {
      keys: morph.keys.map((key) => ({
        frame: key.frame,
        ...(key.easing !== undefined ? { easing: key.easing } : {}),
        value: {
          closed: key.closed ?? false,
          vertices: key.points,
          ...(key.firstVertex !== undefined
            ? { firstVertex: key.firstVertex }
            : {}),
          ...(key.inTangents ? { inTangents: key.inTangents } : {}),
          ...(key.outTangents ? { outTangents: key.outTangents } : {}),
        },
      })),
    };
    richMorphs.set(morph, value);
  }
  return flattenBezier(sampleBezierPath(value, frame, fps));
}
export function interpolateColor(a: string, b: string, t: number) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const lab = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) =>
        v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
      ) as [number, number, number];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
      m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
      s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const start = lab(a),
    end = lab(b),
    [L, A, B] = start.map((v, i) => v + (end[i]! - v) * t) as [
      number,
      number,
      number,
    ];
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3,
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3,
    s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return (
    "#" +
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
      .map((v) =>
        Math.round(
          255 *
            Math.max(
              0,
              Math.min(
                1,
                v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055,
              ),
            ),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function cubicPoint(
  [a, b, c, d]: SpatialPath["segments"][number],
  t: number,
): Point {
  return [0, 1].map(
    (i) =>
      (1 - t) ** 3 * a[i]! +
      3 * (1 - t) ** 2 * t * b[i]! +
      3 * (1 - t) * t * t * c[i]! +
      t ** 3 * d[i]!,
  ) as Point;
}
const arcTables = new WeakMap<
  SpatialPath,
  { points: Point[]; lengths: number[]; total: number }
>();
export function sampleSpatialPath(path: SpatialPath, progress: number) {
  let table = arcTables.get(path);
  if (!table) {
    const points = [
      path.segments[0]![0],
      ...path.segments.flatMap((segment) =>
        Array.from({ length: 128 }, (_, i) =>
          cubicPoint(segment, (i + 1) / 128),
        ),
      ),
    ];
    const lengths = [0];
    points
      .slice(1)
      .forEach((p, i) =>
        lengths.push(
          lengths[i]! + Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]),
        ),
      );
    table = { points, lengths, total: lengths.at(-1)! };
    arcTables.set(path, table);
  }
  const distance = Math.max(0, Math.min(1, progress)) * table.total;
  let index = table.lengths.findIndex((l, i) => i > 0 && l >= distance);
  if (index < 1) index = table.lengths.length - 1;
  const a = table.points[index - 1]!,
    b = table.points[index]!,
    delta = table.lengths[index]! - table.lengths[index - 1]!;
  const t = delta > 0 ? (distance - table.lengths[index - 1]!) / delta : 0;
  return {
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Point,
    rotation: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
  };
}
export function evaluateMotionAppearance(
  scene: StoryRenderScene | CommerceRenderScene,
  node: PreparedNode,
  frame: number,
): PreparedNode {
  if (!scene.motionModel) return node;
  let result = { ...node };
  if (scene.schemaVersion === "story-scene-1")
    for (const move of scene.recipe.moves
      .filter((m) => m.node === node.id)
      .sort(
        (a, b) =>
          (a.window?.start ?? a.keys?.[0]?.frame ?? 0) -
          (b.window?.start ?? b.keys?.[0]?.frame ?? 0),
      ))
      for (const property of ["fill", "stroke", "color"] as const) {
        const base = (result as unknown as Record<string, unknown>)[property];
        if (typeof base !== "string") continue;
        const keys =
          move.keys
            ?.filter((k) => k[property] !== undefined)
            .map((k) => ({
              frame: k.frame,
              value: k[property]!,
              easing: k.easing,
            })) ??
          (move.to?.[property] && move.window
            ? [
                {
                  frame: move.window.start,
                  value: base,
                  easing: move.window.easing,
                },
                {
                  frame: move.window.end,
                  value: move.to[property]!,
                  easing: move.window.easing,
                },
              ]
            : []);
        if (!keys.length || frame < keys[0]!.frame) continue;
        const end = keys.findIndex((k) => k.frame > frame);
        const value =
          end < 0
            ? keys.at(-1)!.value
            : interpolateColor(
                keys[end - 1]!.value,
                keys[end]!.value,
                easeMotion(
                  (frame - keys[end - 1]!.frame) /
                    (keys[end]!.frame - keys[end - 1]!.frame),
                  keys[end]!.easing,
                  (keys[end]!.frame - keys[end - 1]!.frame) / scene.fps,
                ),
              );
        const weight = move.weight ?? move.window?.weight;
        const mix = weight
          ? Math.max(
              0,
              Math.min(
                1,
                sampleCurve(
                  weight.map(({ frame, ...key }) => ({ ...key, time: frame })),
                  frame,
                  scene.fps,
                ),
              ),
            )
          : 1;
        result = { ...result, [property]: interpolateColor(base, value, mix) };
      }
  if (result.type === "path")
    return sampleMotionPath(
      result,
      scene.spatialPaths?.find((p) => p.node === node.id),
      scene.pathMorphs?.find((m) => m.node === node.id),
      frame,
      scene.fps,
    );
  return result;
}

/** Shared local geometry primitive; transforms and scene evaluation stay with the caller. */
export function sampleMotionPath(
  node: Extract<PreparedNode, { type: "path" }>,
  path: SpatialPath | undefined,
  morph: NonNullable<StoryRenderScene["pathMorphs"]>[number] | undefined,
  frame: number,
  fps: number,
): Extract<PreparedNode, { type: "path" }> {
  let result = node;
  if (path)
    result = {
      ...result,
      points: [
        path.segments[0]![0],
        ...path.segments.flatMap((segment) =>
          Array.from({ length: 128 }, (_, i) =>
            cubicPoint(segment, (i + 1) / 128),
          ),
        ),
      ],
    };
  if (morph) {
    if (
      morph.keys.some(
        (key) =>
          key.closed !== undefined ||
          key.firstVertex !== undefined ||
          key.inTangents ||
          key.outTangents,
      )
    )
      return { ...result, points: richMorphPath(morph, frame, fps) };
    const end = morph.keys.findIndex((k) => k.frame > frame);
    if (end === 0) result = { ...result, points: morph.keys[0]!.points };
    else if (end < 0) result = { ...result, points: morph.keys.at(-1)!.points };
    else {
      const a = morph.keys[end - 1]!,
        b = morph.keys[end]!,
        t = easeMotion(
          (frame - a.frame) / (b.frame - a.frame),
          b.easing,
          (b.frame - a.frame) / fps,
        );
      result = {
        ...result,
        points: a.points.map((p, i) => [
          p[0] + (b.points[i]![0] - p[0]) * t,
          p[1] + (b.points[i]![1] - p[1]) * t,
        ]),
      };
    }
  }
  return result;
}
