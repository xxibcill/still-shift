import earcut, { deviation } from "earcut";
import type { Point } from "../../node-transform.ts";
import { contourArea, containsPoint, traceAlphaContours } from "./contours.ts";
import { triangleArea } from "./geometry.ts";
export { traceAlphaContours } from "./contours.ts";
export const MAX_MESH_VERTICES = 32768;
export const MAX_MESH_TRIANGLES = 65536;
export type MeshTopology = {
  vertices: Point[];
  indices: number[];
  contours: Point[][];
  pinVertices: number[];
};
export type AlphaMeshOptions = {
  alphaThreshold?: number;
  refinement?: number;
  pins?: readonly Point[];
};

/** Exact alpha-cell outline, ISC-licensed Earcut 3.0.2, fixed conforming refinement. */
export function alphaMesh(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: AlphaMeshOptions,
): MeshTopology {
  const refinement = options.refinement ?? 2;
  if (
    !Number.isInteger(refinement) ||
    refinement < 0 ||
    refinement > 3 ||
    (options.pins?.length ?? 0) > 32
  )
    throw Error("comp-mesh-topology: invalid refinement or pin count");
  const contours = traceAlphaContours(
    pixels,
    width,
    height,
    options.alphaThreshold ?? 1,
  );
  const mesh: MeshTopology = {
    vertices: [],
    indices: [],
    contours,
    pinVertices: [],
  };
  triangulateContours(mesh);
  for (const point of options.pins ?? [])
    mesh.pinVertices.push(insertPin(mesh, point));
  for (let pass = 0; pass < refinement; pass++) refine(mesh);
  return mesh;
}
function triangulateContours(mesh: MeshTopology) {
  const outlines = mesh.contours.map((points) => ({
    points,
    area: contourArea(points),
    holes: [] as Point[][],
  }));
  const outer = outlines.filter((outline) => outline.area > 0);
  for (const hole of outlines.filter((outline) => outline.area < 0)) {
    const owner = outer
      .filter(
        (outline) =>
          outline.area > -hole.area &&
          containsPoint(outline.points, hole.points[0]!),
      )
      .sort((a, b) => a.area - b.area)[0];
    if (!owner)
      throw Error("comp-mesh-alpha: a hole has no containing silhouette");
    owner.holes.push(hole.points);
  }
  for (const outline of outer) {
    const vertices = [...outline.points],
      holes: number[] = [];
    for (const hole of outline.holes) {
      holes.push(vertices.length);
      vertices.push(...hole);
    }
    const data = vertices.flat(),
      indices = earcut(data, holes, 2);
    const error = deviation(data, holes, 2, indices);
    if (!Number.isFinite(error) || error > 1e-10)
      throw Error(
        "comp-mesh-alpha: triangulation does not cover the alpha outline",
      );
    const base = mesh.vertices.length;
    mesh.vertices.push(...vertices);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]!,
        b = indices[i + 1]!,
        c = indices[i + 2]!;
      if (
        Math.abs(triangleArea(vertices[a]!, vertices[b]!, vertices[c]!)) < 1e-12
      )
        continue;
      mesh.indices.push(base + a, base + b, base + c);
    }
  }
}
function appendVertex(mesh: MeshTopology, point: Point): number {
  if (mesh.vertices.length >= MAX_MESH_VERTICES)
    throw Error(
      "comp-mesh-budget: vertex budget exceeded; reduce refinement or alpha complexity",
    );
  mesh.vertices.push(point);
  return mesh.vertices.length - 1;
}
function insertPin(mesh: MeshTopology, point: Point): number {
  if (!point.every(Number.isFinite))
    throw Error("comp-mesh-pin: nonfinite pin position");
  const existing = mesh.vertices.findIndex(
    (vertex) => Math.hypot(vertex[0] - point[0], vertex[1] - point[1]) < 1e-9,
  );
  if (existing >= 0) return existing;
  const result: number[] = [];
  let inserted = -1;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3),
      [a, b, c] = ids.map((id) => mesh.vertices[id]!) as [Point, Point, Point];
    const area = triangleArea(a, b, c);
    const weights = [
      triangleArea(point, b, c) / area,
      triangleArea(a, point, c) / area,
      triangleArea(a, b, point) / area,
    ];
    if (weights.some((weight) => weight < -1e-10)) {
      result.push(...ids);
      continue;
    }
    if (inserted < 0) inserted = appendVertex(mesh, [...point]);
    // Split every incident face for an on-edge pin, avoiding nonconforming T-junctions.
    for (let side = 0; side < 3; side++) {
      const first = ids[side]!,
        second = ids[(side + 1) % 3]!;
      if (
        Math.abs(
          triangleArea(mesh.vertices[first]!, mesh.vertices[second]!, point),
        ) >
        Math.abs(area) * 1e-10
      )
        result.push(first, second, inserted);
    }
  }
  if (inserted < 0)
    throw Error("comp-mesh-pin: rest pin is outside the alpha silhouette");
  if (result.length / 3 > MAX_MESH_TRIANGLES)
    throw Error("comp-mesh-budget: triangle budget exceeded");
  mesh.indices = result;
  return inserted;
}
function refine(mesh: MeshTopology) {
  if ((mesh.indices.length / 3) * 4 > MAX_MESH_TRIANGLES)
    throw Error(
      "comp-mesh-budget: triangle budget exceeded; reduce refinement or alpha complexity",
    );
  const midpoint = new Map<number, number>(),
    result: number[] = [];
  const middle = (a: number, b: number) => {
    const key = Math.min(a, b) * MAX_MESH_VERTICES + Math.max(a, b);
    const old = midpoint.get(key);
    if (old !== undefined) return old;
    const p = mesh.vertices[a]!,
      q = mesh.vertices[b]!;
    const index = appendVertex(mesh, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
    midpoint.set(key, index);
    return index;
  };
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!,
      b = mesh.indices[i + 1]!,
      c = mesh.indices[i + 2]!;
    const ab = middle(a, b),
      bc = middle(b, c),
      ca = middle(c, a);
    result.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  mesh.indices = result;
}
