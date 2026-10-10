import type {
  Native3DSource,
  NativeSceneFrame,
  NativeScreenAnchor,
  MechanismVector,
  MechanismMaterial,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { transformPoint } from "../mechanism/matrix.ts";

export const NATIVE_ANCHOR_ENDPOINT_EPSILON = 0.0001;
type Vec = readonly number[];
const sub = (a: Vec, b: Vec): MechanismVector => [
  a[0]! - b[0]!,
  a[1]! - b[1]!,
  a[2]! - b[2]!,
];
const dot = (a: Vec, b: Vec) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: Vec, b: Vec): MechanismVector => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];

/** Möller–Trumbore in source world units, preserving authored front-side winding. */
function triangleDistance(
  origin: Vec,
  direction: Vec,
  a: Vec,
  b: Vec,
  c: Vec,
  side: "front" | "double",
): number | null {
  const edge1 = sub(b, a),
    edge2 = sub(c, a),
    p = cross(direction, edge2),
    determinant = dot(edge1, p);
  if (determinant === 0 || (side === "front" && determinant < 0)) return null;
  const inverse = 1 / determinant,
    offset = sub(origin, a),
    u = dot(offset, p) * inverse;
  if (u < -1e-12 || u > 1 + 1e-12) return null;
  const q = cross(offset, edge1),
    v = dot(direction, q) * inverse;
  if (v < -1e-12 || u + v > 1 + 1e-12) return null;
  const distance = dot(edge2, q) * inverse;
  return distance >= 0 && Number.isFinite(distance) ? distance : null;
}
const materialSurvives = (material: DeepReadonly<MechanismMaterial>) =>
  material.alphaMode !== "mask" || material.opacity >= material.alphaCutoff;

/** Physical catalogue only: floors and anchor-owning parts participate, graphics do not. */
export function nativeScreenAnchors(
  source: DeepReadonly<Native3DSource>,
  frame: NativeSceneFrame,
): Record<string, NativeScreenAnchor> {
  const camera = frame.camera,
    forwardRaw = sub(camera.target, camera.position),
    forwardLength = Math.hypot(...forwardRaw);
  const forward = forwardRaw.map((value) => value / forwardLength);
  const materials = new Map(
    source.geometry.materials.map((material) => [material.id, material]),
  );
  // A call owns one bounded pose. Shared indices and other anchors reuse the
  // exact double-precision transform; no data survives a frame or source edit.
  const worldVertices = new Map<
    (typeof source.geometry.meshes)[number],
    (MechanismVector | undefined)[]
  >();
  return Object.fromEntries(
    Object.entries(frame.anchors).map(([id, anchor]) => {
      let visibility: NativeScreenAnchor["visibility"] =
        anchor.projectionVisibility === "in-frame"
          ? "visible"
          : anchor.projectionVisibility;
      let occluderMesh: string | undefined;
      if (visibility === "visible") {
        const segment = sub(anchor.world, camera.position),
          distance = Math.hypot(...segment),
          direction = segment.map((value) => value / distance);
        let closest = distance - NATIVE_ANCHOR_ENDPOINT_EPSILON;
        for (const mesh of source.geometry.meshes) {
          const part = frame.parts[mesh.partId]!;
          if (!part.visible) continue;
          for (let offset = 0; offset < mesh.indices.length; offset += 3) {
            const group = mesh.groups?.find(
              (entry) =>
                offset >= entry.start && offset < entry.start + entry.count,
            );
            const material = group
              ? source.geometry.materials[group.materialIndex]!
              : materials.get(mesh.materialId)!;
            if (!materialSurvives(material)) continue;
            let transformed = worldVertices.get(mesh);
            if (!transformed) {
              transformed = new Array(mesh.positions.length / 3);
              worldVertices.set(mesh, transformed);
            }
            const meshVertices = transformed;
            const vertices = [0, 1, 2].map((index) => {
              const vertexIndex = mesh.indices[offset + index]!;
              const existing = meshVertices[vertexIndex];
              if (existing) return existing;
              const vertex = vertexIndex * 3;
              const point = transformPoint(
                part.worldMatrix,
                mesh.positions.slice(vertex, vertex + 3),
              );
              meshVertices[vertexIndex] = point;
              return point;
            });
            const hit = triangleDistance(
              camera.position,
              direction,
              vertices[0]!,
              vertices[1]!,
              vertices[2]!,
              material.side,
            );
            if (hit === null || hit >= closest) continue;
            const hitDepth = hit * dot(direction, forward);
            if (hitDepth < camera.near || hitDepth > camera.far) continue;
            closest = hit;
            occluderMesh = mesh.id;
          }
        }
        if (occluderMesh !== undefined) visibility = "occluded";
      }
      return [
        id,
        {
          ...anchor,
          visibility,
          visibilityMethod: "native-physical-mesh-segment" as const,
          ...(occluderMesh === undefined ? {} : { occluderMesh }),
        },
      ];
    }),
  );
}
