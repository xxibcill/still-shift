import {
  inverseMatrix,
  transformPoint,
  type Matrix,
  type Point,
} from "../../node-transform.ts";
import type { EffectParameters } from "@still-shift/scene-contract";
import { alphaMesh } from "./topology.ts";
import {
  bezierMeshPoint,
  deformPuppetPoint,
  orderMeshTriangles,
  triangleFlips,
  type PuppetPin,
  type StarchRegion,
  type OverlapRegion,
} from "./geometry.ts";
export type DeformedMesh = {
  source: Point[];
  destination: Point[];
  indices: number[];
};
const points = (params: EffectParameters, name: string) =>
  params[name] as Point[];
const identity: Matrix = [1, 0, 0, 1, 0, 0];

/** Called inside the renderer's admitted geometry workspace. */
export function meshFrame(
  effect: string,
  params: EffectParameters,
  width: number,
  height: number,
  pixels?: Uint8Array,
  matrix: Matrix = identity,
): DeformedMesh {
  const mesh =
    effect === "distort.mesh-warp"
      ? bezierFrame(params, matrix)
      : puppetFrame(params, width, height, pixels!, matrix);
  // Validate the authored deformation before float/raster delivery can collapse faces.
  const flips = triangleFlips(mesh.source, mesh.destination, mesh.indices);
  if (flips.length)
    throw Error(
      `comp-mesh-flip: ${flips.length} flipped or collapsed triangles (first ${flips[0]}); reduce the pin/control deformation`,
    );
  for (const points of [mesh.source, mesh.destination])
    for (const point of points) {
      point[0] = Math.fround(point[0]);
      point[1] = Math.fround(point[1]);
    }
  const unchanged = mesh.source.every((point, i) =>
    point.every((value, axis) => value === mesh.destination[i]![axis]),
  );
  // Match the pinned renderer's 4-bit raster grid before either backend samples.
  for (const point of mesh.destination) {
    point[0] = Math.round(point[0] * 16) / 16;
    point[1] = Math.round(point[1] * 16) / 16;
  }
  // An identity mesh must still sample the original pixel centers after rounding.
  if (unchanged)
    for (let i = 0; i < mesh.source.length; i++) {
      mesh.source[i]![0] = mesh.destination[i]![0];
      mesh.source[i]![1] = mesh.destination[i]![1];
    }
  discardRasterDegenerates(mesh);
  return mesh;
}
/** Raster-only degeneracy is not an authored fold. Compact in stable draw order. */
function discardRasterDegenerates(mesh: DeformedMesh): void {
  const rejected = triangleFlips(mesh.source, mesh.destination, mesh.indices);
  let next = 0,
    kept = 0;
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    if (rejected[next] === offset / 3) {
      next++;
      continue;
    }
    for (let corner = 0; corner < 3; corner++)
      mesh.indices[kept++] = mesh.indices[offset + corner]!;
  }
  mesh.indices.length = kept;
}
function bezierFrame(params: EffectParameters, matrix: Matrix): DeformedMesh {
  const subdivisions = params.subdivisions as number,
    columns = params.columns as number,
    rows = params.rows as number;
  const controls = points(params, "controls"),
    origin = params.origin as Point,
    size = params.size as Point;
  const mesh: DeformedMesh = { source: [], destination: [], indices: [] };
  const place = ([x, y]: Point) =>
    transformPoint(matrix, [origin[0] + x * size[0], origin[1] + y * size[1]]);
  for (let y = 0; y <= subdivisions; y++)
    for (let x = 0; x <= subdivisions; x++) {
      const uv: Point = [x / subdivisions, y / subdivisions];
      mesh.source.push(place(uv));
      mesh.destination.push(
        place(bezierMeshPoint(uv, columns, rows, controls)),
      );
    }
  for (let y = 0; y < subdivisions; y++)
    for (let x = 0; x < subdivisions; x++) {
      const a = y * (subdivisions + 1) + x,
        b = a + 1,
        c = a + subdivisions + 1,
        d = c + 1;
      mesh.indices.push(a, b, d, a, d, c);
    }
  return mesh;
}
function puppetFrame(
  params: EffectParameters,
  width: number,
  height: number,
  pixels: Uint8Array,
  matrix: Matrix,
): DeformedMesh {
  const rest = points(params, "rest"),
    targets = points(params, "pins"),
    inverse = inverseMatrix(matrix);
  const topology = alphaMesh(pixels, width, height, {
    alphaThreshold: params.alphaThreshold as number,
    refinement: params.refinement as number,
    pins: rest.map((point) => transformPoint(matrix, point)),
  });
  const local = topology.vertices.map((point) =>
    transformPoint(inverse, point),
  );
  const pins: PuppetPin[] = rest.map((point, i) => ({
    rest: point,
    target: targets[i]!,
  }));
  const starch: StarchRegion[] = points(params, "starchCenters").map(
    (center, i) => ({
      center,
      radius: points(params, "starch")[i]![0],
      strength: points(params, "starch")[i]![1],
    }),
  );
  const overlap: OverlapRegion[] = points(params, "overlapCenters").map(
    (center, i) => ({
      center,
      radius: points(params, "overlap")[i]![0],
      depth: points(params, "overlap")[i]![1],
    }),
  );
  return {
    source: topology.vertices,
    destination: local.map((point) =>
      transformPoint(matrix, deformPuppetPoint(point, pins, starch)),
    ),
    indices: orderMeshTriangles(local, topology.indices, overlap),
  };
}
