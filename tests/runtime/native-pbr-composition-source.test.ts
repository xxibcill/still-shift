import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { prepareCompositionNative3D } from "../../packages/animation-engine/src/composition-native3d.ts";
import { gltfBytesHash } from "../../packages/animation-engine/src/mechanism/gltf-resources.ts";

import { MechanismSceneV3Schema } from "@still-shift/scene-contract";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
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

it("rejects a real dense source before JSON.parse and allows a padded valid source", async () => {
  const directory = await mkdtemp(
      join(tmpdir(), "pbr-composition-json-admission-"),
    ),
    fixture = binaryCompositionFixture();
  try {
    const asset = fixture.composition.assets.find(
      (value) => value.type === "native3d",
    )!;
    if (asset.type !== "native3d") throw Error("fixture native asset");
    const dense = "[" + "0,".repeat(5000000) + "0]",
      bytes = Buffer.from(dense);
    await writeFile(join(directory, "source3.json"), bytes);
    asset.sha256 = gltfBytesHash(bytes);
    const parse = vi.spyOn(JSON, "parse");
    try {
      await expect(
        prepareCompositionNative3D(fixture.composition, directory),
      ).rejects.toMatchObject({
        diagnostics: [{ code: "comp-native3d-limit", path: "assets.lever" }],
      });
      expect(parse.mock.calls.some(([text]) => text === dense)).toBe(false);
    } finally {
      parse.mockRestore();
    }
    const padded = Buffer.concat([
      Buffer.from(fixture.sourceBytes),
      Buffer.alloc(8 * 1024 ** 2, 32),
    ]);
    await writeFile(join(directory, "source3.json"), padded);
    await writeFile(join(directory, "surface.rgba"), fixture.pixels);
    asset.sha256 = gltfBytesHash(padded);
    const result = await prepareCompositionNative3D(
      fixture.composition,
      directory,
    );
    expect(result!.sourceAdmission).toMatchObject({
      scope: "native-source-json-ingestion-capacity",
      limitBytes: 512 * 1024 ** 2,
    });
    expect(result!.sourceAdmission.peak.metadata).toBeGreaterThan(
      padded.length * 3,
    );
    expect(result!.sourceAdmission.current.metadata).toBeLessThan(1024 ** 2);
    expect(result!.preparedNative3D.assets.lever!.sourceSha256).toBe(
      asset.sha256,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("admission accumulates across actual valid native assets before the next source parses", async () => {
  const directory = await mkdtemp(
      join(tmpdir(), "pbr-composition-aggregate-ingestion-"),
    ),
    fixture = binaryCompositionFixture();
  try {
    const source = MechanismSceneV3Schema.parse(
      JSON.parse(fixture.sourceBytes),
    );
    for (const mesh of source.geometry.meshes) {
      const count = Math.floor(100000 / source.geometry.meshes.length);
      mesh.positions = Array.from(
        { length: count * 3 },
        (_, index) => mesh.positions[index % mesh.positions.length]!,
      );
      mesh.normals = Array.from(
        { length: count * 3 },
        (_, index) => mesh.normals[index % mesh.normals.length]!,
      );
      if (mesh.uvs) {
        const original = mesh.uvs;
        mesh.uvs = Array.from(
          { length: count * 2 },
          (_, index) => original[index % original.length]!,
        );
      }
      if (mesh.tangents) {
        const original = mesh.tangents;
        mesh.tangents = Array.from(
          { length: count * 4 },
          (_, index) => original[index % original.length]!,
        );
      }
    }
    source.geometrySha256 = gltfJsonHash(source.geometry);
    // Prove the large asset satisfies the original schema before testing budget.
    MechanismSceneV3Schema.parse(source);
    const text = JSON.stringify(source),
      bytes = Buffer.from(text);
    await writeFile(join(directory, "source3.json"), bytes);
    await writeFile(join(directory, "surface.rgba"), fixture.pixels);
    const asset = fixture.composition.assets[0]!;
    if (asset.type !== "native3d") throw Error("fixture native asset");
    fixture.composition.assets = Array.from({ length: 24 }, (_, index) => ({
      ...asset,
      id: index ? `unused.${index}` : asset.id,
      sha256: gltfBytesHash(bytes),
    }));
    const parse = vi.spyOn(JSON, "parse");
    try {
      await expect(
        prepareCompositionNative3D(fixture.composition, directory),
      ).rejects.toMatchObject({
        diagnostics: [
          {
            code: "comp-native3d-limit",
            path: expect.stringMatching(/^assets\.unused\./),
          },
        ],
      });
      const admitted = parse.mock.calls.filter(
        ([value]) => value === text,
      ).length;
      expect(admitted).toBeGreaterThan(0);
      expect(admitted).toBeLessThan(24);
    } finally {
      parse.mockRestore();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
