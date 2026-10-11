import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareCompositionNative3D } from "../../packages/animation-engine/src/composition-native3d.ts";
import { gltfBytesHash } from "../../packages/animation-engine/src/mechanism/gltf-resources.ts";

import { binaryCompositionFixture } from "../helpers/native-pbr-binary-composition-fixture.ts";
describe("Node source3 composition binary admission", () => {
  it("exposes opaque checksum-bound routes and keeps RGBA outside the DTO", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pbr-composition-source-")),
      fixture = binaryCompositionFixture();
    try {
      await writeFile(join(directory, "source3.json"), fixture.sourceBytes);
      await writeFile(join(directory, "surface.rgba"), fixture.pixels);
      const loaded = await prepareCompositionNative3D(
        fixture.composition,
        directory,
      );
      expect(loaded!.preparedNative3D.version).toBe(
        "composition-prepared-native3d-3",
      );
      if (
        loaded!.preparedNative3D.version !== "composition-prepared-native3d-3"
      )
        throw Error("fixture protocol");
      const reference =
        loaded!.preparedNative3D.assets.lever!.binaryResources[0]!;
      expect(reference).toMatchObject({
        image: "image.0",
        bytes: 4,
        sha256: gltfBytesHash(fixture.pixels),
      });
      expect(reference.asset).toMatch(/^native-pbr\/[a-f0-9]{64}$/);
      expect(loaded!.assetPaths[reference.asset]).toBe(
        await realpath(join(directory, "surface.rgba")),
      );
      expect(JSON.stringify(loaded!.preparedNative3D)).not.toContain('"rgba"');
      await writeFile(join(directory, "surface.rgba"), new Uint8Array(4));
      await expect(
        prepareCompositionNative3D(fixture.composition, directory),
      ).rejects.toMatchObject({
        location: {
          code: "comp-native3d-resource",
          path: ["resources", 0, "sha256"],
        },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
