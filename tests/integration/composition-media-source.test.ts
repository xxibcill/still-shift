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
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import {
  captureCompositionAssets,
  capturedMediaComposition,
} from "../../tools/still-shift-cli/src/composition/captured-assets.ts";
import { exportScene } from "@still-shift/execution-runtime/export";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
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

it("loads actual native audio with the complete pinned master, waveforms and disk-backed authoring binding", async () => {
  const { path, directory, composition } = await fixture("audio");
  const wave = mediaFloat32Wave(16000, 2, (sample, channel) =>
    sample === 15999 ? (channel ? -0.5 : 0.25) : channel ? -0.125 : 0.125,
  );
  const audioPath = join(directory, "voice.wav");
  await writeFile(audioPath, wave.wav);
  composition.assets.push({
    id: "voice",
    type: "audio",
    path: "voice.wav",
    sha256: hash(wave.wav),
    sampleRate: 48000,
    sampleCount: 16000,
    channels: 2,
  });
  composition.layers.push({
    id: "voice",
    type: "audio",
    asset: "voice",
    role: "narration",
  });
  await writeFile(path, JSON.stringify(composition));
  const loaded = await loadComposition(path, "webgl2", {
    cacheDirectory: join(root, "audio-cache"),
  });
  expect(loaded.scene.preparedAudio).toEqual(loaded.preparedAudio);
  expect(loaded.mediaSourcePaths!.voice).toEqual({ path: audioPath });
  expect(loaded.assetPaths.voice).toBeUndefined();
  expect(
    (await readFile(loaded.assetPaths["__audio:mix"]!)).subarray(58),
  ).toEqual(wave.pcm);
  expect(loaded.preparedAudio!.waveforms.processed[0]!.key).toBe("voice");
  const assets = await captureCompositionAssets(loaded);
  expect(assets.get("voice")).toEqual({ source: { path: audioPath } });
  const resolved = capturedMediaComposition(loaded.composition, assets);
  expect(resolved.assets.find((asset) => asset.id === "voice")!.path).toBe(
    audioPath,
  );
  expect(loaded.preparedAudio!.mappingHash).toMatch(/^sha256:/);
});

it("rejects absent or stale native audio masters before export can create artifacts", async () => {
  const { path, directory, composition } = await fixture("stale-audio");
  const wave = mediaFloat32Wave(16000, 1, () => 0.25);
  await writeFile(join(directory, "voice.wav"), wave.wav);
  composition.assets.push({
    id: "voice",
    type: "audio",
    path: "voice.wav",
    sha256: hash(wave.wav),
    sampleRate: 48000,
    sampleCount: 16000,
    channels: 1,
  });
  composition.layers.push({ id: "voice", type: "audio", asset: "voice" });
  await writeFile(path, JSON.stringify(composition));
  const loaded = await loadComposition(path, "canvas2d", {
    cacheDirectory: join(root, "stale-audio-cache"),
  });
  const outputPath = join(directory, "rejected.mp4");
  const request = {
    scene: loaded.scene,
    sourcePath: path,
    depthPath: null,
    assetPaths: loaded.assetPaths,
    outputPath,
  };
  const code = async (operation: Promise<unknown>) => {
    try {
      await operation;
      expect.fail("must reject");
    } catch (error) {
      return passageDiagnostics(error)[0]!.code;
    }
  };
  expect(await code(exportScene(request))).toBe("comp-media-provenance");
  const changed = structuredClone(loaded.scene);
  const voice = changed.composition.layers.find(
    (layer) => layer.id === "voice",
  )!;
  if (voice.type !== "audio") throw Error("Expected audio");
  voice.gainDb = -6;
  const audioInput = {
    path: loaded.assetPaths["__audio:mix"]!,
    sha256: loaded.preparedAudio!.resource.sha256,
    byteLength: loaded.preparedAudio!.resource.byteLength,
    sampleCount: 16000,
  };
  expect(
    await code(exportScene({ ...request, scene: changed, audioInput })),
  ).toBe("comp-media-provenance");
  const master = await readFile(audioInput.path);
  master.writeFloatLE(0.9, 66);
  await writeFile(audioInput.path, master);
  expect(await code(exportScene({ ...request, audioInput }))).toBe(
    "comp-media-checksum",
  );
  expect((await readFile(path, "utf8")).length).toBeGreaterThan(0);
  await expect(readFile(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(outputPath + ".scene.json")).rejects.toMatchObject({
    code: "ENOENT",
  });
});
