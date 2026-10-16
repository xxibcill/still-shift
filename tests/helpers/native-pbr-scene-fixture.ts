import { decodeRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-import.ts";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import { rigidGltfFixture, glbBytes } from "./rigid-gltf-fixture.ts";
export function nativePbrSceneFixture() {
  const { document, binary } = rigidGltfFixture(),
    asset = decodeRigidGltf(glbBytes(document, binary), { format: "glb" });
  const geometry = {
    schemaVersion: "solid-geometry-2",
    images: [],
    materials: asset.materials.map(({ name: _name, ...material }) => ({
      ...material,
      schemaVersion: "native-pbr-material-1",
    })),
    meshes: asset.meshes.map(
      ({
        sourceNode: _node,
        sourceMesh: _mesh,
        sourcePrimitive: _primitive,
        dataSha256: _hash,
        ...mesh
      }) => mesh,
    ),
  };
  return {
    schemaVersion: "mechanism-scene-3",
    id: "imported.lever",
    coordinateSystem: "right-handed-y-up",
    units: { kind: "meter", scaleToMeters: 1 },
    seed: 7,
    geometry,
    geometrySha256: gltfJsonHash(geometry),
    parts: asset.parts,
    rigs: [
      {
        id: "lever.hinge",
        type: "hinge",
        movingPart: "node.1",
        referencePart: "node.0",
        axis: [0, 0, 1],
        pivot: [0, 2, 0],
        angleRange: [0, Math.PI / 2],
        neutralAngle: 0,
      },
    ],
    teachingShapes: [],
    resources: [],
    anchors: [
      {
        id: "lever.tip",
        role: "annotation",
        source: { kind: "part-local", part: "node.1", position: [0, 2, 0] },
      },
    ],
    relationships: [],
    camera: {
      position: [4.5, 3, 8],
      target: [4.5, 3, 0],
      up: [0, 1, 0],
      fovDegrees: 35,
      near: 0.01,
      far: 100,
    },
    profile: {
      toneMapping: "aces-filmic",
      output: "srgb-rgba8-straight",
      background: "#e3e1d8",
      transparent: true,
      environmentIntensity: 1,
      exposure: 1,
    },
    lights: [],
  };
}
