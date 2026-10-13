import { createMechanismPrimitiveMesh } from "./primitive-mesh.ts";
import { offsetPackMesh, mechanismPackHash } from "./pack-support.ts";
import {
  MechanismSceneV2Schema,
  type MechanismMesh,
  type MechanismSceneV2,
} from "@still-shift/scene-contract";
import type { TapeHookPackParameters } from "./tape-hook-pack.ts";

// Capsule polygons circumscribe the declared nominal opening, preserving the
// required end clearance after triangulation instead of shrinking it by facets.
type Point = [number, number];
function circle(x: number, radius: number): Point[] {
  return Array.from({ length: 24 }, (_, i) => [
    x + radius * Math.cos((i * Math.PI) / 12),
    radius * Math.sin((i * Math.PI) / 12),
  ]);
}
function slot(center: number, length: number, width: number): Point[] {
  const radius = width / (2 * Math.cos(Math.PI / 28)),
    straight = (length - width) / 2,
    points: Point[] = [];
  for (let i = 0; i <= 14; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 14;
    points.push([
      center + straight + radius * Math.cos(angle),
      radius * Math.sin(angle),
    ]);
  }
  for (let i = 0; i <= 14; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 14;
    points.push([
      center - straight + radius * Math.cos(angle),
      radius * Math.sin(angle),
    ]);
  }
  return points;
}
function subdivide(mesh: MechanismMesh, iterations = 2): MechanismMesh {
  const positions = [...mesh.positions],
    normals = [...mesh.normals],
    uvs = [...(mesh.uvs ?? [])];
  let indices = [...mesh.indices];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const midpoints = new Map<string, number>(),
      next: number[] = [];
    const midpoint = (a: number, b: number) => {
      const key = [Math.min(a, b), Math.max(a, b)].join(":");
      const existing = midpoints.get(key);
      if (existing !== undefined) return existing;
      const index = positions.length / 3;
      for (let j = 0; j < 3; j++) {
        positions.push((positions[a * 3 + j]! + positions[b * 3 + j]!) / 2);
        normals.push((normals[a * 3 + j]! + normals[b * 3 + j]!) / 2);
      }
      for (let j = 0; j < 2; j++)
        uvs.push((uvs[a * 2 + j]! + uvs[b * 2 + j]!) / 2);
      midpoints.set(key, index);
      return index;
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]!,
        b = indices[i + 1]!,
        c = indices[i + 2]!,
        ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    indices = next;
  }
  return { ...mesh, positions, normals, uvs, indices, groups: [] };
}
function curved(
  mesh: MechanismMesh,
  width: number,
  base: number,
): MechanismMesh {
  const data = subdivide(mesh),
    positions: number[] = [],
    normals: number[] = [],
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < data.positions.length; i += 3) {
    const x = data.positions[i]!,
      y = data.positions[i + 1]!,
      z = data.positions[i + 2]!,
      slope = (-0.6 * y) / (width * width);
    const point = [
      x,
      base + 0.075 * (1 - (4 * y * y) / (width * width)) + z,
      -y,
    ];
    const n = [
        data.normals[i]!,
        data.normals[i + 2]!,
        slope * data.normals[i + 2]! - data.normals[i + 1]!,
      ],
      length = Math.hypot(...n);
    positions.push(...point);
    normals.push(...n.map((v) => v / length));
    for (let j = 0; j < 3; j++) {
      min[j] = Math.min(min[j]!, point[j]!);
      max[j] = Math.max(max[j]!, point[j]!);
    }
  }
  return {
    ...data,
    positions,
    normals,
    bounds: {
      min: min as [number, number, number],
      max: max as [number, number, number],
    },
  };
}
export function createSlottedRetentionScene(
  base: MechanismSceneV2,
  parameters: TapeHookPackParameters,
): MechanismSceneV2 {
  const { hookThickness: h, bladeWidth: width, bladeLength } = parameters,
    scene = structuredClone(base);
  scene.id = "tape-slotted-retention-pack";
  const centers = [0.5, 1.2, 1.9],
    slotWidth = 0.23,
    upperRadius = 0.085,
    lowerRadius = 0.055,
    bladeHoleRadius = 0.06,
    headRadius = 0.17,
    endClearance = 0.012;
  const slotLength = h + 2 * (upperRadius + endClearance),
    frontWidth = width + 0.14,
    rearWidth = 0.62;
  const neck = createMechanismPrimitiveMesh({
    id: "hook-retention-neck",
    partId: "hook",
    materialId: "steel",
    kind: "extruded-profile",
    points: [
      [-h, -frontWidth / 2],
      [0.12, -frontWidth / 2],
      [2.55, -rearWidth / 2],
      [2.55, rearWidth / 2],
      [0.12, frontWidth / 2],
      [-h, frontWidth / 2],
    ],
    holes: centers.map((c) => slot(c - h / 2, slotLength, slotWidth)),
    depth: 0.09,
  });
  const blade = createMechanismPrimitiveMesh({
    id: "blade-retention-curved",
    partId: "blade",
    materialId: "blade",
    kind: "extruded-profile",
    points: [
      [h + 0.025, -width / 2],
      [h + 0.025 + bladeLength, -width / 2],
      [h + 0.025 + bladeLength, width / 2],
      [h + 0.025, width / 2],
    ],
    holes: centers.map((c) => circle(c, bladeHoleRadius)),
    depth: 0.06,
  });
  const front = offsetPackMesh(
    createMechanismPrimitiveMesh({
      id: "hook-front",
      partId: "hook",
      materialId: "steel",
      kind: "rounded-box",
      size: [h, 1.65, frontWidth],
      radius: Math.min(0.015, h / 4),
      segments: 3,
    }),
    [-h / 2, 1.265, 0],
  );
  scene.geometry.meshes = scene.geometry.meshes.filter(
    (mesh) => !/^hook-|^rivet-|^blade-curved$/.test(mesh.id),
  );
  scene.geometry.meshes.push(
    curved(neck, width, 1.95),
    curved(blade, width, 1.85),
    front,
  );
  scene.anchors = scene.anchors.filter(
    (a) => !/^rivet\.(one|two)\.mount$/.test(a.id),
  );
  scene.relationships = scene.relationships.filter(
    (r) => !/^rivet\.(one|two)\.fixed$/.test(r.id),
  );
  centers.forEach((center, i) => {
    const components = [
      { name: "lower", radius: lowerRadius, height: 0.12, y: 1.925 },
      { name: "upper", radius: upperRadius, height: 0.14, y: 2.055 },
      { name: "top", radius: headRadius, height: 0.055, y: 2.145 },
      { name: "bottom", radius: headRadius, height: 0.045, y: 1.895 },
    ];
    for (const component of components) {
      const id = `retention.rivet.${i + 1}.${component.name}`;
      scene.parts.push({
        id,
        parent: "blade",
        visible: true,
        transform: {
          position: [center, component.y, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          pivot: [0, 0, 0],
        },
      });
      scene.geometry.meshes.push(
        createMechanismPrimitiveMesh({
          id: id + ".mesh",
          partId: id,
          materialId: "steel",
          kind: "cylinder",
          radiusTop: component.radius,
          radiusBottom: component.radius,
          height: component.height,
          radialSegments: 32,
        }),
      );
      scene.anchors.push({
        id: id + ".center",
        role: "proof-target",
        source: { kind: "part-local", part: id, position: [0, 0, 0] },
      });
      scene.relationships.push({
        id: id + ".fixed",
        type: "fixed-offset",
        anchors: ["model.origin", id + ".center"],
        referencePart: "model",
        offset: [center, component.y, 0],
        tolerance: 1e-8,
      });
    }
  });
  scene.geometrySha256 = mechanismPackHash(scene.geometry);
  return MechanismSceneV2Schema.parse(scene);
}
