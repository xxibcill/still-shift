import { mkdtemp, writeFile, rm, open } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { readCompositionSource } from "../../packages/animation-engine/src/composition-source.ts";
import { binaryCompositionFixture } from "../helpers/native-pbr-binary-composition-fixture.ts";
import { gltfBytesHash } from "../../packages/animation-engine/src/mechanism/gltf-resources.ts";
it("reads actual padded root bytes with exact checksum and shared native preparation", async () => {
  const dir = await mkdtemp("/private/tmp/composition-root-admission-"),
    fixture = binaryCompositionFixture(),
    parent = new CompositionNodeMemory(),
    foreign = parent.reserve(1024);
  try {
    const bytes = Buffer.concat([
      Buffer.from(JSON.stringify(fixture.composition)),
      Buffer.alloc(8 * 1024 ** 2, 32),
    ]);
    await writeFile(join(dir, "root.json"), bytes);
    await writeFile(join(dir, "source3.json"), fixture.sourceBytes);
    await writeFile(join(dir, "surface.rgba"), fixture.pixels);
    const result = await readCompositionSource(join(dir, "root.json"), {
      nodeMemory: parent,
    });
    expect(result.sourceChecksum).toBe(gltfBytesHash(bytes));
    expect(result.preparedNative3D!.version).toBe(
      "composition-prepared-native3d-3",
    );
    expect(parent.statistics.current.metadata).toBeGreaterThan(foreign.bytes);
    expect(parent.statistics.peak.metadata).toBeGreaterThan(bytes.length * 3);
    parent.dispose();
    expect(parent.statistics.current.metadata).toBe(0);
  } finally {
    parent.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
it("rejects a sparse root at descriptor admission before JSON parsing", async () => {
  const dir = await mkdtemp("/private/tmp/composition-root-sparse-"),
    path = join(dir, "root.json"),
    parent = new CompositionNodeMemory(),
    foreign = parent.reserve(500 * 1024 ** 2);
  try {
    const handle = await open(path, "wx");
    await handle.truncate(8 * 1024 ** 2);
    await handle.close();
    const parse = vi.spyOn(JSON, "parse");
    try {
      await expect(
        readCompositionSource(path, { nodeMemory: parent }),
      ).rejects.toMatchObject({ code: "SCENE_INVALID" });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
    expect(parent.statistics.current.metadata).toBe(foreign.bytes);
  } finally {
    parent.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
it("rolls back root and native reservations if a later asset verification fails", async () => {
  const dir = await mkdtemp("/private/tmp/composition-root-failed-"),
    fixture = binaryCompositionFixture(),
    parent = new CompositionNodeMemory(),
    foreign = parent.reserve(1024);
  try {
    await writeFile(
      join(dir, "root.json"),
      JSON.stringify(fixture.composition),
    );
    await writeFile(join(dir, "source3.json"), fixture.sourceBytes);
    await writeFile(join(dir, "surface.rgba"), new Uint8Array(4));
    await expect(
      readCompositionSource(join(dir, "root.json"), { nodeMemory: parent }),
    ).rejects.toMatchObject({ location: { code: "comp-native3d-resource" } });
    expect(parent.statistics.current.metadata).toBe(foreign.bytes);
    expect(parent.statistics.reservations).toBe(1);
  } finally {
    parent.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
