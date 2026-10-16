import {
  MechanismSceneV2Schema,
  type MechanismMesh,
  type MechanismSceneV2,
} from "@still-shift/scene-contract";
import { createMechanismPrimitiveMesh } from "./primitive-mesh.ts";
import { mechanismPackHash, offsetPackMesh } from "./pack-support.ts";
type Point = [number, number];
export type NotchedLineDimensions = {
  armLength: number;
  armWidth: number;
  lineRadius: number;
};

/** Tangent facets include a horizontal contact facet. A small outward margin
 * protects the other facets from Float32 position rounding during triangulation. */
function upperJawProfile({
  armLength,
  lineRadius: radius,
}: NotchedLineDimensions): Point[] {
  const scale = armLength / 6,
    tip = -3.2 * scale,
    center = tip + 0.3 * scale,
    gap = radius / 2;
  const margin = 1e-5;
  const notch: Point[] = [[center + (Math.sqrt(3) * radius) / 2 + margin, gap]];
  for (let degrees = 35; degrees <= 145; degrees += 10) {
    const angle = (degrees * Math.PI) / 180,
      vertexRadius = (radius + margin) / Math.cos(Math.PI / 36);
    notch.push([
      center + vertexRadius * Math.cos(angle),
      degrees === 85 || degrees === 95
        ? radius
        : vertexRadius * Math.sin(angle),
    ]);
  }
  notch.push([center - (Math.sqrt(3) * radius) / 2 - margin, gap]);
  return [
    [tip, gap],
    [tip, 0.82],
    [-0.8 * scale, 0.92],
    [2.8 * scale, 0.8 * scale],
    [2.8 * scale, 0.55 * scale],
    [0.5 * scale, 0.23],
    [0.35 * scale, 0.43],
    [-0.05 * scale, 0.46],
    [-0.3 * scale, 0.35],
    [-0.5 * scale, 0.2],
    [-1.45 * scale, 0.2],
    [-1.6 * scale, 0.32],
    [-1.9 * scale, 0.32],
    [-2.1 * scale, gap],
    ...notch,
  ];
}
function axialLineMesh(
  dimensions: NotchedLineDimensions,
  center: number,
): MechanismMesh {
  const mesh = createMechanismPrimitiveMesh({
    id: "line.round",
    partId: "line",
    materialId: "line",
    kind: "cylinder",
    radiusTop: dimensions.lineRadius,
    radiusBottom: dimensions.lineRadius,
    height: dimensions.armWidth + 0.7,
    radialSegments: 64,
  });
  const rotate = (values: number[]) =>
    values.flatMap((_, index) =>
      index % 3 === 0
        ? [values[index]!, values[index + 2]!, -values[index + 1]!]
        : [],
    );
  const rotated = {
    ...mesh,
    positions: rotate(mesh.positions),
    normals: rotate(mesh.normals),
    bounds: {
      min: [mesh.bounds.min[0], mesh.bounds.min[2], -mesh.bounds.max[1]] as [
        number,
        number,
        number,
      ],
      max: [mesh.bounds.max[0], mesh.bounds.max[2], -mesh.bounds.min[1]] as [
        number,
        number,
        number,
      ],
    },
  };
  return offsetPackMesh(rotated, [center, 0, 0]);
}
export function createNotchedLineScene(
  base: MechanismSceneV2,
  dimensions: NotchedLineDimensions,
): MechanismSceneV2 {
  const scene = structuredClone(base),
    profile = upperJawProfile(dimensions),
    center = (-2.9 * dimensions.armLength) / 6,
    radius = dimensions.lineRadius;
  scene.id = "clothespeg-notched-line-pack";
  scene.parts = scene.parts.filter((part) => part.id !== "cloth");
  scene.parts.push({
    id: "line",
    parent: "model",
    visible: true,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      pivot: [0, 0, 0],
    },
  });
  scene.geometry.meshes = scene.geometry.meshes.filter(
    (mesh) => !["upper.arm", "lower.arm", "cloth.contact"].includes(mesh.id),
  );
  for (const [part, sign] of [
    ["upper", 1],
    ["lower", -1],
  ] as const) {
    const mesh = createMechanismPrimitiveMesh({
      id: part + ".arm",
      partId: part,
      materialId: "wood",
      kind: "extruded-profile",
      points: profile.map(([x, y]) => [x, sign * y]),
      depth: dimensions.armWidth,
    });
    scene.geometry.meshes.push(
      offsetPackMesh(mesh, [0, 0, -dimensions.armWidth / 2]),
    );
  }
  scene.geometry.meshes.push(axialLineMesh(dimensions, center));
  scene.geometry.materials = scene.geometry.materials.map((material) =>
    material.id === "cloth" ? { ...material, id: "line" } : material,
  );
  scene.anchors = scene.anchors.filter(
    (anchor) => !anchor.id.startsWith("cloth."),
  );
  for (const [side, sign] of [
    ["upper", 1],
    ["lower", -1],
  ] as const) {
    for (const owner of [side, "line"]) {
      const id = owner === side ? side + ".line" : "line." + side;
      scene.anchors.push({
        id,
        role: "contact",
        source: {
          kind: "part-local",
          part: owner,
          position: [center, sign * radius, 0],
        },
      });
    }
  }
  scene.anchors.push({
    id: "line.front",
    role: "camera-target",
    source: {
      kind: "part-local",
      part: "line",
      position: [center, 0, (dimensions.armWidth + 0.7) / 2],
    },
  });
  scene.relationships = scene.relationships.filter(
    (relationship) => !relationship.id.includes(".cloth."),
  );
  for (const [side, sign] of [
    ["upper", 1],
    ["lower", -1],
  ] as const)
    scene.relationships.push({
      id: side + ".line.gap",
      type: "signed-gap",
      anchors: ["line." + side, side + ".line"],
      axisPart: "model",
      axis: [0, sign, 0],
      range: [0, 2],
      tolerance: 1e-8,
    });
  scene.geometrySha256 = mechanismPackHash(scene.geometry);
  return MechanismSceneV2Schema.parse(scene);
}
