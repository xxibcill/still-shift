import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import type { Composition } from "@still-shift/scene-contract";
import {
  COMPOSITION_OUTPUT_FORMATS,
  compositionOutputProfile,
} from "../../packages/execution-runtime/src/composition-output.ts";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";
import {
  parallelChecksum,
  parallelOutputProof,
  verifyParallelMetrics,
} from "../helpers/composition-parallel-proof.ts";
import { verifyParallelLifecycle } from "../helpers/composition-parallel-lifecycle.ts";
import { verifyParallelNativeMedia } from "../helpers/composition-parallel-native.ts";
import { verifyParallelPrefixes } from "../helpers/composition-parallel-prefixes.ts";
import { verifyParallelRoots } from "../helpers/composition-parallel-roots.ts";
import { verifyParallelSources } from "../helpers/composition-parallel-sources.ts";

const directory = await mkdtemp(join(tmpdir(), "ce15-parallel-"));
const width = 32,
  height = 24,
  frames = 8;
const rgba = Buffer.alloc(width * height * 4);
for (let pixel = 0; pixel < width * height; pixel++)
  rgba.set([255, 127, 63, pixel % 256], pixel * 4);
const ramp = mediaRgbaPng(width, height, rgba, [
  mediaPngChunk("sRGB", Buffer.from([0])),
]);
const sound = mediaFloat32Wave(6400, 2, (sample, channel) =>
  sample === 6399
    ? channel
      ? -0.125
      : 0.0625
    : Math.sin((sample * 2 * Math.PI * (channel ? 997 : 431)) / 48000) * 0.3,
);
await writeFile(join(directory, "ramp.png"), ramp);
await writeFile(join(directory, "sound.wav"), sound.wav);
const composition: Composition = {
  schemaVersion: "composition-1",
  id: "parallel-absolute",
  width,
  height,
  fps: 60,
  frameCount: frames,
  background: null,
  assets: [
    {
      id: "ramp",
      type: "image",
      path: "ramp.png",
      sha256: parallelChecksum(ramp),
      width,
      height,
    },
    {
      id: "sound",
      type: "audio",
      path: "sound.wav",
      sha256: parallelChecksum(sound.wav),
      sampleRate: 48000,
      sampleCount: 6400,
      channels: 2,
    },
  ],
  layers: [
    {
      id: "moving",
      type: "solid",
      size: [9, 7],
      color: "#7799cc80",
      transform: {
        anchor: [0, 0],
        position: {
          keys: [
            { frame: 0, value: [0.35, 2.25], easing: "linear" },
            { frame: 7, value: [21.65, 11.75] },
          ],
        },
      },
    },
    {
      id: "host",
      type: "precomp",
      comp: "inside",
      transform: { anchor: [0, 0], position: [0.5, 0.25] },
    },
    { id: "sound", type: "audio", asset: "sound", role: "sfx" },
  ],
  precomps: [
    {
      id: "inside",
      width,
      height,
      fps: 60,
      frameCount: frames,
      background: null,
      layers: [
        {
          id: "ramp",
          type: "image",
          sources: [{ asset: "ramp" }],
          size: [width, height],
          fit: "stretch",
          transform: { anchor: [0, 0] },
        },
      ],
    },
  ],
};
const path = join(directory, "source.json");
await writeFile(path, JSON.stringify(composition));
const reports: unknown[] = [];
for (const backend of ["canvas2d", "webgl2"] as const)
  for (const transport of ["png_pipe", "raw_rgba"] as const)
    for (const format of COMPOSITION_OUTPUT_FORMATS) {
      const profile = compositionOutputProfile(format);
      const prefix = `${backend}-${transport}-${format}`;
      const suffix =
        profile.container === "image2" ? ".%06d.png" : `.${profile.container}`;
      const baselinePath = join(directory, prefix + "-baseline" + suffix);
      const baseline = await renderComposition({
        compositionPath: path,
        outputPath: baselinePath,
        backend,
        transport,
        format,
      });
      assert.equal(baseline.metrics.work, undefined);
      const parallelPath = join(directory, prefix + "-parallel" + suffix);
      const parallel = await renderComposition({
        compositionPath: path,
        outputPath: parallelPath,
        backend,
        transport,
        format,
        workers: 4,
      });
      verifyParallelMetrics(parallel.metrics, 4, true, 1);
      const expected = await parallelOutputProof(
        baselinePath,
        baseline.metrics,
      );
      const actual = await parallelOutputProof(parallelPath, parallel.metrics);
      assert.deepEqual(actual, expected, prefix);
      assert.equal(
        new Set(actual.decodedFrames).size,
        frames,
        "fixture must change at every absolute frame",
      );
      reports.push({
        backend,
        transport,
        format,
        proof: actual,
        metrics: parallel.metrics,
      });
      console.log("Parallel format:", prefix);
    }
for (const backend of ["canvas2d", "webgl2"] as const) {
  let expected;
  for (const [workers, cacheStatic] of [
    [1, true],
    [2, true],
    [3, true],
    [4, false],
    [4, true],
  ] as const) {
    const output = join(
      directory,
      `options-${backend}-${workers}-${cacheStatic}.%06d.png`,
    );
    const result = await renderComposition({
      compositionPath: path,
      outputPath: output,
      backend,
      format: "png8",
      transport: "raw_rgba",
      workers,
      cacheStatic,
    });
    verifyParallelMetrics(result.metrics, workers, cacheStatic, 1);
    const proof = await parallelOutputProof(output, result.metrics);
    if (expected) assert.deepEqual(proof, expected);
    else expected = proof;
    reports.push({
      backend,
      workers,
      cacheStatic,
      proof,
      metrics: result.metrics,
    });
  }
  for (const cacheStatic of [false, true]) {
    const output = join(
      directory,
      `implicit-worker-${backend}-${cacheStatic}.%06d.png`,
    );
    const result = await renderComposition({
      compositionPath: path,
      outputPath: output,
      backend,
      format: "png8",
      transport: "raw_rgba",
      cacheStatic,
    });
    verifyParallelMetrics(result.metrics, 1, cacheStatic, 1);
    const proof = await parallelOutputProof(output, result.metrics);
    assert.deepEqual(proof, expected);
    reports.push({
      backend,
      implicitWorker: true,
      cacheStatic,
      proof,
      metrics: result.metrics,
    });
  }
  for (const transport of ["png_pipe", "raw_rgba"] as const) {
    let baseline;
    for (const workers of [undefined, 4] as const) {
      const output = join(
        directory,
        `legacy-${backend}-${transport}-${workers}.mp4`,
      );
      const result = await renderComposition({
        compositionPath: path,
        outputPath: output,
        backend,
        transport,
        ...(workers ? { workers } : {}),
      });
      assert.equal(result.metrics.output, undefined);
      if (workers) verifyParallelMetrics(result.metrics, workers, true, 1);
      const proof = await parallelOutputProof(output, result.metrics);
      if (baseline) assert.deepEqual(proof, baseline);
      else baseline = proof;
      reports.push({
        backend,
        transport,
        legacy: true,
        workers,
        proof,
        metrics: result.metrics,
      });
    }
  }
}
const cliPath = join(directory, "cli.%06d.png");
let stdout = "",
  stderr = "";
assert.equal(
  await runCli(
    [
      "comp",
      "render",
      "--input",
      path,
      "--output",
      cliPath,
      "--backend",
      "webgl2",
      "--format",
      "png8",
      "--transport",
      "raw_rgba",
      "--workers",
      "4",
      "--cache-static",
      "true",
    ],
    {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
    },
  ),
  0,
  stderr,
);
const cli = JSON.parse(stdout);
verifyParallelMetrics(cli.metrics, 4, true, 1);
assert.deepEqual(
  await parallelOutputProof(cliPath, cli.metrics),
  await parallelOutputProof(
    join(directory, "options-webgl2-4-true.%06d.png"),
    JSON.parse(
      await readFile(
        join(directory, "options-webgl2-4-true.%06d.png.result.json"),
        "utf8",
      ),
    ).metrics,
  ),
);
reports.push({ cli: true, metrics: cli.metrics });
const native = await verifyParallelNativeMedia(directory, composition);
const sources = await verifyParallelSources(directory);
const roots = await verifyParallelRoots(directory);
const prefixes = await verifyParallelPrefixes(directory);
const failures = await verifyParallelLifecycle(directory, path);
const result = {
  status: "passed",
  directory,
  formats: reports,
  native,
  sources,
  roots,
  prefixes,
  failures,
};
await writeFile(
  join(directory, "results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: "passed",
    directory,
    exports: reports.length,
    nativeCases: native.length,
    sourceCases: sources.length,
    rootCases: roots.length,
    prefixCases: prefixes.length,
    failures: failures.length,
  }),
);
