import {
  COMPOSITION_OUTPUT_FORMATS,
  compositionOutputProfile,
} from "../../packages/execution-runtime/src/composition-output.ts";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import {
  compositionPcmBoundary,
  type Composition,
} from "@still-shift/scene-contract";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import {
  parallelChecksum,
  parallelOutputProof,
} from "../helpers/composition-parallel-proof.ts";
const directory = await mkdtemp(join(tmpdir(), "ce15-fps-audio-"));
const reports = [];
for (const fps of [1, 7, 29, 59, 60]) {
  const sampleCount = compositionPcmBoundary(5, fps);
  const sound = mediaFloat32Wave(
    sampleCount,
    2,
    (sample, channel) => ((sample % 31) / 31 - 0.5) * (channel ? -0.2 : 0.2),
  );
  await writeFile(join(directory, `${fps}.wav`), sound.wav);
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "fractional-pcm-clock",
    width: 32,
    height: 24,
    fps,
    frameCount: 5,
    background: "#223344",
    assets: [
      {
        id: "sound",
        type: "audio",
        path: `${fps}.wav`,
        sha256: parallelChecksum(sound.wav),
        sampleRate: 48000,
        sampleCount,
        channels: 2,
      },
    ],
    layers: [
      { id: "sound", type: "audio", asset: "sound", inPoint: 1, outPoint: 4 },
      {
        id: "panel",
        type: "solid",
        size: [12, 9],
        color: "#ddaa55",
        transform: {
          position: {
            keys: [
              { frame: 0, value: [2, 3] },
              { frame: 4, value: [17, 12] },
            ],
          },
        },
      },
    ],
  };
  const source = join(directory, `${fps}.json`);
  await writeFile(source, JSON.stringify(composition));
  for (const format of COMPOSITION_OUTPUT_FORMATS) {
    let expected;
    for (const workers of [undefined, 1, 4] as const) {
      const profile = compositionOutputProfile(format);
      const outputPath = join(
        directory,
        `${fps}-${format}-${workers ?? "baseline"}${profile.container === "image2" ? ".%06d.png" : "." + profile.container}`,
      );
      const { metrics } = await renderComposition({
        compositionPath: source,
        outputPath,
        format,
        transport: "raw_rgba",
        ...(workers ? { workers } : {}),
      });
      assert.equal(metrics.audio!.sampleCount, sampleCount);
      const proof = await parallelOutputProof(outputPath, metrics);
      if (expected) assert.deepEqual(proof, expected);
      else expected = proof;
      reports.push({ fps, format, workers, proof, metrics });
      console.log(JSON.stringify({ fps, format, workers, status: "passed" }));
    }
  }
}
await writeFile(
  join(directory, "results.json"),
  JSON.stringify({ status: "passed", reports }, null, 2) + "\n",
);
console.log(
  JSON.stringify({ status: "passed", directory, exports: reports.length }),
);
