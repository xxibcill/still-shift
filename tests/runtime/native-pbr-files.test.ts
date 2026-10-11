import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  mkdtemp,
  writeFile,
  mkdir,
  symlink,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadNativePbrSourceResources } from "../../packages/animation-engine/src/mechanism/native-pbr-files.ts";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import { gltfBytesHash } from "../../packages/animation-engine/src/mechanism/gltf-resources.ts";
import { nativePbrSceneFixture } from "../helpers/native-pbr-scene-fixture.ts";
async function withResource(
  run: (fixture: {
    root: string;
    source: ReturnType<typeof fixtureSource>;
    pixels: Uint8Array;
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "native-pbr-source3-")),
    pixels = new Uint8Array([128, 64, 255, 0]);
  try {
    await mkdir(join(root, "images"));
    await writeFile(join(root, "images/surface.rgba"), pixels);
    await run({ root, source: fixtureSource(pixels), pixels });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function fixtureSource(pixels: Uint8Array) {
  const input = nativePbrSceneFixture(),
    sha = gltfBytesHash(pixels),
    geometry = {
      ...input.geometry,
      images: [
        {
          id: "image.0",
          sourceSha256: sha,
          pixelSha256: sha,
          width: 1,
          height: 1,
          encoding: "rgba8-straight-top-left-1",
        },
      ],
    };
  return {
    ...input,
    geometry,
    geometrySha256: gltfJsonHash(geometry),
    resources: [
      { image: "image.0", path: "images/surface.rgba", bytes: 4, sha256: sha },
    ],
  };
}
describe("source3 separate binary resource preparation", () => {
  it("loads exact straight RGBA from a canonical local dependency without adding pixels to source metadata", async () =>
    withResource(async ({ root, source, pixels }) => {
      const result = await loadNativePbrSourceResources(source, root);
      expect(result.images[0]!.rgba).toEqual(pixels);
      expect(result.source.resources[0]!.sha256).toBe(gltfBytesHash(pixels));
      expect(result.source.resources[0]).not.toHaveProperty("rgba");
      expect(result.paths["image.0"]).toBe(
        await realpath(join(root, "images/surface.rgba")),
      );
    }));
  it("rejects changed bytes and oversized files at the located reference", async () =>
    withResource(async ({ root, source }) => {
      await writeFile(
        join(root, "images/surface.rgba"),
        new Uint8Array([0, 0, 0, 0]),
      );
      await expect(
        loadNativePbrSourceResources(source, root),
      ).rejects.toMatchObject({
        location: {
          code: "comp-native3d-resource",
          path: ["resources", 0, "sha256"],
        },
      });
      await writeFile(join(root, "images/surface.rgba"), new Uint8Array(5));
      await expect(
        loadNativePbrSourceResources(source, root),
      ).rejects.toMatchObject({
        location: { path: ["resources", 0, "bytes"] },
      });
    }));
  it("rejects escaping symlinks and preserves cancellation", async () =>
    withResource(async ({ root, source }) => {
      const outside = await mkdtemp(join(tmpdir(), "native-pbr-outside-"));
      try {
        await writeFile(join(outside, "surface.rgba"), new Uint8Array(4));
        await rm(join(root, "images/surface.rgba"));
        await symlink(
          join(outside, "surface.rgba"),
          join(root, "images/surface.rgba"),
        );
        await expect(
          loadNativePbrSourceResources(source, root),
        ).rejects.toThrow(/escapes/);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
      const reason = new Error("cancel source3");
      await expect(
        loadNativePbrSourceResources(source, root, {
          signal: AbortSignal.abort(reason),
        }),
      ).rejects.toBe(reason);
    }));
});

const execFileAsync = promisify(execFile);
describe("source3 regular-file boundary", () => {
  it.skipIf(process.platform === "win32")(
    "rejects a FIFO without blocking a resource open",
    async () =>
      withResource(async ({ root, source }) => {
        const path = join(root, "images/surface.rgba");
        await rm(path);
        await execFileAsync("mkfifo", [path]);
        await expect(
          loadNativePbrSourceResources(source, root),
        ).rejects.toMatchObject({
          location: {
            code: "comp-native3d-resource",
            path: ["resources", 0, "bytes"],
          },
        });
      }),
    2000,
  );
  it("rejects a regular file as the local resource root", async () =>
    withResource(async ({ root, source }) => {
      await expect(
        loadNativePbrSourceResources(source, join(root, "images/surface.rgba")),
      ).rejects.toMatchObject({ location: { path: ["resources"] } });
    }));
});
