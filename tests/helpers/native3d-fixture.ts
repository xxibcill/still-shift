import { createHash } from "node:crypto";
import {
  SolidSceneSchema,
  type SolidScene,
} from "../../packages/scene-contract/src/native3d/scene.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";

export const nativeFixtureHash = "sha256:" + "a".repeat(64);
/** A real indexed triangle and physical anchors; there is deliberately no tape rig. */
export function nativeSolidFixture(): SolidScene {
  const scene = SolidSceneSchema.parse({
    schemaVersion: "solid-scene-1",
    id: "solid",
    geometrySha256: nativeFixtureHash,
    coordinateSystem: "right-handed-y-up",
    units: { kind: "illustrative", scaleToMeters: 1 },
    geometry: {
      schemaVersion: "solid-geometry-1",
      meshes: [
        {
          id: "floor",
          partId: "root",
          materialId: "paint",
          positions: [-2, -2, 0, 2, -2, 0, 0, 2, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          indices: [0, 1, 2],
          bounds: { min: [-2, -2, 0], max: [2, 2, 0] },
        },
      ],
      materials: [
        { id: "paint", color: "#123456", roughness: 0.5, metalness: 0 },
      ],
    },
    parts: [{ id: "root" }, { id: "child", parent: "root" }],
    anchors: [
      {
        id: "behind",
        part: "child",
        position: [0, 0, -1],
        role: "proof-target",
      },
      { id: "face", part: "root", position: [0, 0, 0], role: "proof-target" },
      {
        id: "outside",
        part: "child",
        position: [30, 0, -1],
        role: "proof-target",
      },
    ],
    camera: {
      position: [0, 0, 10],
      target: [0, 0, 0],
      fovDegrees: 60,
      near: 0.1,
      far: 100,
    },
    profile: {
      toneMapping: "aces-filmic",
      exposure: 1,
      output: "srgb-rgba8-straight",
    },
  });
  scene.geometrySha256 =
    "sha256:" +
    createHash("sha256")
      .update(canonicalMechanismJson(scene.geometry))
      .digest("hex");
  return scene;
}
