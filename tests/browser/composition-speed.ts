import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { renderComposition } from "@still-shift/animation-engine";
import type { Composition } from "@still-shift/scene-contract";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import { parallelChecksum } from "../helpers/composition-parallel-proof.ts";

const probe = process.argv.includes("--probe");
const frames = probe ? 8 : 2880;
const fps = 24;
const directory = await mkdtemp(join(tmpdir(), "ce15-speed-"));
console.log(
  JSON.stringify({ directory, frames, fps, durationSeconds: frames / fps }),
);
const audio = mediaFloat32Wave(
  (frames * 48000) / fps,
  2,
  (sample, channel) =>
    Math.sin((sample * 2 * Math.PI * (channel ? 431 : 173)) / 48000) * 0.125,
);
await writeFile(join(directory, "audio.wav"), audio.wav);
const composition: Composition = {
  schemaVersion: "composition-1",
  id: "two-minute-procedural-backdrop",
  width: 640,
  height: 360,
  fps,
  frameCount: frames,
  background: "#152335",
  assets: [
    {
      id: "audio",
      type: "audio",
      path: "audio.wav",
      sha256: parallelChecksum(audio.wav),
      sampleRate: 48000,
      sampleCount: (frames * 48000) / fps,
      channels: 2,
    },
  ],
  layers: [
    { id: "audio", type: "audio", asset: "audio", role: "bgm" },
    {
      id: "badge",
      type: "precomp",
      comp: "badge-art",
      transform: { anchor: [0, 0], position: [24, 24] },
    },
    {
      id: "evolving-backdrop",
      type: "solid",
      size: [640, 360],
      color: "#ffffff",
      transform: { anchor: [0, 0] },
      effects: [
        {
          id: "clouds",
          effect: "stylize.fractal-noise",
          params: {
            seed: 47,
            scale: 72,
            octaves: 8,
            amount: 1,
            contrast: 1.4,
            dark: "#152335",
            light: "#7da4bd",
            evolution: {
              keys: [
                { frame: 0, value: 0 },
                { frame: frames - 1, value: frames / fps },
              ],
            },
          },
        },
      ],
    },
  ],
  precomps: [
    {
      id: "badge-art",
      width: 128,
      height: 48,
      frameCount: frames,
      layers: [
        {
          id: "accent",
          type: "solid",
          size: [8, 48],
          color: "#e6aa52",
          transform: { anchor: [0, 0] },
        },
        {
          id: "panel",
          type: "solid",
          size: [128, 48],
          color: "#102031cc",
          transform: { anchor: [0, 0] },
        },
      ],
    },
  ],
};
const source = join(directory, "composition.json");
await writeFile(source, JSON.stringify(composition, null, 2) + "\n");
async function proof(path: string) {
  const hash = createHash("sha256");
  for await (const part of createReadStream(path)) hash.update(part);
  const decode = (audio: boolean) => {
    const result = spawnSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-threads",
        "1",
        "-i",
        path,
        ...(audio
          ? [
              "-map",
              "0:a:0",
              "-vn",
              "-c:a",
              "pcm_f32le",
              "-f",
              "hash",
              "-hash",
              "sha256",
            ]
          : [
              "-map",
              "0:v:0",
              "-an",
              "-threads",
              "1",
              "-pix_fmt",
              "rgba",
              "-f",
              "framemd5",
            ]),
        "pipe:1",
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 ** 2 },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const video = decode(false)
    .split("\n")
    .filter((line) => line && !line.startsWith("#"));
  assert.equal(video.length, frames);
  return { encoded: hash.digest("hex"), video, audio: decode(true) };
}
const reports: {
  workers: number;
  endToEndMs: number;
  output: Awaited<ReturnType<typeof proof>>;
  metrics: Awaited<ReturnType<typeof renderComposition>>["metrics"];
}[] = [];
for (const workers of [1, 4] as const) {
  const outputPath = join(directory, `workers-${workers}.mp4`);
  const start = performance.now();
  const result = await renderComposition({
    compositionPath: source,
    outputPath,
    backend: "canvas2d",
    workers,
    cacheStatic: true,
    format: "h264",
    transport: "raw_rgba",
  });
  const endToEndMs = performance.now() - start;
  const output = await proof(outputPath);
  if (reports.length) assert.deepEqual(output, reports[0]!.output);
  assert.equal(result.metrics.frameCount, frames);
  assert.equal(result.metrics.work!.concurrentWorkers, workers);
  reports.push({ workers, endToEndMs, output, metrics: result.metrics });
  await writeFile(
    join(directory, "results.json"),
    JSON.stringify({ status: "in-progress", reports }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      workers,
      endToEndMs,
      encodePathWallMs: result.metrics.encodePathWallMs,
      frameRenderAverageMs: result.metrics.frameRenderAverageMs,
      status: "passed",
    }),
  );
}
const speedup = reports[0]!.endToEndMs / reports[1]!.endToEndMs;
assert.deepEqual(
  reports[0]!.metrics.renderEnvironment,
  reports[1]!.metrics.renderEnvironment,
);
await writeFile(
  join(directory, "results.json"),
  JSON.stringify(
    {
      status: probe ? "probe-only" : speedup >= 3 ? "passed" : "failed-speed",
      frames,
      fps,
      durationSeconds: frames / fps,
      speedup,
      reports,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    directory,
    speedup,
    status: probe ? "probe-only" : speedup >= 3 ? "passed" : "failed-speed",
  }),
);
if (!probe) {
  assert.equal(frames / fps, 120);
  assert.ok(speedup >= 3, `Four-worker speedup ${speedup} must reach 3`);
}
