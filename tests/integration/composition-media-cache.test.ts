import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import {
  prepareCompositionVisualMedia,
  probeCompositionVideo,
} from "@still-shift/animation-engine";
import type { CompositionVisualMediaAsset } from "@still-shift/scene-contract";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
  mediaPngPixels,
} from "../helpers/composition-media-png.ts";
let root: string;
const hash = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const color = {
  primaries: "bt709",
  transfer: "iec61966-2-1",
  matrix: "gbr",
  range: "pc",
} as const;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ce13-cache-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
const failureCode = async (operation: Promise<unknown>) => {
  try {
    await operation;
    expect.fail("must reject");
  } catch (error) {
    return passageDiagnostics(error)[0]!.code;
  }
};
const maxDifference = (actual: Uint8Array, expected: Uint8Array) => {
  expect(actual.length).toBe(expected.length);
  let worst = 0;
  for (let i = 0; i < actual.length; i++)
    worst = Math.max(worst, Math.abs(actual[i]! - expected[i]!));
  return worst;
};
const digits = [
  "111101101101111",
  "010110010010111",
  "111001111100111",
  "111001111001111",
  "101101111001001",
  "111100111001111",
  "111100111101111",
  "111001001001001",
  "111101111101111",
  "111101111001111",
];
function numberedFrame(ordinal: number, width = 64, height = 32) {
  const bytes = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      bytes[at] = ordinal * 13;
      bytes[at + 1] = x * 3;
      bytes[at + 2] = y * 7;
      bytes[at + 3] = 128 + (ordinal % 2) * 127;
    }
  for (const [place, digit] of String(ordinal)
    .padStart(2, "0")
    .split("")
    .entries())
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 3; x++)
        if (digits[Number(digit)]![y * 3 + x] === "1")
          for (let dy = 0; dy < 3; dy++)
            for (let dx = 0; dx < 3; dx++) {
              const at =
                ((y * 3 + dy + 3) * width + place * 12 + x * 3 + dx + 3) * 4;
              bytes.set([255, 255, 255, 255], at);
            }
  return bytes;
}
async function video(
  name: string,
  bytes: Buffer,
  width: number,
  height: number,
  pixelFormat = "rgba",
  transfer = "iec61966-2-1",
  matrix = "gbr",
  rate = "30000/1001",
) {
  const source = join(root, name + ".mkv"),
    raw = join(root, name + ".raw");
  await writeFile(raw, bytes);
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-f",
    "rawvideo",
    "-pix_fmt",
    pixelFormat,
    "-video_size",
    `${width}x${height}`,
    "-framerate",
    rate,
    "-i",
    raw,
    "-vf",
    `setparams=color_primaries=bt709:color_trc=${transfer}:colorspace=${matrix}:range=${matrix === "gbr" ? "full" : "limited"}`,
    "-c:v",
    "ffv1",
    "-pix_fmt",
    matrix === "gbr" ? "gbrap16le" : "yuv444p",
    "-color_primaries",
    "bt709",
    "-color_trc",
    transfer,
    "-colorspace",
    matrix === "gbr" ? "0" : "bt709",
    "-color_range",
    matrix === "gbr" ? "pc" : "tv",
    source,
  ]);
  const probe = await probeCompositionVideo(source);
  const asset: CompositionVisualMediaAsset = {
    id: name,
    type: "video",
    path: source,
    sha256: probe.sourceHash,
    width,
    height,
    frameRate: probe.frameRate,
    frameCount: probe.frameCount,
    color: probe.color,
  };
  return { source, asset, probe };
}
it("decodes burnt-in original frame numbers at 30000/1001 and reuses after physical relocation", async () => {
  const originals = Array.from({ length: 16 }, (_, i) => numberedFrame(i));
  const { asset, source, probe } = await video(
    "numbered",
    Buffer.concat(originals),
    64,
    32,
  );
  expect(probe.frameRate).toEqual({ numerator: 30000, denominator: 1001 });
  expect(probe.frameCount).toBe(16);
  const options = {
    asset,
    sourceDirectory: root,
    cacheDirectory: join(root, "numbered-cache"),
    ordinals: [15, 0, 7, 7],
  };
  const prepared = await prepareCompositionVisualMedia(options);
  expect(prepared.cacheHit).toBe(false);
  expect(prepared.frames.map((f) => f.ordinal)).toEqual([0, 7, 15]);
  for (const frame of prepared.frames) {
    const bytes = await readFile(prepared.assetPaths[frame.id]!);
    expect(hash(bytes)).toBe(frame.sha256);
    expect(
      maxDifference(mediaPngPixels(bytes), originals[frame.ordinal]!),
    ).toBeLessThanOrEqual(1);
  }
  const relocated = join(root, "relocated.mkv");
  await copyFile(source, relocated);
  const hit = await prepareCompositionVisualMedia({
    ...options,
    asset: { ...asset, id: "renamed", path: relocated },
  });
  expect(hit.cacheHit).toBe(true);
  expect(hit.key).toBe(prepared.key);
  expect(hit.frames[1]!.id).toBe("__media:renamed:7");
  const changedMapping = await prepareCompositionVisualMedia({
    ...options,
    mappingHash: "sha256:" + "1".repeat(64),
  });
  expect(changedMapping.cacheHit).toBe(false);
  expect(changedMapping.key).not.toBe(prepared.key);
});
it("converts a 16-bit BT.709 RGB ramp into independently calculated sRGB and preserves linear alpha", async () => {
  const raw = Buffer.alloc(256 * 16 * 8),
    expected = Buffer.alloc(256 * 16 * 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 256; x++) {
      const at = (y * 256 + x) * 8;
      for (let c = 0; c < 3; c++) raw.writeUInt16LE(x * 257, at + c * 2);
      raw.writeUInt16LE(y * 4369, at + 6);
      const v = x / 255,
        linear = v < 0.081 ? v / 4.5 : ((v + 0.099) / 1.099) ** (1 / 0.45),
        srgb =
          linear <= 0.0031308
            ? 12.92 * linear
            : 1.055 * linear ** (1 / 2.4) - 0.055;
      expected.set(
        [
          Math.round(srgb * 255),
          Math.round(srgb * 255),
          Math.round(srgb * 255),
          y * 17,
        ],
        (y * 256 + x) * 4,
      );
    }
  const { asset } = await video(
    "ramp",
    raw,
    256,
    16,
    "rgba64le",
    "bt709",
    "gbr",
    "24",
  );
  const prepared = await prepareCompositionVisualMedia({
    asset,
    sourceDirectory: root,
    cacheDirectory: join(root, "ramp-cache"),
    ordinals: [0],
  });
  const pixels = mediaPngPixels(
    await readFile(prepared.assetPaths[prepared.frames[0]!.id]!),
  );
  expect(maxDifference(pixels, expected)).toBeLessThanOrEqual(1);
  expect(pixels[128 * 4]).toBeGreaterThan(128 + 10);
});
it("converts limited-range BT.709 YUV neutral samples without treating limited codes as full range", async () => {
  const width = 220,
    height = 16,
    count = width * height;
  const raw = Buffer.alloc(count * 3, 128),
    expected = Buffer.alloc(count * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      raw[y * width + x] = x + 16;
      const v = x / 219,
        linear = v < 0.081 ? v / 4.5 : ((v + 0.099) / 1.099) ** (1 / 0.45),
        srgb =
          linear <= 0.0031308
            ? 12.92 * linear
            : 1.055 * linear ** (1 / 2.4) - 0.055;
      const value = Math.round(srgb * 255);
      expected.set([value, value, value, 255], (y * width + x) * 4);
    }
  const { asset } = await video(
    "limited",
    raw,
    width,
    height,
    "yuv444p",
    "bt709",
    "bt709",
    "24",
  );
  const prepared = await prepareCompositionVisualMedia({
    asset,
    sourceDirectory: root,
    cacheDirectory: join(root, "limited-cache"),
    ordinals: [0],
  });
  expect(
    maxDifference(
      mediaPngPixels(
        await readFile(prepared.assetPaths[prepared.frames[0]!.id]!),
      ),
      expected,
    ),
  ).toBeLessThanOrEqual(2);
});
async function sequence(name: string) {
  const directory = join(root, name);
  await mkdir(directory);
  const hashes: string[] = [];
  for (let i = 0; i < 3; i++) {
    const bytes = mediaRgbaPng(
      64,
      32,
      numberedFrame(i),
      i === 1 ? [mediaPngChunk("sRGB", Buffer.from([0]))] : [],
    );
    await writeFile(
      join(directory, `frame_${String(37 + i).padStart(4, "0")}.png`),
      bytes,
    );
    hashes.push(hash(bytes));
  }
  const manifest = Buffer.from(
    JSON.stringify({ schemaVersion: "composition-sequence-1", frames: hashes }),
  );
  await writeFile(join(directory, "manifest.json"), manifest);
  const asset: CompositionVisualMediaAsset = {
    id: name,
    type: "sequence",
    path: join(directory, "frame_%04d.png"),
    manifestPath: join(directory, "manifest.json"),
    firstFrame: 37,
    sha256: hash(manifest),
    width: 64,
    height: 32,
    frameRate: { numerator: 24, denominator: 1 },
    frameCount: 3,
    color,
  };
  return { asset, directory };
}
it("pins all sequence originals including unselected frames, with explicit untagged sRGB authority", async () => {
  const { asset, directory } = await sequence("sequence");
  const options = {
    asset,
    sourceDirectory: root,
    cacheDirectory: join(root, "sequence-cache"),
    ordinals: [0, 2],
  };
  const prepared = await prepareCompositionVisualMedia(options);
  expect(prepared.sourceProvenance.colorAuthorities).toEqual([
    "authored-untagged-srgb",
    "sRGB",
  ]);
  for (const frame of prepared.frames)
    expect(
      mediaPngPixels(await readFile(prepared.assetPaths[frame.id]!)),
    ).toEqual(numberedFrame(frame.ordinal));
  expect((await prepareCompositionVisualMedia(options)).cacheHit).toBe(true);
  await writeFile(
    join(directory, "frame_0038.png"),
    mediaRgbaPng(64, 32, numberedFrame(8)),
  );
  expect(await failureCode(prepareCompositionVisualMedia(options))).toBe(
    "comp-media-checksum",
  );
});
it("rejects modified prepared pixels and manifest provenance rather than reporting a cache hit", async () => {
  const { asset } = await sequence("tamper");
  const options = {
    asset,
    sourceDirectory: root,
    cacheDirectory: join(root, "tamper-cache"),
    ordinals: [1],
  };
  const prepared = await prepareCompositionVisualMedia(options),
    path = prepared.assetPaths[prepared.frames[0]!.id]!;
  const bytes = await readFile(path);
  const changed = Buffer.from(bytes);
  changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
  await writeFile(path, changed);
  expect(await failureCode(prepareCompositionVisualMedia(options))).toBe(
    "comp-media-checksum",
  );
  await writeFile(path, bytes);
  const manifestPath = join(dirname(path), "manifest.json"),
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.key = "sha256:" + "0".repeat(64);
  await writeFile(manifestPath, JSON.stringify(manifest));
  expect(await failureCode(prepareCompositionVisualMedia(options))).toBe(
    "comp-media-provenance",
  );
});
it("enforces configured live-frame and cumulative disk reservations before publication", async () => {
  const { asset } = await sequence("limits");
  const options = {
    asset,
    sourceDirectory: root,
    cacheDirectory: join(root, "limits-cache"),
    ordinals: [0],
  };
  expect(
    await failureCode(
      prepareCompositionVisualMedia({
        ...options,
        limits: { decodedFrameBytes: 4 },
      }),
    ),
  ).toBe("comp-media-limit");
  const prepared = await prepareCompositionVisualMedia(options);
  expect(
    await failureCode(
      prepareCompositionVisualMedia({
        ...options,
        ordinals: [1],
        limits: { decodedCacheBytes: prepared.cacheBytes + 10000 },
      }),
    ),
  ).toBe("comp-media-limit");
  expect(
    (await readdir(options.cacheDirectory)).filter((name) =>
      name.startsWith(".prepare-"),
    ).length,
  ).toBe(0);
});
it("serializes concurrent preparations of one cache identity into a miss and a verified hit", async () => {
  const { asset } = await sequence("concurrent");
  const options = {
    asset,
    sourceDirectory: root,
    cacheDirectory: join(root, "concurrent-cache"),
    ordinals: [0, 2],
  };
  const results = await Promise.all([
    prepareCompositionVisualMedia(options),
    prepareCompositionVisualMedia(options),
  ]);
  expect(results.map((result) => result.cacheHit).sort()).toEqual([
    false,
    true,
  ]);
  expect(results[0]!.key).toBe(results[1]!.key);
});
it("cancellation removes staging frames and leaves no published partial entry", async () => {
  const { asset } = await video(
    "cancel",
    Buffer.concat(Array.from({ length: 64 }, (_, i) => numberedFrame(i % 16))),
    64,
    32,
    "rgba",
    "bt709",
    "gbr",
    "24",
  );
  const cacheDirectory = join(root, "cancel-cache"),
    controller = new AbortController();
  const pending = prepareCompositionVisualMedia({
    asset,
    sourceDirectory: root,
    cacheDirectory,
    ordinals: Array.from({ length: 64 }, (_, i) => i),
    signal: controller.signal,
  });
  const cancellation = (async () => {
    for (let attempt = 0; attempt < 500; attempt++) {
      const entries = await readdir(cacheDirectory).catch(() => []);
      if (entries.some((name) => name.startsWith(".prepare-"))) {
        controller.abort();
        return;
      }
      await delay(2);
    }
    throw new Error("staging was never observed");
  })();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await cancellation;
  expect(
    (await readdir(cacheDirectory)).filter(
      (name) => name !== ".media.lock.recovery",
    ),
  ).toEqual([]);
});
