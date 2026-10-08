import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import { loadPassageCompositions } from "../../packages/animation-engine/src/passage-compositions.ts";
import { compositionSequenceFramePath } from "../../packages/animation-engine/src/composition-media-sequence.ts";
import { probeCompositionVideo } from "@still-shift/animation-engine";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import type { Composition } from "@still-shift/scene-contract";
import type { PreparedPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";

let directory: string;
const hash = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const passage = {
  beats: [
    { id: "beat", scene: { width: 64, height: 48, fps: 24, frameCount: 6 } },
  ],
} as unknown as Pick<PreparedPassage, "beats">;
let composition: Composition;
let references: string;
beforeAll(async () => {
  directory = await realpath(
    await mkdtemp("/private/tmp/ce13-native-passage-"),
  );
  const rgba = Buffer.alloc(32 * 16 * 4, 255);
  const png = mediaRgbaPng(32, 16, rgba, [
    mediaPngChunk("sRGB", Buffer.from([0])),
  ]);
  for (let frame = 7; frame < 10; frame++)
    await writeFile(join(directory, `frame_${frame}.png`), png);
  await writeFile(join(directory, "still.png"), png);
  const manifest = Buffer.from(
    JSON.stringify({
      schemaVersion: "composition-sequence-1",
      frames: [hash(png), hash(png), hash(png)],
    }),
  );
  await writeFile(join(directory, "manifest.json"), manifest);
  const audio = mediaFloat32Wave(12000, 2, (sample, channel) =>
    sample === 11999 ? (channel ? -0.125 : 0.0625) : 0,
  );
  await writeFile(join(directory, "audio.wav"), audio.wav);
  composition = {
    schemaVersion: "composition-1",
    id: "native-passage",
    width: 64,
    height: 48,
    fps: 24,
    frameCount: 6,
    assets: [
      {
        id: "frames",
        type: "sequence",
        path: "frame_%01d.png",
        firstFrame: 7,
        manifestPath: "manifest.json",
        sha256: hash(manifest),
        width: 32,
        height: 16,
        frameCount: 3,
        frameRate: { numerator: 12, denominator: 1 },
        color: {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "gbr",
          range: "pc",
        },
      },
      {
        id: "sound",
        type: "audio",
        path: "audio.wav",
        sha256: hash(audio.wav),
        sampleRate: 48000,
        sampleCount: 12000,
        channels: 2,
      },
      {
        id: "still",
        type: "image",
        path: "still.png",
        sha256: hash(png),
        width: 32,
        height: 16,
      },
    ],
    layers: [
      { id: "picture", type: "sequence", asset: "frames" },
      { id: "sound", type: "audio", asset: "sound", role: "sfx" },
      {
        id: "still",
        type: "image",
        size: [32, 16],
        sources: [{ asset: "still" }],
      },
    ],
  };
  await writeFile(
    join(directory, "composition.json"),
    JSON.stringify(composition),
  );
  references = join(directory, "references.json");
  await writeFile(references, JSON.stringify({ beat: "composition.json" }));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
const options = () => ({ cacheDirectory: join(directory, "cache") });

it("keeps original sequence, manifest, audio and still paths after preparing a native beat", async () => {
  const checked: string[] = [];
  const loaded = (
    await loadPassageCompositions(
      references,
      passage,
      async (path) => {
        checked.push(path);
        await realpath(path);
      },
      options(),
    )
  ).beat!;
  expect(loaded.assets.map((asset) => asset.path)).toEqual([
    join(directory, "frame_%01d.png"),
    join(directory, "audio.wav"),
    join(directory, "still.png"),
  ]);
  const sequence = loaded.assets[0]!;
  expect(sequence.type === "sequence" && sequence.manifestPath).toBe(
    join(directory, "manifest.json"),
  );
  expect(checked).toEqual([
    references,
    join(directory, "composition.json"),
    join(directory, "manifest.json"),
    ...[7, 8, 9].map((frame) => join(directory, `frame_${frame}.png`)),
    join(directory, "audio.wav"),
    join(directory, "still.png"),
  ]);
  expect(composition.assets[0]!.path).toBe("frame_%01d.png");
  expect(
    JSON.parse(await readFile(join(directory, "composition.json"), "utf8")),
  ).toEqual(composition);
});
it("checks manifest and every original PNG before source preparation", async () => {
  for (const denied of ["manifest.json", "frame_8.png"]) {
    const checked: string[] = [];
    await expect(
      loadPassageCompositions(
        references,
        passage,
        async (path) => {
          checked.push(path);
          if (path === join(directory, denied))
            throw Error("Original path denied");
        },
        options(),
      ),
    ).rejects.toThrow("Original path denied");
    expect(checked.at(-1)).toBe(join(directory, denied));
    expect(checked).not.toContain(join(directory, "audio.wav"));
  }
});
it("preserves actual original video and explicitly declared embedded-audio bindings", async () => {
  const videoPath = join(directory, "source.mkv");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-framerate",
    "12",
    "-start_number",
    "7",
    "-i",
    join(directory, "frame_%01d.png"),
    "-i",
    join(directory, "audio.wav"),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-frames:v",
    "3",
    "-vf",
    "setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=gbr:range=full",
    "-c:v",
    "ffv1",
    "-pix_fmt",
    "gbrap16le",
    "-c:a",
    "pcm_f32le",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "iec61966-2-1",
    "-colorspace",
    "0",
    "-color_range",
    "pc",
    videoPath,
  ]);
  const probe = await probeCompositionVideo(videoPath);
  const document = structuredClone(composition);
  document.assets[0] = {
    id: "frames",
    type: "video",
    path: "source.mkv",
    sha256: probe.sourceHash,
    width: probe.width,
    height: probe.height,
    frameCount: probe.frameCount,
    frameRate: probe.frameRate,
    color: probe.color,
  };
  const picture = document.layers[0]!;
  if (picture.type !== "sequence") throw Error("Expected sequence");
  document.layers[0] = { ...picture, type: "video" };
  document.assets[1] = {
    id: "sound",
    type: "audio",
    path: "source.mkv",
    sha256: probe.sourceHash,
    sampleRate: 48000,
    sampleCount: 12000,
    channels: 2,
  };
  await writeFile(join(directory, "video.json"), JSON.stringify(document));
  const videoReferences = join(directory, "video-references.json");
  await writeFile(videoReferences, JSON.stringify({ beat: "video.json" }));
  const loaded = (
    await loadPassageCompositions(
      videoReferences,
      passage,
      undefined,
      options(),
    )
  ).beat!;
  expect(loaded.assets[0]!.path).toBe(videoPath);
  expect(loaded.assets[1]!.path).toBe(videoPath);
  expect(loaded.assets[0]!.sha256).toBe(probe.sourceHash);
});
it("uses the contract's bounded two-digit padding widths for authorization and actual decoding", async () => {
  const document = structuredClone(composition),
    asset = document.assets[0]!;
  if (asset.type !== "sequence") throw Error("Expected sequence");
  asset.path = "padded_%010d.png";
  for (let frame = 7; frame < 10; frame++)
    await writeFile(
      compositionSequenceFramePath(join(directory, asset.path), frame),
      await readFile(join(directory, `frame_${frame}.png`)),
    );
  await writeFile(join(directory, "padded.json"), JSON.stringify(document));
  const paddedReferences = join(directory, "padded-references.json");
  await writeFile(paddedReferences, JSON.stringify({ beat: "padded.json" }));
  const checked: string[] = [];
  const loaded = (
    await loadPassageCompositions(
      paddedReferences,
      passage,
      async (path) => {
        checked.push(path);
        await realpath(path);
      },
      options(),
    )
  ).beat!;
  expect(loaded.assets[0]!.path).toBe(join(directory, "padded_%010d.png"));
  expect(checked).toContain(join(directory, "padded_0000000007.png"));
});
it("honors cancellation before reading or authorizing native references", async () => {
  const controller = new AbortController();
  controller.abort(Error("Native references cancelled"));
  let called = false;
  await expect(
    loadPassageCompositions(
      references,
      passage,
      async () => {
        called = true;
      },
      { ...options(), signal: controller.signal },
    ),
  ).rejects.toThrow("Native references cancelled");
  expect(called).toBe(false);
});

it("watches the same original PNGs for a two-digit-width preview pattern", async () => {
  const document = structuredClone(composition),
    asset = document.assets[0]!;
  if (asset.type !== "sequence") throw Error("Expected sequence");
  asset.path = "watched_%010d.png";
  for (let frame = 7; frame < 10; frame++)
    await writeFile(
      join(directory, `watched_${String(frame).padStart(10, "0")}.png`),
      await readFile(join(directory, `frame_${frame}.png`)),
    );
  const input = join(directory, "watched.json");
  await writeFile(input, JSON.stringify(document));
  const app = await createProgramPreview(input, { watch: true });
  const base = new URL(app.url).origin;
  try {
    const revision = app.snapshot()!.revision;
    const path = join(directory, "watched_0000000008.png"),
      original = await readFile(path);
    await writeFile(path, Buffer.concat([original, Buffer.from([0])]));
    await expect
      .poll(
        async () =>
          (
            await (await fetch(base + "/composition/program")).json()
          ).diagnostics.some((diagnostic: { message: string }) =>
            diagnostic.message.includes("Original sequence frame differs"),
          ),
        { timeout: 6000 },
      )
      .toBe(true);
    expect(app.snapshot()!.revision).toBe(revision);
    await writeFile(path, original);
    await expect
      .poll(() => app.snapshot()?.revision, { timeout: 6000 })
      .toBeGreaterThan(revision);
  } finally {
    await app.close();
  }
});
