import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import {
  loadComposition,
  probeCompositionVideo,
  renderComposition,
  type LoadedComposition,
} from "@still-shift/animation-engine";
import {
  exportScene,
  ffmpegArguments,
} from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import type {
  Composition,
  CompositionPreparedMedia,
} from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/composition/render/index.ts";
import type * as Evaluate from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";

const checksum = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");

export async function verifyNativeAudioTransactions(
  directory: string,
  loaded: LoadedComposition,
  compositionPath: string,
) {
  const audio = loaded.preparedAudio!;
  const audioInput = {
    path: loaded.assetPaths[audio.resource.id]!,
    sha256: audio.resource.sha256,
    byteLength: audio.resource.byteLength,
    sampleCount: audio.sampleCount,
  };
  for (const failure of ["cancel", "validation"] as const) {
    const controller = new AbortController();
    const outputPath = join(directory, `native-mux-${failure}.mp4`);
    await assert.rejects(
      exportScene({
        scene: loaded.scene,
        sourcePath: compositionPath,
        depthPath: null,
        assetPaths: loaded.assetPaths,
        audioInput,
        outputPath,
        signal: controller.signal,
        resultManifestContents: () => "{}",
        validateResult: (metrics) => {
          assert.equal(metrics.audio?.sampleCount, audio.sampleCount);
          if (failure === "cancel")
            controller.abort(
              new Error("Native mux cancelled before publication"),
            );
          else throw Error("Native mux validation rejected");
        },
      }),
      /Native mux (cancelled before publication|validation rejected)/,
    );
    for (const suffix of ["", ".scene.json", ".result.json"])
      await assert.rejects(readFile(outputPath + suffix), { code: "ENOENT" });
    assert.equal(
      (await readdir(directory)).some((name) =>
        name.startsWith(`.native-mux-${failure}.mp4.`),
      ),
      false,
    );
  }
  return "post-mux cancellation and validation rejection publish no MP4/sidecars; stages removed";
}

/** Exercise the production capture/export path against a separate preview encoder. */
export async function verifyNativeMediaExports(
  page: Page,
  directory: string,
  sequence: Composition,
  capturedPaths: Record<string, string>,
) {
  const videoPath = join(directory, "source.mkv");
  const audioPath = join(directory, "source-audio.wav");
  const audio = mediaFloat32Wave(12000, 2, (sample, channel) => {
    if (sample === 11999) return channel ? -0.125 : 0.0625;
    const local = sample % 4000;
    return local < 240
      ? Math.sin((local * Math.PI * 2 * (channel ? 997 : 431)) / 48000) * 0.35
      : 0;
  });
  await writeFile(audioPath, audio.wav);
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-framerate",
    "12",
    "-i",
    join(directory, "frame_%01d.png"),
    "-i",
    audioPath,
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
  const rgba = Buffer.alloc(16 * 16 * 4);
  for (let pixel = 0; pixel < 16 * 16; pixel++)
    rgba.set([255, 176, 32, 255], pixel * 4);
  const still = mediaRgbaPng(16, 16, rgba, [
    mediaPngChunk("sRGB", Buffer.from([0])),
  ]);
  const stillPath = join(directory, "still.png");
  await writeFile(stillPath, still);
  const reports: unknown[] = [];
  for (const source of ["sequence", "video"] as const) {
    const composition = structuredClone(sequence);
    composition.id = `native-export-${source}`;
    if (source === "video") {
      composition.assets[0] = {
        id: "clip",
        type: "video",
        path: videoPath,
        sha256: probe.sourceHash,
        width: probe.width,
        height: probe.height,
        frameCount: probe.frameCount,
        frameRate: probe.frameRate,
        color: probe.color,
      };
      const layer = composition.layers[0]!;
      if (layer.type !== "sequence") throw Error("Expected sequence fixture");
      composition.layers[0] = { ...layer, type: "video" };
    }
    composition.assets.push({
      id: "still",
      type: "image",
      path: stillPath,
      sha256: checksum(still),
      width: 16,
      height: 16,
    });
    const nativeAudioPath = source === "video" ? videoPath : audioPath;
    composition.assets.push({
      id: "voice",
      type: "audio",
      path: nativeAudioPath,
      sha256: checksum(await readFile(nativeAudioPath)),
      sampleRate: 48000,
      sampleCount: 12000,
      channels: 2,
    });
    composition.layers.push({
      id: "voice",
      type: "audio",
      asset: "voice",
      role: "narration",
    });
    if (source === "video") {
      const voice = composition.layers.pop()!;
      composition.precomps = [
        ...(composition.precomps ?? []),
        {
          id: "audio-group",
          width: 32,
          height: 16,
          frameCount: composition.frameCount,
          layers: [
            voice,
            { id: "badge", type: "solid", size: [4, 4], color: "#ffffff" },
          ],
        },
      ];
      composition.layers.push(
        { id: "audio-host", type: "precomp", comp: "audio-group" },
        {
          id: "native-label",
          type: "text",
          text: "PCM",
          fontSize: 12,
          color: "#ffffff",
          transform: { position: [72, 48] },
        },
      );
      composition.constraints = [
        ...(composition.constraints ?? []),
        { type: "attach", target: "audio-host", anchor: "native-label" },
      ];
    }
    composition.layers.push(
      {
        id: "moving-still",
        type: "image",
        size: [16, 16],
        sources: [{ asset: "still" }],
        transform: {
          position: {
            x: {
              keys: [
                { frame: 0, value: 82 },
                { frame: 5, value: 106 },
              ],
            },
            y: 24,
          },
        },
      },
      {
        id: "lower-third",
        type: "shape",
        contents: [
          {
            id: "rectangle",
            type: "rect",
            size: [112, 12],
            position: [64, 84],
          },
          { id: "fill", type: "fill", color: "#102840" },
        ],
      },
    );
    const compositionPath = join(directory, `${source}.json`);
    await writeFile(compositionPath, JSON.stringify(composition));
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const cacheDirectory = join(directory, "production-cache");
      const loaded = await loadComposition(compositionPath, backend, {
        cacheDirectory,
      });
      Object.assign(capturedPaths, loaded.assetPaths);
      assert.equal(loaded.preparedMedia!.frames.length, 3);
      assert.equal(loaded.preparedAudio!.sampleCount, 12000);
      const masterPath = loaded.assetPaths[loaded.preparedAudio!.resource.id]!;
      assert.deepEqual((await readFile(masterPath)).subarray(58), audio.pcm);
      const audioInput = {
        path: masterPath,
        sha256: loaded.preparedAudio!.resource.sha256,
        byteLength: loaded.preparedAudio!.resource.byteLength,
        sampleCount: 12000,
      };
      const pngs = await page.evaluate(
        async ({ documentJson, preparedJson, backend }) => {
          const composition = JSON.parse(documentJson) as Composition;
          const preparedMedia = JSON.parse(
            preparedJson,
          ) as CompositionPreparedMedia;
          const url = "/packages/renderer-core/src/composition/render/index.ts";
          const m = (await import(url)) as typeof Render;
          const resources = await m.loadCompositionResources(
            composition,
            (id: string) => "/native-frame?id=" + encodeURIComponent(id),
            { preparedMedia },
          );
          const canvas = document.createElement("canvas");
          const preview = m.createCompositionPreview(
            canvas,
            composition,
            resources,
            { backend },
          );
          const pngs: string[] = [];
          try {
            if (composition.layers.some((layer) => layer.id === "audio-host")) {
              const evaluatorUrl =
                "/packages/renderer-core/src/composition/evaluate/index.ts";
              const evaluator = (await import(evaluatorUrl)) as typeof Evaluate;
              const bounds = preview.textBounds["native-label"]![0]!;
              const tree = evaluator.evaluateComp(composition, 0, {
                textBounds: preview.textBounds,
              });
              const host = tree.layers.find(
                (layer) => layer.id === "audio-host",
              )!;
              const expected = [
                72 + (bounds.left + bounds.right) / 2,
                48 + (bounds.top + bounds.bottom) / 2,
              ];
              if (
                host.transform.position.some(
                  (value, axis) => value !== expected[axis],
                )
              )
                throw Error(
                  "Native audio host lost its measured text attachment",
                );
            }
            for (const frames of [
              [0, 1, 2, 3, 4, 5],
              [5, 4, 3, 2, 1, 0],
              [3, 0, 5, 1],
            ])
              for (const frame of frames) {
                await preview.prepareFrame(frame);
                preview.renderFrame(frame);
                const png = canvas.toDataURL("image/png").split(",")[1]!;
                if (pngs[frame] && pngs[frame] !== png)
                  throw Error(`Native seek history changed frame ${frame}`);
                pngs[frame] = png;
              }
          } finally {
            preview.dispose();
          }
          return pngs;
        },
        {
          documentJson: JSON.stringify(loaded.composition),
          preparedJson: JSON.stringify(loaded.preparedMedia),
          backend,
        },
      );
      const outputPath = join(directory, `${source}-${backend}.mp4`);
      const exported = await renderComposition({
        compositionPath,
        outputPath,
        backend,
        cacheDirectory,
      });
      const repeat = await renderComposition({
        compositionPath,
        backend,
        cacheDirectory,
        outputPath: join(directory, `${source}-${backend}-repeat.mp4`),
      });
      const raw = await renderComposition({
        compositionPath,
        backend,
        cacheDirectory,
        transport: "raw_rgba",
        outputPath: join(directory, `${source}-${backend}-raw.mp4`),
      });
      assert.equal(exported.frameCount, 6);
      assert.deepEqual(exported.metrics.audio, {
        sourceChecksum: audioInput.sha256,
        sampleCount: 12000,
        sampleRate: 48000,
        channels: 2,
        codec: "aac",
      });
      assert.equal(repeat.checksums.output, exported.checksums.output);
      assert.equal(raw.checksums.output, exported.checksums.output);
      const independentPath = join(
        directory,
        `${source}-${backend}-preview.mp4`,
      );
      await new Promise<void>((accept, reject) => {
        const encoder = spawn(
          "ffmpeg",
          ffmpegArguments(
            loaded.scene,
            independentPath,
            "libx264",
            "png_pipe",
            audioInput,
          ),
          { stdio: ["pipe", "ignore", "pipe"] },
        );
        let errors = "";
        encoder.stderr.on("data", (chunk) => {
          errors += String(chunk);
        });
        encoder.on("error", reject);
        encoder.stdin.on("error", reject);
        encoder.on("close", (code) =>
          code === 0 ? accept() : reject(Error(`ffmpeg ${code}: ${errors}`)),
        );
        for (const png of pngs) encoder.stdin.write(Buffer.from(png, "base64"));
        encoder.stdin.end();
      });
      assert.equal(
        checksum(await readFile(independentPath)),
        exported.checksums.output,
      );
      const audioProbe = JSON.parse(
        (
          await runProcess("ffprobe", [
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=sample_rate,channels,duration_ts,time_base",
            "-of",
            "json",
            outputPath,
          ])
        ).stdout,
      ).streams[0];
      assert.equal(audioProbe.duration_ts, 12000);
      assert.equal(audioProbe.sample_rate, "48000");
      assert.equal(audioProbe.channels, 2);
      assert.equal(audioProbe.time_base, "1/48000");
      const decodedAudio = outputPath + ".f32",
        referenceAudio = independentPath + ".f32";
      for (const [input, output] of [
        [outputPath, decodedAudio],
        [independentPath, referenceAudio],
      ])
        await runProcess("ffmpeg", [
          "-v",
          "error",
          "-i",
          input!,
          "-map",
          "0:a:0",
          "-f",
          "f32le",
          "-codec:a",
          "pcm_f32le",
          output!,
        ]);
      assert.deepEqual(
        await readFile(decodedAudio),
        await readFile(referenceAudio),
      );
      reports.push({
        source,
        backend,
        frames: exported.frameCount,
        originalFrames: loaded.preparedMedia!.frames.map(
          (frame) => frame.ordinal,
        ),
        repeatedMp4: "byte-identical",
        independentPreviewMp4: "byte-identical",
        rawPngTransport: "byte-identical",
        audioSource:
          source === "video"
            ? "explicit embedded PCM asset"
            : "explicit WAV asset",
        masterSamples: 12000,
        masterPcm: "source-bit-identical including final sample",
        audioDecoded: "independent AAC sample-bit-identical",
        audioTrackClock: "exact 48k sample count",
        ...(source === "video"
          ? {
              textConstrainedAudio:
                "measured host placement preserved; exact complete PCM; both preview/export backends",
            }
          : {}),
        ...(source === "video" && backend === "webgl2"
          ? {
              transactionProof: await verifyNativeAudioTransactions(
                directory,
                loaded,
                compositionPath,
              ),
            }
          : {}),
      });
    }
  }
  return reports;
}
