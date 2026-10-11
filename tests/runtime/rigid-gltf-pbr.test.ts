import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-import.ts";
import { prepareRigidGltfPbr } from "../../packages/animation-engine/src/mechanism/gltf-pbr.ts";
import {
  glbBytes,
  texturedGltfFixture,
} from "../helpers/rigid-gltf-fixture.ts";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import { RigidGltfImportError } from "../../packages/animation-engine/src/mechanism/gltf-document.ts";
import { staticGltfPng } from "../../packages/animation-engine/src/mechanism/gltf-png.ts";
import { decodeGltfRgba } from "../../packages/animation-engine/src/mechanism/gltf-pixels.ts";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import {
  rgbaPngFixture,
  pngFixtureChunk,
} from "../helpers/rgba-png-fixture.ts";

describe("native PBR pixel preparation", () => {
  it("preserves unpremultiplied PNG RGB even beneath zero alpha and binds versioned resources", async () => {
    const pixels = new Uint8Array([
      128, 64, 255, 0, 255, 128, 64, 64, 32, 64, 128, 128, 128, 128, 255, 255,
    ]);
    const png = rgbaPngFixture(2, 2, pixels),
      { document, binary } = texturedGltfFixture();
    const asset = decodeRigidGltf(glbBytes(document, binary), {
      format: "glb",
      dependencies: new Map([["maps/surface.png", png]]),
    });
    const prepared = await prepareRigidGltfPbr(asset);
    expect(prepared.decoder.ffmpegVersion).toBe("8.0.1");
    expect(prepared.geometry.schemaVersion).toBe("solid-geometry-2");
    expect(prepared.images[0]!.rgba).toEqual(pixels);
    expect(prepared.geometry.meshes[0]!.tangents).toEqual(
      asset.meshes[0]!.tangents,
    );
    expect(prepared.geometry.materials[0]!.baseColorFactor).toEqual([
      0.2, 0.4, 0.6, 1,
    ]);
    expect(prepared.geometry.images[0]!.sourceSha256).toBe(
      asset.images[0]!.sha256,
    );
    expect(prepared.geometry.images[0]!.pixelSha256).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
  });
  it("ignores valid PNG color, aspect and animation metadata while rejecting corrupted pixel chunks", async () => {
    const pixels = new Uint8Array([128, 64, 255, 0]),
      png = rgbaPngFixture(1, 1, pixels);
    const metadata = Buffer.concat([
      png.subarray(0, 33),
      pngFixtureChunk("gAMA", new Uint8Array([0, 1, 134, 160])),
      pngFixtureChunk("pHYs", new Uint8Array([0, 0, 0, 1, 0, 0, 0, 2, 0])),
      pngFixtureChunk("acTL", new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0])),
      png.subarray(33),
    ]);
    expect(staticGltfPng(metadata, ["images", 0])).toEqual(png);
    expect(
      await decodeGltfRgba(staticGltfPng(metadata, ["images", 0]), 4, [
        "images",
        0,
      ]),
    ).toEqual(pixels);
    const corrupt = Buffer.from(png);
    corrupt[45] = corrupt[45]! ^ 1;
    expect(() => staticGltfPng(corrupt, ["images", 2])).toThrowError(
      RigidGltfImportError,
    );
    try {
      staticGltfPng(corrupt, ["images", 2]);
    } catch (error) {
      expect((error as RigidGltfImportError).location).toEqual({
        code: "gltf-import-image",
        path: ["gltf", "images", 2],
      });
    }
  });
  it("preflights invalid geometry before decoding any compressed pixels", async () => {
    const { document, binary } = texturedGltfFixture();
    const asset = structuredClone(
      decodeRigidGltf(glbBytes(document, binary), {
        format: "glb",
        dependencies: new Map([
          [
            "maps/surface.png",
            rgbaPngFixture(1, 1, new Uint8Array([1, 2, 3, 4])),
          ],
        ]),
      }),
    );
    asset.meshes[0]!.tangents![3] = 0;
    asset.images[0]!.encodedBase64 = "AAAA";
    const { assetSha256: _old, ...data } = asset;
    void _old;
    asset.assetSha256 = gltfJsonHash(data);
    await expect(prepareRigidGltfPbr(asset)).rejects.toThrow(/tangent/);
  });
  it("returns located decode failures and preserves cancellation reasons", async () => {
    await expect(
      decodeGltfRgba(new Uint8Array([1, 2, 3, 4]), 4, ["images", 3]),
    ).rejects.toMatchObject({
      location: { code: "gltf-import-image", path: ["gltf", "images", 3] },
    });
    const reason = new Error("owner cancellation");
    await expect(
      Promise.resolve().then(() =>
        decodeGltfRgba(
          new Uint8Array(),
          4,
          ["images", 0],
          AbortSignal.abort(reason),
        ),
      ),
    ).rejects.toBe(reason);
  });
  it("decodes JPEG to opaque top-left RGBA and ignores EXIF orientation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gltf-pbr-jpeg-"));
    try {
      const raw = join(directory, "input.rgba"),
        jpeg = join(directory, "surface.jpg");
      await writeFile(
        raw,
        new Uint8Array([
          255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 255,
          0, 255, 255, 0, 255, 255, 255,
        ]),
      );
      await runProcess("ffmpeg", [
        "-v",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
        "2x3",
        "-i",
        raw,
        "-frames:v",
        "1",
        "-pix_fmt",
        "yuvj444p",
        "-q:v",
        "1",
        jpeg,
      ]);
      const plain = await readFile(jpeg);
      const exif = Buffer.from(
        "45786966000049492a0008000000010012010300010000000600000000000000",
        "hex",
      );
      const app1 = Buffer.alloc(exif.length + 4);
      app1[0] = 255;
      app1[1] = 225;
      app1.writeUInt16BE(exif.length + 2, 2);
      app1.set(exif, 4);
      const rotated = Buffer.concat([
        plain.subarray(0, 2),
        app1,
        plain.subarray(2),
      ]);
      const { document, binary } = texturedGltfFixture();
      const source = {
        ...document,
        images: [
          {
            name: "jpeg surface",
            uri: "maps/surface.png",
            mimeType: "image/jpeg",
          },
        ],
      };
      const prepare = async (bytes: Uint8Array) =>
        prepareRigidGltfPbr(
          decodeRigidGltf(glbBytes(source, binary), {
            format: "glb",
            dependencies: new Map([["maps/surface.png", bytes]]),
          }),
        );
      const baseline = await prepare(plain),
        result = await prepare(rotated);
      expect(result.geometry.images[0]).toMatchObject({ width: 2, height: 3 });
      expect(result.images[0]!.rgba).toEqual(baseline.images[0]!.rgba);
      expect(
        Array.from(result.images[0]!.rgba).filter(
          (_, index) => index % 4 === 3,
        ),
      ).toEqual([255, 255, 255, 255, 255, 255]);
      expect(result.geometry.images[0]!.sourceSha256).not.toBe(
        baseline.geometry.images[0]!.sourceSha256,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects the combined CPU/GPU resource bill before decoding large images", async () => {
    const { document, binary } = texturedGltfFixture();
    const asset = structuredClone(
      decodeRigidGltf(glbBytes(document, binary), {
        format: "glb",
        dependencies: new Map([
          [
            "maps/surface.png",
            rgbaPngFixture(1, 1, new Uint8Array([1, 2, 3, 4])),
          ],
        ]),
      }),
    );
    asset.images[0]!.width = 4096;
    asset.images[0]!.height = 2048;
    const { assetSha256: previous, ...data } = asset;
    void previous;
    asset.assetSha256 = gltfJsonHash(data);
    await expect(prepareRigidGltfPbr(asset)).rejects.toMatchObject({
      location: { code: "gltf-import-budget", path: ["gltf", "images"] },
    });
  });
  it("rejects forged image dimensions even when total decoded byte count would match", async () => {
    const { document, binary } = texturedGltfFixture();
    const asset = structuredClone(
      decodeRigidGltf(glbBytes(document, binary), {
        format: "glb",
        dependencies: new Map([
          ["maps/surface.png", rgbaPngFixture(2, 2, new Uint8Array(16))],
        ]),
      }),
    );
    asset.images[0]!.width = 1;
    asset.images[0]!.height = 4;
    const { assetSha256: previous, ...data } = asset;
    void previous;
    asset.assetSha256 = gltfJsonHash(data);
    await expect(prepareRigidGltfPbr(asset)).rejects.toMatchObject({
      location: { code: "gltf-import-image", path: ["gltf", "images", 0] },
    });
  });
  it("preserves palette transparency and rejects tRNS on an explicit alpha image", async () => {
    const rgba = rgbaPngFixture(1, 1, new Uint8Array([9, 29, 49, 0])),
      header = Buffer.from(rgba.subarray(16, 29));
    header[9] = 3;
    const indexed = Buffer.concat([
      rgba.subarray(0, 8),
      pngFixtureChunk("IHDR", header),
      pngFixtureChunk("PLTE", new Uint8Array([9, 29, 49])),
      pngFixtureChunk("tRNS", new Uint8Array([0])),
      pngFixtureChunk("IDAT", deflateSync(new Uint8Array([0, 0]))),
      pngFixtureChunk("IEND", new Uint8Array()),
    ]);
    expect(
      await decodeGltfRgba(staticGltfPng(indexed, ["images", 0]), 4, [
        "images",
        0,
      ]),
    ).toEqual(new Uint8Array([9, 29, 49, 0]));
    const forbidden = Buffer.concat([
      rgba.subarray(0, 33),
      pngFixtureChunk("tRNS", new Uint8Array([0])),
      rgba.subarray(33),
    ]);
    expect(() => staticGltfPng(forbidden, ["images", 0])).toThrow(
      /transparency/,
    );
  });
});
