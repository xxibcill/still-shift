import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadComposition,
  renderComposition,
} from "@still-shift/animation-engine";
import {
  COMPOSITION_OUTPUT_FORMATS,
  compositionOutputProfile,
} from "../../packages/execution-runtime/src/composition-output.ts";
import type { CompositionOutputProfile } from "../../packages/execution-runtime/src/composition-output.ts";
import type { Composition } from "@still-shift/scene-contract";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
  mediaPngPixels,
} from "../helpers/composition-media-png.ts";
import {
  captureCompositionOutputPreviews,
  encodeCompositionOutputPreview,
} from "../helpers/composition-output-preview.ts";
import {
  verifyCompositionOutputDimensions,
  verifyCompositionOutputLifecycle,
} from "../helpers/composition-output-lifecycle.ts";

const hash = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const width = 256,
  height = 16,
  frames = 4,
  fps = 60;
const alphaAt = (x: number, y: number) => (y < 8 ? x : 255 - x);
const directory = await mkdtemp(join(tmpdir(), "composition-output-"));
const rgba = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++)
    rgba.set([255, 255, 255, alphaAt(x, y)], (y * width + x) * 4);
const png = mediaRgbaPng(width, height, rgba, [
  mediaPngChunk("sRGB", Buffer.from([0])),
]);
const audio = mediaFloat32Wave(3200, 2, (sample, channel) =>
  sample === 3199
    ? channel
      ? -0.125
      : 0.0625
    : Math.sin((sample * 2 * Math.PI * (channel ? 997 : 431)) / 48000) * 0.3,
);
await writeFile(join(directory, "ramp.png"), png);
await writeFile(join(directory, "audio.wav"), audio.wav);
const comp: Composition = {
  schemaVersion: "composition-1",
  id: "ce15-output",
  width,
  height,
  fps,
  frameCount: frames,
  background: null,
  assets: [
    {
      id: "ramp",
      type: "image",
      path: "ramp.png",
      sha256: hash(png),
      width,
      height,
    },
    {
      id: "sound",
      type: "audio",
      path: "audio.wav",
      sha256: hash(audio.wav),
      sampleRate: 48000,
      sampleCount: 3200,
      channels: 2,
    },
  ],
  layers: [
    {
      id: "ramp",
      type: "image",
      sources: [{ asset: "ramp" }],
      size: [width, height],
      fit: "stretch",
      transform: { anchor: [0, 0] },
    },
    { id: "sound", type: "audio", asset: "sound", role: "sfx" },
  ],
};
const compositionPath = join(directory, "source.json");
await writeFile(compositionPath, `${JSON.stringify(comp)}\n`);
const loaded = await loadComposition(compositionPath, "canvas2d", {
  cacheDirectory: join(directory, "media-cache"),
});
const previewFrames = await captureCompositionOutputPreviews(loaded, directory);

function decode(
  path: string,
  profile: CompositionOutputProfile,
  pixelFormat: string,
) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-threads",
      "1",
      ...(profile.format === "vp9alpha" ? ["-c:v", "libvpx-vp9"] : []),
      ...(profile.container === "image2"
        ? ["-framerate", String(fps), "-start_number", "0"]
        : []),
      "-i",
      path,
      "-map",
      "0:v:0",
      "-an",
      "-sn",
      "-dn",
      "-threads",
      "1",
      "-pix_fmt",
      pixelFormat,
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { maxBuffer: 1024 * 1024 },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

function verifyPixels(path: string, profile: CompositionOutputProfile) {
  const native =
    profile.format === "prores4444"
      ? "yuva444p12le"
      : profile.format === "vp9alpha"
        ? "yuva420p"
        : profile.format === "png16"
          ? "rgba64be"
          : "rgba";
  const bytes = decode(path, profile, native);
  const pixels = width * height;
  const frameBytes =
    native === "yuva444p12le"
      ? pixels * 8
      : native === "yuva420p"
        ? (pixels * 5) / 2
        : native === "rgba64be"
          ? pixels * 8
          : pixels * 4;
  assert.equal(bytes.length, frameBytes * frames);
  for (let frame = 0; frame < frames; frame++)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x,
          base = frame * frameBytes;
        const expected = profile.alpha ? alphaAt(x, y) : 255;
        const actual =
          native === "yuva444p12le"
            ? Math.round(
                (bytes.readUInt16LE(base + pixels * 6 + pixel * 2) * 255) /
                  4095,
              )
            : native === "yuva420p"
              ? bytes[base + (pixels * 3) / 2 + pixel]!
              : native === "rgba64be"
                ? bytes.readUInt16BE(base + pixel * 8 + 6) / 257
                : bytes[base + pixel * 4 + 3]!;
        assert.equal(
          actual,
          expected,
          `${profile.format} alpha/frame/xy ${frame}/${x}/${y}`,
        );
        if (profile.container === "image2") {
          const expectedRgb = expected
            ? native === "rgba64be"
              ? 65535
              : 255
            : 0;
          for (let channel = 0; channel < 3; channel++)
            assert.equal(
              native === "rgba64be"
                ? bytes.readUInt16BE(base + pixel * 8 + channel * 2)
                : bytes[base + pixel * 4 + channel],
              expectedRgb,
            );
        }
      }
  const rgb = native === "rgba" ? bytes : decode(path, profile, "rgba");
  // Fixed primary-curve values calculated independently at 60 decimal digits.
  const samples = [
    [0, 0],
    [1, 0],
    [16, 6],
    [32, 17],
    [64, 48],
    [128, 115],
    [192, 185],
    [254, 254],
    [255, 255],
  ];
  if (!profile.alpha)
    for (const [x, expected] of samples) {
      const offset = (4 * width + x!) * 4;
      for (let channel = 0; channel < 3; channel++)
        assert.ok(
          Math.abs(rgb[offset + channel]! - expected!) <= 4,
          `${profile.format} BT.709 gray ${x}: ${rgb[offset + channel]}/${expected}`,
        );
    }
  return {
    frames,
    nativePixelFormat: native,
    alphaSamples: width * height * frames,
    alpha: "exact at authored 8-bit values",
    pngRgb: profile.container === "image2" ? "native-depth exact" : undefined,
    bt709GraySamples: !profile.alpha ? samples.length : 0,
  };
}

const reports = [];
const checksums = new Map<string, string>();
const previewChecksums = new Map<string, string>();
for (const backend of ["canvas2d", "webgl2"] as const)
  for (const transport of ["raw_rgba", "png_pipe"] as const)
    for (const format of COMPOSITION_OUTPUT_FORMATS) {
      const profile = compositionOutputProfile(format);
      const outputPath = join(
        directory,
        `${format}-${backend}-${transport}` +
          (profile.container === "image2"
            ? ".%06d.png"
            : `.${profile.container}`),
      );
      const result = await renderComposition({
        compositionPath,
        outputPath,
        backend,
        transport,
        format,
        cacheDirectory: join(directory, "media-cache"),
      });
      const pixels = verifyPixels(outputPath, profile);
      const stats = result.metrics.compositionStatistics;
      assert.ok(stats, "ordinary composition exports include statistics");
      assert.equal(stats.frameCount, result.metrics.frameCount);
      assert.equal(stats.cacheEnabled, false);
      assert.equal(stats.cacheHits, 0);
      const memory = result.metrics.compositionMemory;
      assert.ok(memory);
      assert.equal(memory.workers.length, 1);
      assert.deepEqual(memory.workers[0]!.afterAcknowledgement?.current, {
        pixels: 0,
        metadata: 0,
      });
      assert.equal(memory.workers[0]!.afterAcknowledgement?.reservations, 0);
      assert.ok(stats.byLayerType.length > 0);
      assert.ok(
        stats.byLayerType.every(
          (row) =>
            row.submissionWallMsPerOutputFrame ===
            row.submissionWallMs / stats.frameCount,
        ),
      );
      const previewKey = `${backend}/${format}`;
      if (!previewChecksums.has(previewKey)) {
        const previewPath = join(
          directory,
          `${format}-${backend}-preview` +
            (profile.container === "image2"
              ? ".%06d.png"
              : `.${profile.container}`),
        );
        encodeCompositionOutputPreview(
          loaded,
          profile,
          previewFrames.get(`${backend}/${profile.alpha}`)!,
          previewPath,
        );
        assert.deepEqual(
          decode(outputPath, profile, "rgba"),
          decode(previewPath, profile, "rgba"),
          `${format}/${backend}: independent preview encoder decoded pixels`,
        );
        if (profile.container === "image2") {
          const hashes = [];
          for (let frame = 0; frame < frames; frame++) {
            const bytes = await readFile(
              previewPath.replace("%06d", String(frame).padStart(6, "0")),
            );
            assert.equal(
              hash(bytes),
              result.metrics.output!.sequence!.frames[frame],
            );
            hashes.push(hash(bytes));
          }
          previewChecksums.set(
            previewKey,
            hash(Buffer.from(JSON.stringify(hashes))),
          );
        } else {
          const checksum = hash(await readFile(previewPath));
          assert.equal(
            checksum,
            result.checksums.output,
            `${format}/${backend}: independent encoder media bytes`,
          );
          previewChecksums.set(previewKey, checksum);
        }
      }
      const checksum = result.checksums.output;
      if (checksums.has(format))
        assert.equal(
          checksum,
          checksums.get(format),
          `${format} backend/transport repeat bytes`,
        );
      else checksums.set(format, checksum);
      assert.equal(result.metrics.audio?.sampleCount, 3200);
      if (profile.audioCodec !== "aac" && profile.container !== "image2")
        assert.equal(result.metrics.audio?.decodedSampleCount, 3200);
      if (profile.container === "image2") {
        const sequence = result.metrics.output!.sequence!;
        assert.equal(sequence.frames.length, frames);
        assert.equal(hash(await readFile(sequence.manifestPath)), checksum);
        assert.equal(
          hash(await readFile(sequence.audioPath!)),
          result.metrics.audio!.sourceChecksum,
        );
        for (let frame = 0; frame < frames; frame++)
          assert.equal(
            hash(
              await readFile(
                outputPath.replace("%06d", String(frame).padStart(6, "0")),
              ),
            ),
            sequence.frames[frame],
          );
        if (backend === "canvas2d" && transport === "raw_rgba") {
          const imported: Composition = {
            ...comp,
            assets: [
              {
                id: "sequence",
                type: "sequence",
                path: outputPath,
                manifestPath: sequence.manifestPath,
                firstFrame: 0,
                sha256: checksum,
                width,
                height,
                frameCount: frames,
                frameRate: { numerator: fps, denominator: 1 },
                color: {
                  primaries: "bt709",
                  transfer: "bt709",
                  matrix: "gbr",
                  range: "pc",
                },
              },
            ],
            layers: [
              {
                id: "sequence",
                type: "sequence",
                asset: "sequence",
                size: [width, height],
                fit: "stretch",
                transform: { anchor: [0, 0] },
              },
            ],
          };
          const importedPath = join(directory, format + "-reimport.json");
          await writeFile(importedPath, JSON.stringify(imported));
          const loaded = await loadComposition(importedPath, backend, {
            cacheDirectory: join(directory, "reimport-cache"),
          });
          assert.equal(loaded.preparedMedia!.frames.length, frames);
          for (const frame of loaded.preparedMedia!.frames) {
            const restored = mediaPngPixels(
              await readFile(loaded.assetPaths[frame.id]!),
            );
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++)
                assert.equal(
                  restored[(y * width + x) * 4 + 3],
                  alphaAt(x, y),
                  `${format} reimport alpha ${x}/${y}`,
                );
          }
        }
      }
      reports.push({
        format,
        backend,
        transport,
        checksum,
        pixels,
        audio: result.metrics.audio,
        output: result.metrics.output,
        environment: result.metrics.renderEnvironment,
        independentPreviewChecksum: previewChecksums.get(previewKey),
      });
      console.log(
        JSON.stringify({ format, backend, transport, status: "passed" }),
      );
    }
assert.equal(reports.length, 28);
const cli = [];
for (const format of ["h264", "png16"] as const) {
  const profile = compositionOutputProfile(format);
  const outputPath = join(
    directory,
    `cli-${format}` +
      (profile.container === "image2" ? ".%06d.png" : `.${profile.container}`),
  );
  let output = "",
    error = "";
  assert.equal(
    await runCli(
      [
        "comp",
        "render",
        "--input",
        compositionPath,
        "--output",
        outputPath,
        "--backend",
        "webgl2",
        "--format",
        format,
        "--transport",
        "png_pipe",
      ],
      {
        stdout: (value) => {
          output += value;
        },
        stderr: (value) => {
          error += value;
        },
      },
    ),
    0,
    error,
  );
  const result = JSON.parse(output) as { checksums: { output: string } };
  assert.equal(result.checksums.output, checksums.get(format));
  cli.push({
    format,
    backend: "webgl2",
    transport: "png_pipe",
    checksum: result.checksums.output,
  });
}
for (const option of ["format", "transport"]) {
  let error = "";
  assert.equal(
    await runCli(
      [
        "comp",
        "render",
        "--input",
        "unused.json",
        "--output",
        "unused.mp4",
        `--${option}`,
        "invalid",
      ],
      {
        stdout: () => {},
        stderr: (value) => {
          error += value;
        },
      },
    ),
    2,
  );
  assert.match(error, new RegExp(option));
}
const dimensions = await verifyCompositionOutputDimensions(directory, comp);
const lifecycle = await verifyCompositionOutputLifecycle(
  directory,
  compositionPath,
  loaded,
);
assert.equal(
  (await readdir(directory)).some((name) => name.endsWith(".stage")),
  false,
);
const reportDirectory = resolve(
  import.meta.dirname,
  "../../benchmarks/results/composition-ce15-output",
);
await mkdir(reportDirectory, { recursive: true });
await writeFile(
  join(reportDirectory, "acceptance.json"),
  `${JSON.stringify({ status: "passed", directory, exports: reports.length, frameCount: frames, fps, cases: reports, cli, dimensions, lifecycle }, null, 2)}\n`,
);
console.log(
  JSON.stringify({ status: "passed", exports: reports.length, directory }),
);
