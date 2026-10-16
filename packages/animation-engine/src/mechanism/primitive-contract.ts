import { z } from "zod";
import {
  MechanismIdSchema,
  MechanismMaterialSchema,
  checkUniqueIds,
  MECHANISM_LIMITS,
} from "@still-shift/scene-contract";

export const MECHANISM_PRIMITIVE_LIMITS = {
  vertices: MECHANISM_LIMITS.vertices,
  triangles: MECHANISM_LIMITS.triangles,
  workingBytes: 16 * 1024 ** 2,
  profilePoints: 64,
  holes: 8,
  holePoints: 32,
  pathPoints: 16,
} as const;
const distance = z.number().finite().min(0.001).max(1000);
const coordinate = z.number().finite().min(-1000).max(1000);
const point2 = z.tuple([coordinate, coordinate]);
const point3 = z.tuple([coordinate, coordinate, coordinate]);
const identity = {
  id: MechanismIdSchema,
  partId: MechanismIdSchema,
  materialId: MechanismIdSchema,
};
const profile = {
  points: z.array(point2).min(3).max(MECHANISM_PRIMITIVE_LIMITS.profilePoints),
  holes: z
    .array(z.array(point2).min(3).max(MECHANISM_PRIMITIVE_LIMITS.holePoints))
    .max(MECHANISM_PRIMITIVE_LIMITS.holes)
    .default([]),
  depth: distance,
  steps: z.number().int().min(1).max(8).default(1),
  bevel: z
    .object({
      size: distance,
      thickness: distance,
      segments: z.number().int().min(1).max(4).default(1),
    })
    .strict()
    .optional(),
};
export const MechanismPrimitiveInputSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...identity,
        kind: z.literal("rounded-box"),
        size: z.tuple([distance, distance, distance]),
        radius: z.number().finite().min(0).max(500),
        segments: z.number().int().min(1).max(8).default(3),
      })
      .strict(),
    z
      .object({
        ...identity,
        kind: z.literal("cylinder"),
        radiusTop: z.number().finite().min(0).max(1000),
        radiusBottom: z.number().finite().min(0).max(1000),
        height: distance,
        radialSegments: z.number().int().min(8).max(96).default(24),
        heightSegments: z.number().int().min(1).max(8).default(1),
      })
      .strict(),
    z
      .object({
        ...identity,
        kind: z.literal("torus"),
        radius: distance,
        tubeRadius: distance,
        radialSegments: z.number().int().min(6).max(32).default(12),
        tubularSegments: z.number().int().min(12).max(128).default(48),
      })
      .strict(),
    z
      .object({ ...identity, kind: z.literal("extruded-profile"), ...profile })
      .strict(),
    z
      .object({
        ...identity,
        kind: z.literal("swept-ribbon"),
        points: z
          .array(point3)
          .min(2)
          .max(MECHANISM_PRIMITIVE_LIMITS.pathPoints),
        width: distance,
        thickness: distance,
        segments: z.number().int().min(8).max(128).default(64),
      })
      .strict(),
    z
      .object({
        ...identity,
        kind: z.literal("coil"),
        radius: distance,
        wireRadius: distance,
        pitch: distance,
        turns: z.number().finite().min(0.5).max(12),
        radialSegments: z.number().int().min(6).max(32).default(12),
        tubularSegments: z.number().int().min(16).max(256).default(128),
      })
      .strict(),
  ])
  .superRefine((input, context) => {
    const fail = (message: string, path: (string | number)[]) =>
      context.addIssue({ code: z.ZodIssueCode.custom, message, path });
    if (
      input.kind === "rounded-box" &&
      input.radius >= Math.min(...input.size) / 2 &&
      input.radius !== 0
    )
      fail("Rounded radius must leave a positive planar span", ["radius"]);
    if (
      input.kind === "cylinder" &&
      input.radiusTop === 0 &&
      input.radiusBottom === 0
    )
      fail("Cylinder must have a nonzero end radius", ["radiusTop"]);
    if (input.kind === "torus" && input.tubeRadius >= input.radius)
      fail("Torus tube must leave an open central hole", ["tubeRadius"]);
    if (input.kind === "coil") {
      if (input.wireRadius >= input.radius)
        fail("Coil wire must leave an open central bore", ["wireRadius"]);
      if (input.pitch <= 2 * input.wireRadius)
        fail("Coil turns require clearance exceeding the wire diameter", [
          "pitch",
        ]);
      if (input.tubularSegments < Math.ceil(input.turns * 12))
        fail("Coil requires at least twelve segments per turn", [
          "tubularSegments",
        ]);
    }
    if (input.kind === "extruded-profile") validateProfile(input, fail);
    if (input.kind === "swept-ribbon") {
      if (
        input.points.length < 2 ||
        input.points.length > MECHANISM_PRIMITIVE_LIMITS.pathPoints
      )
        return;
      for (let i = 1; i < input.points.length; i++) {
        const span = Math.hypot(
          ...input.points[i]!.map((v, a) => v - input.points[i - 1]![a]!),
        );
        if (span <= Math.max(input.width, input.thickness) / 2)
          fail("Ribbon control spans must exceed half its cross section", [
            "points",
            i,
          ]);
        if (i > 1) {
          const left = input.points[i - 1]!.map(
              (v, a) => v - input.points[i - 2]![a]!,
            ),
            right = input.points[i]!.map(
              (v, a) => v - input.points[i - 1]![a]!,
            );
          const dot =
            left.reduce((sum, v, a) => sum + v * right[a]!, 0) /
            (Math.hypot(...left) * Math.hypot(...right));
          if (dot <= -0.95)
            fail("Ribbon cannot reverse through its previous span", [
              "points",
              i,
            ]);
        }
      }
    }
  });
export type MechanismPrimitiveInput = z.input<
  typeof MechanismPrimitiveInputSchema
>;
export type MechanismPrimitiveParameters = z.infer<
  typeof MechanismPrimitiveInputSchema
>;
export const MechanismPrimitiveGeometryInputSchema = z
  .object({
    meshes: z
      .array(MechanismPrimitiveInputSchema)
      .min(1)
      .max(MECHANISM_LIMITS.parts),
    materials: z
      .array(MechanismMaterialSchema)
      .min(1)
      .max(MECHANISM_LIMITS.materials),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.meshes.length < 1 ||
      value.meshes.length > MECHANISM_LIMITS.parts ||
      value.materials.length < 1 ||
      value.materials.length > MECHANISM_LIMITS.materials
    )
      return;
    checkUniqueIds(value.meshes, context, ["meshes"]);
    checkUniqueIds(value.materials, context, ["materials"]);
    const materials = new Set(value.materials.map((material) => material.id));
    value.meshes.forEach((mesh, i) => {
      if (!materials.has(mesh.materialId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["meshes", i, "materialId"],
          message: "Primitive material must belong to the supplied catalogue",
        });
    });
  });
export type MechanismPrimitiveGeometryInput = z.input<
  typeof MechanismPrimitiveGeometryInputSchema
>;
type Point = [number, number];
type Fail = (message: string, path: (string | number)[]) => void;
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(a: Point, b: Point, p: Point) {
  return (
    Math.abs(cross(a, b, p)) <= 1e-9 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-9 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-9 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}
function intersect(a: Point, b: Point, c: Point, d: Point) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
function contained(point: Point, loop: Point[]) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i]!,
      b = loop[j]!;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function loopsIntersect(a: Point[], b: Point[]) {
  return a.some((point, i) =>
    b.some((other, j) =>
      intersect(point, a[(i + 1) % a.length]!, other, b[(j + 1) % b.length]!),
    ),
  );
}
function validateLoop(loop: Point[], path: (string | number)[], fail: Fail) {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!,
      b = loop[(i + 1) % loop.length]!,
      previous = loop[(i + loop.length - 1) % loop.length]!;
    area += a[0] * b[1] - a[1] * b[0];
    if (Math.abs(cross(previous, a, b)) <= 1e-12)
      fail(
        "Profile vertices must be distinct and non-collinear at each corner",
        [...path, i],
      );
    for (let j = i + 2; j < loop.length; j++) {
      if (i === 0 && j === loop.length - 1) continue;
      if (intersect(a, b, loop[j]!, loop[(j + 1) % loop.length]!))
        fail("Profile loop cannot self-intersect", [...path, j]);
    }
  }
  if (Math.abs(area) <= 1e-12)
    fail("Profile loop must enclose nonzero area", path);
}
function validateProfile(
  input: Extract<MechanismPrimitiveParameters, { kind: "extruded-profile" }>,
  fail: Fail,
) {
  // Cardinality diagnostics already come from the schema; skip dirty arrays.
  if (
    input.points.length < 3 ||
    input.points.length > MECHANISM_PRIMITIVE_LIMITS.profilePoints ||
    input.holes.length > MECHANISM_PRIMITIVE_LIMITS.holes ||
    input.holes.some(
      (hole) =>
        hole.length < 3 || hole.length > MECHANISM_PRIMITIVE_LIMITS.holePoints,
    )
  )
    return;
  validateLoop(input.points, ["points"], fail);
  input.holes.forEach((hole, i) => {
    validateLoop(hole, ["holes", i], fail);
    if (
      !contained(hole[0]!, input.points) ||
      loopsIntersect(hole, input.points)
    )
      fail("Hole must lie strictly inside the outer profile", ["holes", i]);
    for (let j = 0; j < i; j++)
      if (
        loopsIntersect(hole, input.holes[j]!) ||
        contained(hole[0]!, input.holes[j]!) ||
        contained(input.holes[j]![0]!, hole)
      )
        fail("Holes cannot overlap or contain one another", ["holes", i]);
  });
  if (input.bevel && input.bevel.thickness >= input.depth / 2)
    fail("Bevel thickness must leave a positive straight extrusion span", [
      "bevel",
      "thickness",
    ]);
  if (input.bevel) validateBevelClearance(input, fail);
}
function pointSegmentDistance(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared,
          ),
        );
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}
function validateBevelClearance(
  input: Extract<MechanismPrimitiveParameters, { kind: "extruded-profile" }>,
  fail: Fail,
) {
  const loops = [input.points, ...input.holes],
    size = input.bevel!.size;
  const reject = () =>
    fail("Bevel size must leave positive corner and boundary clearance", [
      "bevel",
      "size",
    ]);
  for (let loopIndex = 0; loopIndex < loops.length; loopIndex++) {
    const loop = loops[loopIndex]!;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!,
        b = loop[(i + 1) % loop.length]!,
        previous = loop[(i + loop.length - 1) % loop.length]!;
      const left = [previous[0] - a[0], previous[1] - a[1]],
        right = [b[0] - a[0], b[1] - a[1]];
      const leftLength = Math.hypot(...left),
        rightLength = Math.hypot(...right);
      const angle = Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            (left[0]! * right[0]! + left[1]! * right[1]!) /
              (leftLength * rightLength),
          ),
        ),
      );
      if (size / Math.tan(angle / 2) >= Math.min(leftLength, rightLength) / 2)
        reject();
      for (
        let otherIndex = loopIndex;
        otherIndex < loops.length;
        otherIndex++
      ) {
        const other = loops[otherIndex]!;
        for (
          let j = otherIndex === loopIndex ? i + 2 : 0;
          j < other.length;
          j++
        ) {
          if (otherIndex === loopIndex && i === 0 && j === loop.length - 1)
            continue;
          const c = other[j]!,
            d = other[(j + 1) % other.length]!;
          const clearance = Math.min(
            pointSegmentDistance(a, c, d),
            pointSegmentDistance(b, c, d),
            pointSegmentDistance(c, a, b),
            pointSegmentDistance(d, a, b),
          );
          if (clearance <= 2 * size) reject();
        }
      }
    }
  }
}
export interface MechanismPrimitiveAdmission {
  version: "mechanism-primitive-admission-1";
  verticesUpperBound: number;
  trianglesUpperBound: number;
  workingBytesUpperBound: number;
  scope: "declared-geometry-number-storage-not-process-or-driver-rss";
}
export class MechanismPrimitiveAdmissionError extends Error {
  readonly code = "mechanism-primitive-budget";
  readonly path = ["geometry"];
}
/** Parse and bound all prospective topology before constructing Three geometry. */
export function admitMechanismPrimitive(input: MechanismPrimitiveInput) {
  const parameters = MechanismPrimitiveInputSchema.parse(input);
  let triangles: number;
  switch (parameters.kind) {
    case "rounded-box":
      triangles =
        parameters.radius === 0 ? 12 : 12 * (parameters.segments * 2 + 1) ** 2;
      break;
    case "cylinder":
      triangles =
        2 * parameters.radialSegments * (parameters.heightSegments + 1);
      break;
    case "torus":
      triangles = 2 * parameters.radialSegments * parameters.tubularSegments;
      break;
    case "extruded-profile": {
      const points =
        parameters.points.length +
        parameters.holes.reduce((sum, hole) => sum + hole.length, 0);
      const layers = parameters.steps + 2 * (parameters.bevel?.segments ?? 0);
      triangles = 2 * points * (layers + 1) + 4 * parameters.holes.length + 16;
      break;
    }
    case "swept-ribbon":
      triangles = 8 * parameters.segments + 16;
      break;
    case "coil":
      triangles =
        2 * parameters.radialSegments * (parameters.tubularSegments + 1);
      break;
  }
  // Prospective unindexed vertices plus conservative construction/serialization
  // copies of positions, normals, UVs and indices. SDK/driver RSS is separate.
  const vertices = triangles * 3,
    workingBytes = 65536 + (vertices * 8 + triangles * 3) * 48;
  if (
    vertices > MECHANISM_PRIMITIVE_LIMITS.vertices ||
    triangles > MECHANISM_PRIMITIVE_LIMITS.triangles ||
    workingBytes > MECHANISM_PRIMITIVE_LIMITS.workingBytes
  )
    throw new MechanismPrimitiveAdmissionError(
      "Primitive exceeds its prospective topology or declared working storage budget",
    );
  const admission: MechanismPrimitiveAdmission = {
    version: "mechanism-primitive-admission-1",
    verticesUpperBound: vertices,
    trianglesUpperBound: triangles,
    workingBytesUpperBound: workingBytes,
    scope: "declared-geometry-number-storage-not-process-or-driver-rss",
  };
  return { parameters, admission };
}
