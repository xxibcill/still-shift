import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadComposition,
  readCompositionSource,
} from "@still-shift/animation-engine";
import type { Composition } from "@still-shift/scene-contract";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";
let root: string;
const hash = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ce13-source-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
async function fixture(name: string) {
  const directory = join(root, name);
  await mkdir(directory);
  const hashes: string[] = [];
  for (let ordinal = 0; ordinal < 8; ordinal++) {
    const rgba = Buffer.alloc(32 * 16 * 4);
    for (let pixel = 0; pixel < 32 * 16; pixel++)
      rgba.set([ordinal * 30, 50, 80, 255], pixel * 4);
    const bytes = mediaRgbaPng(32, 16, rgba, [
      mediaPngChunk("sRGB", Buffer.from([0])),
    ]);
    await writeFile(join(directory, `frame_${11 + ordinal}.png`), bytes);
    hashes.push(hash(bytes));
  }
  const manifest = Buffer.from(
    JSON.stringify({ schemaVersion: "composition-sequence-1", frames: hashes }),
  );
  await writeFile(join(directory, "manifest.json"), manifest);
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "source",
    width: 64,
    height: 48,
    fps: 24,
    frameCount: 8,
    assets: [
      {
        id: "sequence",
        type: "sequence",
        path: "frame_%02d.png",
        manifestPath: "manifest.json",
        firstFrame: 11,
        width: 32,
        height: 16,
        frameCount: 8,
        frameRate: { numerator: 12, denominator: 1 },
        sha256: hash(manifest),
        color: {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "gbr",
          range: "pc",
        },
      },
    ],
    layers: [
      {
        id: "picture",
        type: "sequence",
        asset: "sequence",
        timeRemap: 0.4,
        frameBlending: "linear",
        sourceInFrame: 2,
        sourceOutFrame: 7,
      },
    ],
  };
  const path = join(directory, "composition.json");
  await writeFile(path, JSON.stringify(composition));
  return { directory, path, composition };
}
it("captures exactly the original frames required after remap and supplies the immutable export scene", async () => {
  const { path, directory } = await fixture("capture");
  const source = await loadComposition(path, "canvas2d", {
    cacheDirectory: join(root, "capture-cache"),
  });
  expect(source.preparedMedia!.frames.map((frame) => frame.ordinal)).toEqual([
    4, 5,
  ]);
  expect(source.scene.preparedMedia).toEqual(source.preparedMedia);
  expect(source.mediaSourcePaths!.sequence).toEqual({
    path: join(directory, "frame_%02d.png"),
    manifestPath: join(directory, "manifest.json"),
  });
  expect(Object.keys(source.assetPaths).sort()).toEqual([
    "__media:sequence:4",
    "__media:sequence:5",
  ]);
  for (const frame of source.preparedMedia!.frames)
    expect(hash(await readFile(source.assetPaths[frame.id]!))).toBe(
      frame.sha256,
    );
});
it("relocation reuses captured pixels while physical paths and source JSON remain distinct", async () => {
  const { path, directory, composition } = await fixture("original");
  const cacheDirectory = join(root, "relocation-cache");
  const first = await readCompositionSource(path, { cacheDirectory });
  const relocated = join(root, "relocated");
  await mkdir(relocated);
  for (let ordinal = 0; ordinal < 8; ordinal++)
    await copyFile(
      join(directory, `frame_${11 + ordinal}.png`),
      join(relocated, `frame_${11 + ordinal}.png`),
    );
  await copyFile(
    join(directory, "manifest.json"),
    join(relocated, "manifest.json"),
  );
  const moved = structuredClone(composition);
  moved.assets[0]!.path = join(relocated, "frame_%02d.png");
  (
    moved.assets[0] as Extract<
      (typeof moved.assets)[number],
      { type: "sequence" }
    >
  ).manifestPath = join(relocated, "manifest.json");
  const nextPath = join(relocated, "composition.json");
  await writeFile(nextPath, JSON.stringify(moved));
  const second = await readCompositionSource(nextPath, { cacheDirectory });
  expect(second.assetPaths).toEqual(first.assetPaths);
  expect(second.preparedMedia).toEqual(first.preparedMedia);
  expect(second.sourceChecksum).not.toBe(first.sourceChecksum);
  expect(second.mediaSourcePaths).not.toEqual(first.mediaSourcePaths);
});
it("verifies unused sources without allocating any decoded frames", async () => {
  const { path, composition } = await fixture("unused");
  composition.layers = [];
  composition.mediaLimits = { decodedFrameBytes: 4 };
  await writeFile(path, JSON.stringify(composition));
  const source = await readCompositionSource(path, {
    cacheDirectory: join(root, "unused-cache"),
  });
  expect(source.preparedMedia!.frames).toEqual([]);
  expect(source.assetPaths).toEqual({});
  expect(source.mediaSourcePaths!.sequence).toBeDefined();
});
it("cancellation is observed before reading a native source or allocating its cache", async () => {
  const { path } = await fixture("cancelled");
  const controller = new AbortController();
  controller.abort();
  await expect(
    readCompositionSource(path, {
      cacheDirectory: join(root, "cancelled-cache"),
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
});
