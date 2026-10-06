import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  CinematicSceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import {
  cinematicToComposition,
  compileCinematicScene,
} from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Timing from "../helpers/paired-render-timing.ts";
import { assertAdapterExport } from "../helpers/composition-adapter-exports.ts";

const root = resolve(import.meta.dirname, "../..");
const inventory = JSON.parse(
  await readFile(
    resolve(root, "tests/visual/composition-baselines/fixtures.json"),
    "utf8",
  ),
) as { fixtures: { id: string; family: string; path: string; tier: "near" }[] };
const all = inventory.fixtures.filter(
  (fixture) => fixture.family === "cinematic",
);
assert.equal(all.length, 15, "All CE0 cinematic fixtures are required");
const only = process.argv.indexOf("--only"),
  requested = process.argv.indexOf("--backend");
const smoke = process.argv.includes("--smoke");
const fixtures = all.filter(
  (fixture) => only < 0 || fixture.id.includes(process.argv[only + 1]!),
);
assert.ok(fixtures.length, "No cinematic fixtures selected");
const backends =
  requested < 0 ? ["canvas2d", "webgl2"] : [process.argv[requested + 1]!];
assert.ok(
  backends.every((backend) => ["canvas2d", "webgl2"].includes(backend)),
  "Unsupported backend",
);
if (smoke)
  console.log(
    "Diagnostic smoke only: sampled pixels/seeks; full timelines, timing and exports remain pending.",
  );
const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const browser = await launchRenderBrowser();
let totalFrames = 0;
try {
  for (const entry of fixtures) {
    const path = resolve(root, entry.path),
      source = CinematicSceneSchema.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
    const composition = cinematicToComposition(source),
      scene = compileCinematicScene(source);
    const urls = Object.fromEntries(
      composition.assets.map((asset) => [
        asset.id,
        `/@fs${resolve(dirname(path), asset.path)}`,
      ]),
    );
    for (const backend of backends) {
      const page = await browser.newPage();
      try {
        await page.addInitScript("window.__name = (fn) => fn;");
        await page.goto(server.resolvedUrls!.local[0]!);
        const report = await page.evaluate(
          async ({
            sceneJson,
            compositionJson,
            urls,
            backend,
            smoke,
            tier,
          }) => {
            const scene = JSON.parse(sceneJson) as ReturnType<
              typeof Render.compileCinematicScene
            >;
            const composition = JSON.parse(compositionJson) as Composition;
            const moduleUrl = "/packages/renderer-core/src/index.ts";
            const m = (await import(moduleUrl)) as typeof Render;
            const canvas = document.createElement("canvas"),
              oldCanvas = document.createElement("canvas");
            const legacy = m.createIllustratedPreview(
              oldCanvas,
              scene,
              await m.loadIllustratedImages(scene, (id) => urls[id]!),
            );
            const native = m.createCompositionPreview(
              canvas,
              composition as Composition,
              await m.loadCompositionResources(
                composition as Composition,
                (id) => urls[id]!,
              ),
              { backend: backend as Render.CompositionBackend },
            );
            const old = oldCanvas.getContext("2d")!;
            const hashes = new Map<number, string>();
            const hash = async (pixels: Uint8ClampedArray) =>
              Array.from(
                new Uint8Array(
                  await crypto.subtle.digest("SHA-256", new Uint8Array(pixels)),
                ),
              ).join(",");
            const frames = smoke
              ? [
                  ...new Set([
                    0,
                    Math.floor(composition.frameCount / 4),
                    Math.floor(composition.frameCount / 2),
                    Math.floor((3 * composition.frameCount) / 4),
                    composition.frameCount - 1,
                  ]),
                ]
              : Array.from(
                  { length: composition.frameCount },
                  (_, frame) => frame,
                );
            let maxDelta = 0,
              minPsnr = Infinity;
            const failures: { frame: number; delta: number; psnr: number }[] =
              [];
            const errors: unknown[] = [];
            try {
              for (const frame of frames) {
                legacy.renderFrame(frame);
                const result = native.renderFrame(frame);
                errors.push(
                  ...result.diagnostics.filter(
                    (diagnostic) => diagnostic.severity === "error",
                  ),
                );
                const pixels = native.readPixels();
                const comparison = m.compareFrames(
                  old.getImageData(0, 0, canvas.width, canvas.height).data,
                  pixels,
                  canvas.width,
                  canvas.height,
                );
                maxDelta = Math.max(maxDelta, comparison.maxChannelDelta);
                minPsnr = Math.min(minPsnr, comparison.psnr);
                if (!m.meetsTier(comparison, tier))
                  failures.push({
                    frame,
                    delta: comparison.maxChannelDelta,
                    psnr: comparison.psnr,
                  });
                hashes.set(frame, await hash(pixels));
              }
              for (const frame of [...frames].reverse()) {
                native.renderFrame(frame);
                assertBrowser(
                  (await hash(native.readPixels())) === hashes.get(frame),
                  `Reverse seek changed frame ${frame}`,
                );
              }
              let timing;
              if (!smoke) {
                const timingUrl = "/tests/helpers/paired-render-timing.ts";
                const paired = (await import(timingUrl)) as typeof Timing;
                timing = paired.measurePairedRenderTimings(
                  composition.frameCount,
                  {
                    renderFrame: legacy.renderFrame,
                    readPixels: () =>
                      old.getImageData(0, 0, canvas.width, canvas.height),
                  },
                  {
                    renderFrame: native.renderFrame,
                    readPixels: native.readPixels,
                  },
                );
              }
              return {
                frames: frames.length,
                reverseFrames: frames.length,
                maxDelta,
                minPsnr,
                failures,
                errors,
                ...timing,
              };
            } finally {
              native.dispose();
              legacy.dispose();
            }
            function assertBrowser(condition: boolean, message: string) {
              if (!condition) throw Error(message);
            }
          },
          {
            sceneJson: JSON.stringify(scene),
            compositionJson: JSON.stringify(composition),
            urls,
            backend,
            smoke,
            tier: entry.tier,
          },
        );
        console.log(
          `${backend} ${entry.id}: ${report.frames} frames ${JSON.stringify(report)}`,
        );
        assert.deepEqual(report.errors, [], `${entry.id} diagnostics`);
        assert.deepEqual(report.failures, [], `${entry.id} pixels`);
        if (!smoke && backend === "canvas2d")
          assert.ok(
            report.ratio! <= 1.25,
            `${entry.id} Canvas ratio ${report.ratio} > 1.25`,
          );
        if (!smoke && backend === "webgl2" && report.ratio! > 1.25)
          console.log(
            `CE6-P deferred WebGL timing only: ${entry.id} ${report.ratio}`,
          );
        totalFrames += report.frames;
      } finally {
        await page.close();
      }
      if (!smoke)
        await assertAdapterExport(
          source,
          dirname(path),
          entry.id,
          backend as Render.CompositionBackend,
        );
    }
  }
  console.log(
    `CE4c ${smoke ? "diagnostic smoke" : "cinematic parity"}: ${fixtures.length} fixtures, ${totalFrames} frames`,
  );
} finally {
  try {
    await browser.close();
  } finally {
    await server.close();
  }
}
