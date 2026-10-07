import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import {
  loadComposition,
  probeCompositionVideo,
  renderComposition,
} from "@still-shift/animation-engine";
import { ffmpegArguments } from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import type {
  Composition,
  CompositionPreparedMedia,
} from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/composition/render/index.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";

const checksum = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");

/** Exercise the production capture/export path against a separate preview encoder. */
export async function verifyNativeMediaExports(
  page: Page,
  directory: string,
  sequence: Composition,
  capturedPaths: Record<string, string>,
) {
  const videoPath = join(directory, "source.mkv");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-framerate",
    "12",
    "-i",
    join(directory, "frame_%01d.png"),
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
      assert.equal(repeat.checksums.output, exported.checksums.output);
      assert.equal(raw.checksums.output, exported.checksums.output);
      const independentPath = join(
        directory,
        `${source}-${backend}-preview.mp4`,
      );
      await new Promise<void>((accept, reject) => {
        const encoder = spawn(
          "ffmpeg",
          ffmpegArguments(loaded.scene, independentPath, "libx264", "png_pipe"),
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
      });
    }
  }
  return reports;
}
