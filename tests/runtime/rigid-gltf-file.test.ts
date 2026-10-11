import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
  truncate,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-file.ts";
import { decodeRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-import.ts";
import { RIGID_GLTF_LIMITS } from "../../packages/animation-engine/src/mechanism/gltf-document.ts";
import {
  glbBytes,
  rigidGltfFixture,
  texturedGltfFixture,
} from "../helpers/rigid-gltf-fixture.ts";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "rigid-gltf-file-"));
  roots.push(root);
  return root;
}
async function externalFixture(root: string, bufferUri = "mesh.bin") {
  const { document, binary, png } = texturedGltfFixture();
  const source = {
    ...document,
    buffers: [{ byteLength: binary.length, uri: bufferUri }],
  };
  await mkdir(join(root, "maps"), { recursive: true });
  await writeFile(join(root, "model.gltf"), JSON.stringify(source));
  await writeFile(join(root, "mesh.bin"), binary);
  await writeFile(join(root, "maps/surface.png"), png);
  return { source, binary, png };
}
describe("bounded local rigid glTF files", () => {
  it("imports local geometry and PBR images identically after relocation", async () => {
    const first = await directory(),
      second = await directory();
    await externalFixture(first);
    await externalFixture(second);
    const a = await importRigidGltf(join(first, "model.gltf")),
      b = await importRigidGltf(join(second, "model.gltf"));
    expect(a).toEqual(b);
    expect(a.dependencies.map((dependency) => dependency.uri)).toEqual([
      "mesh.bin",
      "maps/surface.png",
    ]);
    expect(a.materials[0]!.normalTexture!.image).toBe("image.0");
    expect(a.images[0]!.bytes).toBe(
      (await readFile(join(first, "maps/surface.png"))).length,
    );
  });
  it("reads GLB bytes through the public file API without inventing filesystem dependencies", async () => {
    const root = await directory(),
      { document, binary } = rigidGltfFixture(),
      bytes = glbBytes(document, binary);
    await writeFile(join(root, "model.glb"), bytes);
    expect(await importRigidGltf(join(root, "model.glb"))).toEqual(
      decodeRigidGltf(bytes, { format: "glb" }),
    );
  });
  it("rejects missing external files with a located dependency error", async () => {
    const root = await directory();
    await externalFixture(root);
    await rm(join(root, "mesh.bin"));
    await expect(
      importRigidGltf(join(root, "model.gltf")),
    ).rejects.toMatchObject({
      location: {
        code: "gltf-import-dependency",
        path: ["gltf", "buffers", 0, "uri"],
      },
    });
  });
  it("rejects percent-encoded traversal outside its declared root", async () => {
    const root = await directory(),
      child = join(root, "child");
    await mkdir(child);
    const { binary } = await externalFixture(child, "%2e%2e/mesh.bin");
    await writeFile(join(root, "mesh.bin"), binary);
    await expect(importRigidGltf(join(child, "model.gltf"))).rejects.toThrow(
      /escapes/,
    );
    const asset = await importRigidGltf(join(child, "model.gltf"), {
      dependencyRoot: root,
    });
    expect(asset.dependencies[0]!.uri).toBe("%2e%2e/mesh.bin");
  });
  it("rejects a dependency symlink escaping its canonical root", async () => {
    const root = await directory(),
      outside = await directory();
    await externalFixture(root);
    await writeFile(join(outside, "mesh.bin"), rigidGltfFixture().binary);
    await rm(join(root, "mesh.bin"));
    await symlink(join(outside, "mesh.bin"), join(root, "mesh.bin"));
    await expect(importRigidGltf(join(root, "model.gltf"))).rejects.toThrow(
      /escapes/,
    );
  });
  it("rejects remote URIs without performing a network request", async () => {
    const root = await directory();
    await externalFixture(root, "https://example.invalid/mesh.bin");
    await expect(importRigidGltf(join(root, "model.gltf"))).rejects.toThrow(
      /relative local/,
    );
  });
  it("rejects oversized source and dependency files before reading their payloads", async () => {
    const root = await directory();
    await externalFixture(root);
    await truncate(
      join(root, "mesh.bin"),
      RIGID_GLTF_LIMITS.dependencyBytes + 1,
    );
    await expect(importRigidGltf(join(root, "model.gltf"))).rejects.toThrow(
      /before loading/,
    );
    await truncate(join(root, "model.gltf"), RIGID_GLTF_LIMITS.sourceBytes + 1);
    await expect(importRigidGltf(join(root, "model.gltf"))).rejects.toThrow(
      /before allocation/,
    );
  });
});
