import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type { LoadedComposition } from "@still-shift/animation-engine";
import type * as Render from "@still-shift/renderer-core";
import {
  compositionOutputArguments,
  createCompositionOutputConversion,
  type CompositionOutputProfile,
} from "../../packages/execution-runtime/src/composition-output.ts";

/** Capture independent previews before export starts; the fixture is deliberately small. */
export async function captureCompositionOutputPreviews(
  loaded: LoadedComposition,
  directory: string,
) {
  const composition = loaded.composition;
  assert.ok(
    composition.width * composition.height * composition.frameCount * 4 <=
      1024 * 1024,
  );
  const root = resolve(import.meta.dirname, "../..");
  const cacheDir = await mkdtemp(
    join(tmpdir(), "composition-output-preview-vite-"),
  );
  const server = await createServer({
    root,
    configFile: false,
    cacheDir,
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 0,
      watch: null,
      fs: { allow: [root, directory] },
    },
  });
  const captured = new Map<string, Buffer>();
  let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
  try {
    await server.listen();
    browser = await launchRenderBrowser();
    const page = await browser.newPage();
    await page.addInitScript("window.__name=(fn)=>fn;");
    await page.goto(server.resolvedUrls!.local[0]!);
    for (const backend of ["canvas2d", "webgl2"] as const)
      for (const preserveAlpha of [false, true]) {
        const frames = await page.evaluate(
          async ({ compositionJson, paths, backend, preserveAlpha }) => {
            const composition = JSON.parse(
              compositionJson,
            ) as LoadedComposition["composition"];
            const url = "/packages/renderer-core/src/index.ts";
            const renderer = (await import(url)) as typeof Render;
            const resources = await renderer.loadCompositionResources(
              composition,
              (id) => new URL(`/@fs${paths[id]}`, location.href).href,
            );
            const canvas = document.createElement("canvas");
            const preview = renderer.createCompositionPreview(
              canvas,
              composition,
              resources,
              { backend, preserveAlpha },
            );
            const frames: string[] = [];
            try {
              for (let frame = 0; frame < composition.frameCount; frame++) {
                await preview.prepareFrame(frame);
                preview.renderFrame(frame);
                const bytes = preview.readPixels();
                let binary = "";
                for (let offset = 0; offset < bytes.length; offset += 0x8000)
                  binary += String.fromCharCode(
                    ...bytes.subarray(offset, offset + 0x8000),
                  );
                frames.push(btoa(binary));
              }
            } finally {
              preview.dispose();
            }
            return frames;
          },
          {
            compositionJson: JSON.stringify(composition),
            paths: loaded.assetPaths,
            backend,
            preserveAlpha,
          },
        );
        captured.set(
          `${backend}/${preserveAlpha}`,
          Buffer.concat(frames.map((frame) => Buffer.from(frame, "base64"))),
        );
      }
    return captured;
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}

/** Use a separate encoder process, bypassing the production exporter and uploader. */
export function encodeCompositionOutputPreview(
  loaded: LoadedComposition,
  profile: CompositionOutputProfile,
  captured: Buffer,
  outputPath: string,
) {
  const converted =
    createCompositionOutputConversion(profile).convert(captured);
  const audio = loaded.preparedAudio;
  const result = spawnSync(
    "ffmpeg",
    compositionOutputArguments(profile, {
      ...loaded.scene.canvas,
      ...loaded.scene.timeline,
      outputPath,
      ...(audio && profile.container !== "image2"
        ? { audioPath: loaded.assetPaths[audio.resource.id]! }
        : {}),
    }),
    { input: converted, maxBuffer: 1024 * 1024 },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.toString());
}
