import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareCompositionAudio,
  prepareCompositionAudioSource,
  prepareCompositionVisualMedia,
} from "@still-shift/animation-engine";
import type {
  Composition,
  CompositionAsset,
} from "@still-shift/scene-contract";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import { mediaRgbaPng } from "../helpers/composition-media-png.ts";

let root: string;
const hash = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "composition-media-platform-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

it.each(["platform", "arch"] as const)(
  "partitions actual visual, source PCM and mix caches by %s",
  async (field) => {
    const { wav } = mediaFloat32Wave(2000, 1, () => 0.25);
    const audio: Extract<CompositionAsset, { type: "audio" }> = {
      id: "voice",
      type: "audio",
      path: join(root, `${field}.wav`),
      sha256: hash(wav),
      sampleRate: 48000,
      sampleCount: 2000,
      channels: 1,
    };
    await writeFile(audio.path, wav);
    const png = mediaRgbaPng(2, 2, Buffer.alloc(16, 255));
    const manifest = Buffer.from(
      JSON.stringify({
        schemaVersion: "composition-sequence-1",
        frames: [hash(png)],
      }),
    );
    const visual: Extract<CompositionAsset, { type: "sequence" }> = {
      id: "frames",
      type: "sequence",
      path: join(root, `${field}-%01d.png`),
      manifestPath: join(root, `${field}-sequence.json`),
      firstFrame: 0,
      sha256: hash(manifest),
      width: 2,
      height: 2,
      frameCount: 1,
      frameRate: { numerator: 24, denominator: 1 },
      color: {
        primaries: "bt709",
        transfer: "iec61966-2-1",
        matrix: "gbr",
        range: "pc",
      },
    };
    await writeFile(join(root, `${field}-0.png`), png);
    await writeFile(visual.manifestPath, manifest);
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "platform",
      width: 64,
      height: 64,
      fps: 24,
      frameCount: 1,
      assets: [audio],
      layers: [{ id: "voice", type: "audio", asset: audio.id }],
    };
    const cacheDirectory = join(root, `cache-${field}`);
    const prepare = async () => {
      const picture = await prepareCompositionVisualMedia({
        asset: visual,
        sourceDirectory: root,
        cacheDirectory,
        ordinals: [0],
      });
      const source = await prepareCompositionAudioSource({
        asset: audio,
        sourceDirectory: root,
        cacheDirectory,
      });
      const mix = (await prepareCompositionAudio(comp, root, {
        cacheDirectory,
      }))!;
      return { picture, source, mix };
    };
    const original = await prepare();
    const descriptor = Object.getOwnPropertyDescriptor(process, field)!;
    const alternate =
      field === "platform"
        ? process.platform === "darwin"
          ? "linux"
          : "darwin"
        : process.arch === "arm64"
          ? "x64"
          : "arm64";
    // Vary only the declared execution identity; real FFmpeg inputs/build stay fixed.
    let changed: Awaited<ReturnType<typeof prepare>>;
    try {
      Object.defineProperty(process, field, {
        ...descriptor,
        value: alternate,
      });
      changed = await prepare();
    } finally {
      Object.defineProperty(process, field, descriptor);
    }
    const restored = await prepare();
    for (const kind of ["picture", "source", "mix"] as const) {
      expect(original[kind].cacheHit).toBe(false);
      expect.soft(changed[kind].cacheHit, kind).toBe(false);
      expect.soft(changed[kind].key, kind).not.toBe(original[kind].key);
      expect(restored[kind].cacheHit, kind).toBe(true);
      expect(restored[kind].key, kind).toBe(original[kind].key);
    }
    expect(changed.picture.ffmpegIdentity).toBe(
      original.picture.ffmpegIdentity,
    );
    expect(changed.source.ffmpegIdentity).toBe(original.source.ffmpegIdentity);
    expect(await readFile(changed.source.path)).toEqual(
      await readFile(original.source.path),
    );
    expect(await readFile(changed.mix.assetPaths["__audio:mix"]!)).toEqual(
      await readFile(original.mix.assetPaths["__audio:mix"]!),
    );
  },
);
