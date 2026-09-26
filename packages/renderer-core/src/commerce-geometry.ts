import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { CommerceGeometry } from "../../scene-contract/src/commerce-spatial.ts";
import { evaluatePreparedNodeAtTime } from "./prepared-scene.ts";
import {
  nodeMatrix,
  multiplyMatrix,
  transformPoint,
  inverseMatrix,
  imagePlacement,
  type Matrix,
  type Point,
} from "./node-transform.ts";
import type { ComponentBounds } from "./commerce-composition.ts";
export function worldMatrix(
  scene: CommerceRenderScene,
  node: PreparedNode,
  time: number,
): Matrix {
  const own = nodeMatrix(node, evaluatePreparedNodeAtTime(scene, node, time));
  if (!node.parent) return own;
  const parent = scene.nodes.find((n) => n.id === node.parent);
  if (!parent) throw new Error("Missing transform parent " + node.parent);
  return multiplyMatrix(worldMatrix(scene, parent, time), own);
}
function geometryFor(scene: CommerceRenderScene, id: string) {
  const geometry = scene.geometry?.find((g) => g.node === id),
    node = scene.nodes.find((n) => n.id === id);
  if (!geometry || node?.type !== "image")
    throw new Error("Missing product geometry " + id);
  const asset = scene.assets.find((a) => a.id === geometry.asset)!;
  const placement = imagePlacement(
    node,
    node.states[0]!.crop ?? [0, 0, asset.width, asset.height],
  );
  return { geometry, node, placement };
}
export function sourcePointToCanvas(
  scene: CommerceRenderScene,
  id: string,
  point: Point,
  time: number,
): Point {
  const { node, placement: p } = geometryFor(scene, id);
  return transformPoint(worldMatrix(scene, node, time), [
    p.x + ((point[0] - p.sx) * p.width) / p.sw,
    p.y + ((point[1] - p.sy) * p.height) / p.sh,
  ]);
}
export function resolveProductAnchor(
  scene: CommerceRenderScene,
  id: string,
  anchor: string,
  time: number,
): Point {
  const { geometry, placement: p, node } = geometryFor(scene, id),
    point = geometry.anchors[anchor];
  if (!point) throw new Error("Unknown product anchor " + anchor);
  const x = p.x + ((point[0] - p.sx) * p.width) / p.sw,
    y = p.y + ((point[1] - p.sy) * p.height) / p.sh;
  if (
    point[0] < p.sx ||
    point[0] > p.sx + p.sw ||
    point[1] < p.sy ||
    point[1] > p.sy + p.sh ||
    x < 0 ||
    y < 0 ||
    x > node.width ||
    y > node.height
  )
    throw new Error("Anchor lies outside visible crop: " + anchor);
  return sourcePointToCanvas(scene, id, point, time);
}
export function resolveProductBounds(
  scene: CommerceRenderScene,
  id: string,
  time: number,
) {
  const { geometry } = geometryFor(scene, id);
  return sourceBoxCorners(scene, id, geometry.visibleBounds, time);
}
function sourceBoxCorners(
  scene: CommerceRenderScene,
  id: string,
  [x, y, w, h]: CommerceGeometry["visibleBounds"],
  time: number,
): Point[] {
  return (
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ] as Point[]
  ).map((p) => sourcePointToCanvas(scene, id, p, time));
}
export function fitVisibleProduct(
  asset: { width: number; height: number },
  [x, y, w, h]: CommerceGeometry["visibleBounds"],
  box: ComponentBounds,
): ComponentBounds {
  if (
    ![x, y, w, h, box.x, box.y, box.width, box.height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    w <= 0 ||
    h <= 0 ||
    x + w > asset.width ||
    y + h > asset.height ||
    box.width <= 0 ||
    box.height <= 0
  )
    throw new Error("Invalid visible product bounds");
  const scale = Math.min(box.width / w, box.height / h);
  return {
    x: box.x + (box.width - w * scale) / 2 - x * scale,
    y: box.y + (box.height - h * scale) / 2 - y * scale,
    width: asset.width * scale,
    height: asset.height * scale,
  };
}
function crossesPolygon(a: Point, b: Point, polygon: Point[]) {
  // Clip a segment against a convex polygon, independent of winding.
  const area = polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const sign = Math.sign(area);
  let lower = 0,
    upper = 1;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!,
      q = polygon[(i + 1) % polygon.length]!;
    const side = (v: Point) =>
      sign * ((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]));
    const first = side(a),
      delta = side(b) - first;
    if (Math.abs(delta) < 1e-10) {
      if (first <= 0) return false;
      continue;
    }
    const cut = -first / delta;
    if (delta > 0) lower = Math.max(lower, cut);
    else upper = Math.min(upper, cut);
    if (lower >= upper) return false;
  }
  return lower < upper;
}
export function evaluateAttachedPath(
  scene: CommerceRenderScene,
  node: Extract<PreparedNode, { type: "path" }>,
  time: number,
) {
  const attachments =
    scene.attachments?.filter((a) => a.path === node.id) ?? [];
  if (!attachments.length) return node;
  const matrix = worldMatrix(scene, node, time),
    inverse = inverseMatrix(matrix);
  const points = node.points.map((p) => [...p] as Point);
  for (const a of attachments) {
    const source = resolveProductAnchor(scene, a.source, a.anchor, time);
    points[a.endpoint === "start" ? 0 : points.length - 1] = transformPoint(
      inverse,
      [source[0] + a.offset[0], source[1] + a.offset[1]],
    );
  }
  const world = points.map((p) => transformPoint(matrix, p));
  for (const a of attachments.filter((a) => a.protect)) {
    const { geometry } = geometryFor(scene, a.source);
    for (const box of geometry.protectedRegions) {
      const polygon = sourceBoxCorners(scene, a.source, box, time);
      if (world.slice(1).some((p, i) => crossesPolygon(world[i]!, p, polygon)))
        throw new Error(
          "Attached path crosses protected product region: " + node.id,
        );
    }
  }
  return { ...node, points };
}

/** Check every displayed frame plus exposure samples before enabling preview/export. Runtime checks cover arbitrary seeks. */
export function validateAttachedPaths(scene: CommerceRenderScene) {
  if (!scene.attachments?.length) return;
  const paths = scene.nodes.filter(
    (node): node is Extract<PreparedNode, { type: "path" }> =>
      node.type === "path" &&
      scene.attachments!.some((a) => a.path === node.id),
  );
  const blur = scene.effects?.find((e) => e.type === "motion-blur");
  const cuts = [
    0,
    scene.frameCount,
    ...(scene.visibility ?? []).flatMap((v) => [v.start, v.end]),
    ...(scene.effects ?? []).flatMap((e) =>
      e.active ? [e.active.start, e.active.end] : [],
    ),
  ];
  for (let frame = 0; frame < scene.frameCount; frame++) {
    const lower = Math.max(...cuts.filter((c) => c <= frame)),
      upper = Math.min(...cuts.filter((c) => c > frame));
    const samples = blur
      ? Array.from({ length: blur.samples }, (_, i) =>
          Math.max(
            lower,
            Math.min(
              scene.frameCount - 1,
              upper - 1e-7,
              frame +
                (((i + 0.5) / blur.samples - 0.5) * blur.shutterAngle) / 360,
            ),
          ),
        )
      : [frame];
    for (const time of samples)
      for (const path of paths) {
        let current: PreparedNode | undefined = path,
          visible = true;
        while (current) {
          if (evaluatePreparedNodeAtTime(scene, current, time).opacity <= 0) {
            visible = false;
            break;
          }
          current = scene.nodes.find((n) => n.id === current!.parent);
        }
        if (visible) evaluateAttachedPath(scene, path, time);
      }
  }
}
