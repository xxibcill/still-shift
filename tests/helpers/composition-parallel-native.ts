import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadComposition,
  probeCompositionVideo,
  renderComposition,
} from "@still-shift/animation-engine";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { mediaPngChunk, mediaRgbaPng } from "./composition-media-png.ts";
import {
  parallelChecksum,
  parallelOutputProof,
  verifyParallelMetrics,
} from "./composition-parallel-proof.ts";

export async function verifyParallelNativeMedia(
  directory: string,
  fixture: Composition,
) {
  const hashes: string[] = [];
  for (let frame = 0; frame < 3; frame++) {
    const rgba = Buffer.alloc(fixture.width * fixture.height * 4);
    for (let pixel = 0; pixel < fixture.width * fixture.height; pixel++)
      rgba.set(
        [
          [255, 0, 0, 128],
          [0, 255, 0, 255],
          [255, 255, 255, 255],
        ][frame]!,
        pixel * 4,
      );
    const png = mediaRgbaPng(fixture.width, fixture.height, rgba, [
      mediaPngChunk("sRGB", Buffer.from([0])),
    ]);
    hashes.push(parallelChecksum(png));
    await writeFile(join(directory, `native-${frame}.png`), png);
  }
  const manifest = Buffer.from(
    JSON.stringify({ schemaVersion: "composition-sequence-1", frames: hashes }),
  );
  await writeFile(join(directory, "native-manifest.json"), manifest);
  const videoPath = join(directory, "native.mkv");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-framerate",
    "12",
    "-i",
    join(directory, "native-%01d.png"),
    "-frames:v",
    "3",
    "-vf",
    "setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=gbr:range=full",
    "-c:v",
    "ffv1",
    "-pix_fmt",
    "gbrap16le",
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
  const reports: unknown[] = [];
  for (const source of ["sequence", "video"] as const)
    for (const clock of ["natural", "remapped-exposure-history"] as const) {
      const comp = structuredClone(fixture);
      comp.id = `parallel-native-${source}-${clock}`;
      comp.assets.push(
        source === "sequence"
          ? {
              id: "clip",
              type: "sequence",
              path: join(directory, "native-%01d.png"),
              manifestPath: join(directory, "native-manifest.json"),
              sha256: parallelChecksum(manifest),
              firstFrame: 0,
              width: fixture.width,
              height: fixture.height,
              frameCount: 3,
              frameRate: { numerator: 12, denominator: 1 },
              color: {
                primaries: "bt709",
                transfer: "iec61966-2-1",
                matrix: "gbr",
                range: "pc",
              },
            }
          : {
              id: "clip",
              type: "video",
              path: videoPath,
              sha256: probe.sourceHash,
              width: probe.width,
              height: probe.height,
              frameCount: probe.frameCount,
              frameRate: probe.frameRate,
              color: probe.color,
            },
      );
      const media: Extract<CompositionLayer, { type: "video" | "sequence" }> = {
        id: "picture",
        type: source,
        asset: "clip",
        size: [fixture.width, fixture.height],
        fit: "stretch",
        frameBlending: "linear",
        transform: { anchor: [0, 0], position: [0.25, 0.35] },
      };
      if (clock !== "natural") {
        media.timeRemap = {
          keys: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 3, value: 1 / 6, interpolation: "linear" },
            { frame: 7, value: 0.025 },
          ],
        };
        media.motionBlur = true;
        media.effects = [
          {
            id: "trail",
            effect: "time.echo",
            params: { spacing: 1, count: 3, decay: 0.5 },
          },
        ];
        comp.motionBlur = {
          enabled: true,
          shutterAngle: 360,
          shutterPhase: 0,
          samples: 4,
          cuts: [4],
        };
      }
      comp.layers.unshift(media);
      const path = join(directory, comp.id + ".json");
      await writeFile(path, JSON.stringify(comp));
      for (const backend of ["canvas2d", "webgl2"] as const) {
        const cacheDirectory = join(directory, "native-cache");
        const loaded = await loadComposition(path, backend, { cacheDirectory });
        assert.ok(loaded.preparedMedia!.frames.length >= 2);
        const exports = [];
        let expected;
        for (const [run, workers] of [
          ["baseline", undefined],
          ["one", 1],
          ["four", 4],
          ["repeat", 4],
        ] as const) {
          const output = join(
            directory,
            `${comp.id}-${backend}-${run}.%06d.png`,
          );
          const result = await renderComposition({
            compositionPath: path,
            outputPath: output,
            backend,
            cacheDirectory,
            format: "png8",
            transport: "raw_rgba",
            ...(workers ? { workers } : {}),
          });
          if (workers) verifyParallelMetrics(result.metrics, workers, true);
          const proof = await parallelOutputProof(output, result.metrics);
          if (expected)
            assert.deepEqual(
              proof,
              expected,
              `${source}/${clock}/${backend}/${run}`,
            );
          else expected = proof;
          assert.ok(new Set(proof.decodedFrames).size > 1);
          exports.push({ run, workers, proof, metrics: result.metrics });
        }
        reports.push({
          source,
          clock,
          backend,
          sourceFrameRate:
            source === "video"
              ? probe.frameRate
              : { numerator: 12, denominator: 1 },
          compositionFps: 60,
          preparedOrdinals: loaded.preparedMedia!.frames.map(
            (frame) => frame.ordinal,
          ),
          exports,
        });
        console.log("Parallel native:", source, clock, backend);
      }
    }
  return reports;
}
