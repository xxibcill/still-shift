import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-import.ts";
import { prepareRigidGltfPbr } from "../../packages/animation-engine/src/mechanism/gltf-pbr.ts";
import { texturedGltfFixture, glbBytes } from "./rigid-gltf-fixture.ts";
import { rgbaPngFixture } from "./rgba-png-fixture.ts";
import { CompositionSchema } from "@still-shift/scene-contract";
import { nativePbrSceneFixture } from "./native-pbr-scene-fixture.ts";
const hash = (value: Uint8Array) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
export async function createNativePbrCompositionFixture(
  prefix = "/private/tmp/still-shift-ms2-pbr-composition-",
) {
  const directory = await mkdtemp(prefix);
  const { document, binary } = texturedGltfFixture(),
    rgba = new Uint8Array([
      128, 64, 255, 0, 255, 128, 64, 64, 32, 64, 128, 128, 128, 128, 255, 255,
    ]),
    png = rgbaPngFixture(2, 2, rgba);
  const source = {
    ...document,
    materials: document.materials.map((material) => ({
      ...material,
      pbrMetallicRoughness: {
        ...material.pbrMetallicRoughness,
        baseColorFactor: [0.2, 0.4, 0.6, 0.25],
      },
    })),
  };
  const bytes = glbBytes(source, binary),
    asset = decodeRigidGltf(bytes, {
      format: "glb",
      dependencies: new Map([["maps/surface.png", png]]),
    }),
    prepared = await prepareRigidGltfPbr(asset);
  const nativeSource = {
    ...nativePbrSceneFixture(),
    geometry: prepared.geometry,
    geometrySha256: prepared.geometrySha256,
    parts: [...prepared.parts].reverse(),
    resources: prepared.geometry.images.map((image) => ({
      image: image.id,
      path: "surface.rgba",
      bytes: image.width * image.height * 4,
      sha256: image.pixelSha256,
    })),
  };
  await writeFile(join(directory, "surface.rgba"), prepared.images[0]!.rgba, {
    flag: "wx",
  });
  const nativeSourceBytes = Buffer.from(JSON.stringify(nativeSource));
  await writeFile(join(directory, "source3.json"), nativeSourceBytes, {
    flag: "wx",
  });
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "imported-pbr-composition",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 11,
    assets: [
      {
        id: "lever",
        type: "native3d",
        format: "mechanism-scene-3",
        path: "source3.json",
        sha256: hash(nativeSourceBytes),
      },
    ],
    layers: [
      {
        id: "lever-world",
        type: "native3d",
        asset: "lever",
        sourceStartFrame: 0,
        sourceFps: 30,
        rigControls: {
          "lever.hinge": {
            type: "hinge",
            keys: [
              { frame: 0, value: 0 },
              { frame: 10, value: Math.PI / 2 },
            ],
          },
        },
      },
    ],
  });
  await writeFile(
    join(directory, "composition.json"),
    JSON.stringify(composition),
  );
  return { directory, composition };
}
