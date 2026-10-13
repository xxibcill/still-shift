import {
  MechanismMaterialSchema,
  MechanismSceneV2Schema,
  type MechanismSceneV2,
} from "@still-shift/scene-contract";
import { createMechanismPrimitiveMesh } from "./primitive-mesh.ts";
import { mechanismPackHash, offsetPackMesh } from "./pack-support.ts";
export type IdealLeverDimensions = {
  armLength: number;
  armWidth: number;
  clothThickness: number;
};

export function createIdealLeverScene(
  base: MechanismSceneV2,
  dimensions: IdealLeverDimensions,
): MechanismSceneV2 {
  const scene = structuredClone(base),
    scale = dimensions.armLength / 6,
    halfGap = dimensions.clothThickness / 2,
    tip = -3.2 * scale;
  // Rear handle heights scale with its length so the full admitted opening keeps the handles apart.
  const profile: [number, number][] = [
    [tip, halfGap],
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
    [-2.1 * scale, halfGap],
  ];
  scene.id = "clothespeg-ideal-lever-pack";
  scene.geometry.meshes = scene.geometry.meshes.filter(
    (mesh) => !["upper.arm", "lower.arm"].includes(mesh.id),
  );
  for (const [part, sign] of [
    ["upper", 1],
    ["lower", -1],
  ] as const)
    scene.geometry.meshes.push(
      offsetPackMesh(
        createMechanismPrimitiveMesh({
          id: part + ".arm",
          partId: part,
          materialId: "wood",
          kind: "extruded-profile",
          points: profile.map(([x, y]) => [x, sign * y]),
          depth: dimensions.armWidth,
        }),
        [0, 0, -dimensions.armWidth / 2],
      ),
    );
  const slope = (0.8 * scale - 0.92) / (3.6 * scale),
    rotation = Math.atan(slope),
    width = dimensions.armWidth * 0.6;
  for (const [name, location, color] of [
    ["near", 1, "#397ea0"],
    ["far", 2.4, "#c96d3c"],
  ] as const) {
    const id = "press." + name,
      x = location * scale,
      y = 0.92 + slope * (x + 0.8 * scale);
    scene.geometry.materials.push(
      MechanismMaterialSchema.parse({
        id,
        color,
        roughness: 0.5,
        metalness: 0,
      }),
    );
    scene.geometry.meshes.push(
      offsetPackMesh(
        createMechanismPrimitiveMesh({
          id: id + ".mesh",
          partId: id,
          materialId: id,
          kind: "extruded-profile",
          points: [
            [-0.16 * scale, 0],
            [0.16 * scale, 0],
            [0.16 * scale, 0.1],
            [-0.16 * scale, 0.1],
          ],
          depth: width,
        }),
        [0, 0, -width / 2],
      ),
    );
    scene.parts.push({
      id,
      parent: "upper",
      visible: true,
      transform: {
        position: [x, y, 0],
        rotation: [0, 0, rotation],
        scale: [1, 1, 1],
        pivot: [0, 0, 0],
      },
    });
    scene.anchors.push(
      {
        id,
        role: "proof-target",
        source: { kind: "part-local", part: id, position: [0, 0.1, 0] },
      },
      {
        id: id + ".base",
        role: "proof-target",
        source: { kind: "part-local", part: id, position: [0, 0, 0] },
      },
      {
        id: id + ".mount",
        role: "proof-target",
        source: { kind: "part-local", part: "upper", position: [x, y, 0] },
      },
    );
    scene.relationships.push({
      id: id + ".attached",
      type: "coincident",
      anchors: [id + ".base", id + ".mount"],
      tolerance: 1e-8,
    });
  }
  scene.anchors.push({
    id: "lever.pivot",
    role: "proof-target",
    source: { kind: "part-local", part: "model", position: [0, 0, 0] },
  });
  scene.geometrySha256 = mechanismPackHash(scene.geometry);
  return MechanismSceneV2Schema.parse(scene);
}
