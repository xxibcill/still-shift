import { CompositionSchema } from "@still-shift/scene-contract";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import { gltfBytesHash } from "../../packages/animation-engine/src/mechanism/gltf-resources.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { nativePbrSceneFixture } from "../helpers/native-pbr-scene-fixture.ts";

export function binaryCompositionFixture() {
  const base = nativePbrSceneFixture(),
    pixels = new Uint8Array([128, 64, 255, 255]),
    sha256 = gltfBytesHash(pixels);
  const geometry = {
    ...base.geometry,
    images: [
      {
        id: "image.0",
        sourceSha256: sha256,
        pixelSha256: sha256,
        width: 1,
        height: 1,
        encoding: "rgba8-straight-top-left-1",
      },
    ],
  };
  const source = {
    ...base,
    geometry,
    geometrySha256: gltfJsonHash(geometry),
    resources: [{ image: "image.0", path: "surface.rgba", bytes: 4, sha256 }],
  };
  const sourceBytes = canonicalMechanismJson(source),
    composition = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: "binary-pbr-composition",
      width: 64,
      height: 64,
      fps: 30,
      frameCount: 11,
      assets: [
        {
          id: "lever",
          type: "native3d",
          format: "mechanism-scene-3",
          path: "source3.json",
          sha256: gltfJsonHash(source),
        },
      ],
      layers: [
        {
          id: "world",
          type: "native3d",
          asset: "lever",
          sourceStartFrame: 0,
          sourceFps: 30,
        },
      ],
    });
  return { pixels, source, sourceBytes, composition };
}
