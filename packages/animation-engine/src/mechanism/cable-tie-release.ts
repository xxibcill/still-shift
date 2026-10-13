import {
  MechanismSceneV2Schema,
  type MechanismSceneV2,
  type MechanismMesh,
} from "@still-shift/scene-contract";
import {
  createPackTeachingShape,
  offsetPackMesh,
  mechanismPackHash,
} from "./pack-support.ts";
import { createMechanismPrimitiveMesh } from "./primitive-mesh.ts";
import type { CableTiePackParameters } from "./cable-tie-pack.ts";
function insideFace(mesh: MechanismMesh): MechanismMesh {
  return {
    ...mesh,
    positions: mesh.positions.map((value, index) =>
      index % 3 === 0 ? value : -value,
    ),
    normals: mesh.normals.map((value, index) =>
      index % 3 === 0 ? value : -value,
    ),
    bounds: {
      min: [mesh.bounds.min[0], -mesh.bounds.max[1], -mesh.bounds.max[2]],
      max: [mesh.bounds.max[0], -mesh.bounds.min[1], -mesh.bounds.min[2]],
    },
  };
}
export function createReleasableCableScene(
  base: MechanismSceneV2,
  parameters: CableTiePackParameters,
): MechanismSceneV2 {
  const scene = structuredClone(base),
    original = scene.teachingShapes[0];
  if (!original || original.generator !== "fixed-root-pawl-curve-1")
    throw Error(
      "Release candidate requires the original fixed-root pawl generator",
    );
  const pawl = createPackTeachingShape(
    {
      ...original,
      parameters: {
        ...original.parameters,
        trigger: {
          length: 0.55,
          width: parameters.strapWidth * 1.1,
          segments: 4,
        },
      },
    },
    "nylon",
    { generator: "fixed-root-pawl-curve-1", deflection: 0 },
  );
  scene.id = "cable-tie-inside-release-pack";
  scene.teachingShapes = [pawl.declaration];
  scene.geometry.meshes = scene.geometry.meshes
    .filter(
      (mesh) => !["pawl.mesh", "head.base", "head.back"].includes(mesh.id),
    )
    .map((mesh) => (mesh.partId === "strap" ? insideFace(mesh) : mesh));
  scene.geometry.meshes.push(pawl.mesh);
  for (const [id, size, position] of [
    [
      "head.base",
      [1.95, 0.25, parameters.strapWidth + 0.55],
      [-0.825, -0.32, 0],
    ],
    [
      "head.back",
      [1.95, 1.2, 0.25],
      [-0.825, 0.3, -parameters.strapWidth / 2 - 0.15],
    ],
  ] as const)
    scene.geometry.meshes.push(
      offsetPackMesh(
        createMechanismPrimitiveMesh({
          id,
          partId: "head",
          materialId: "nylon",
          kind: "rounded-box",
          size: [...size],
          radius: 0.08,
          segments: 2,
        }),
        [...position],
      ),
    );
  scene.parts.find((part) => part.id === "head")!.transform.rotation = [
    Math.PI,
    0,
    0,
  ];
  const ratchet = scene.rigs.find((rig) => rig.id === "ratchet");
  if (!ratchet || ratchet.type !== "ratchet")
    throw Error("Release candidate requires the declared ratchet");
  ratchet.releasePolicy = "teaching-release";
  const datum = scene.anchors.find(
    (anchor) => anchor.id === "strap.tooth.datum",
  )!;
  if (datum.source.kind !== "part-local")
    throw Error("Tooth datum must be rigid");
  datum.source.position[1] *= -1;
  scene.anchors.push({
    id: "release.trigger",
    role: "proof-target",
    source: { kind: "shape-landmark", shape: "pawl", landmark: "trigger" },
  });
  scene.parts.push({
    id: "bundle",
    parent: "model",
    visible: true,
    transform: {
      position: [0, 0, 0],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1, 1, 1],
      pivot: [0, 0, 0],
    },
  });
  const material = scene.geometry.materials[0]!;
  scene.geometry.materials.push({
    ...material,
    id: "cable",
    color: "#74888b",
    roughness: 0.8,
    metalness: 0,
  });
  for (let i = 0; i < 3; i++)
    scene.geometry.meshes.push(
      offsetPackMesh(
        createMechanismPrimitiveMesh({
          id: `bundle.cable.${i}`,
          partId: "bundle",
          materialId: "cable",
          kind: "cylinder",
          radiusTop: 0.24,
          radiusBottom: 0.24,
          height: parameters.strapWidth + 1.2,
          radialSegments: 24,
        }),
        [
          -(parameters.toothCount - 3) * parameters.pitch + (i - 1) * 0.65,
          0,
          0.85,
        ],
      ),
    );
  scene.geometrySha256 = mechanismPackHash(scene.geometry);
  scene.camera.position = [
    0,
    -5,
    -Math.max(10, (2 * parameters.toothCount + 5) * parameters.pitch * 1.2),
  ];
  scene.camera.target = [0, -0.2, 0];
  return MechanismSceneV2Schema.parse(scene);
}
