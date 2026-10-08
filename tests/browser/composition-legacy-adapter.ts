import type * as LegacyOracle from "../helpers/legacy-illustrated-oracle.ts";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import {
  PreparedSceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import {
  legacyToComposition,
  compilePreparedScene,
} from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Timing from "../helpers/paired-render-timing.ts";
import { assertAdapterExport } from "../helpers/composition-adapter-exports.ts";
import { legacyTextVariants } from "../helpers/composition-legacy-text.ts";
import { cinematicPreviewEncoder } from "../helpers/cinematic-preview-export.ts";
import {
  cameraHardwarePreview,
  type CameraFixture,
} from "./camera-hardware.ts";

const root = resolve(import.meta.dirname, "../..");
const inventory = JSON.parse(
  await readFile(
    resolve(root, "tests/visual/composition-baselines/fixtures.json"),
    "utf8",
  ),
) as { fixtures: { id: string; family: string; path: string; tier: "near" }[] };
const all = inventory.fixtures.filter(
  (fixture) => fixture.family === "legacy-illustrated",
);
assert.equal(all.length, 7, "All CE0 legacy fixtures are required");
const only = process.argv.indexOf("--only"),
  requested = process.argv.indexOf("--backend");
const smoke = process.argv.includes("--smoke");
// Keep delivery failures covered by sampled smoke and hardware checks.
const regressionFrames: Record<string, number[]> = {
  "legacy/comparison-build": [30, 31, 32, 33, 34],
  "legacy/crisis-fracture": [41, 42, 43, 44, 45, 77, 86],
};
const fixtures = all.filter(
  (fixture) => only < 0 || fixture.id.includes(process.argv[only + 1]!),
);
assert.ok(fixtures.length, "No legacy fixtures selected");
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
const directory = await mkdtemp(join(tmpdir(), "ce4d-legacy-preview-"));
const reports: unknown[] = [],
  exports: unknown[] = [],
  hardwareFixtures: CameraFixture[] = [];
let environment: Awaited<ReturnType<typeof probeRenderEnvironment>> | undefined;
let totalFrames = 0;
try {
  for (const entry of fixtures) {
    const path = resolve(root, entry.path),
      original = PreparedSceneSchema.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
    const inputs = [
      { id: entry.id, scene: original },
      ...legacyTextVariants(entry.id, original),
    ];
    for (const item of inputs) {
      const source = PreparedSceneSchema.parse(item.scene);
      const composition = legacyToComposition(source),
        scene = compilePreparedScene(source);
      const urls = Object.fromEntries(
        composition.assets.map((asset) => [
          asset.id,
          `/@fs${resolve(dirname(path), asset.path)}`,
        ]),
      );
      if (!smoke)
        hardwareFixtures.push({
          name: item.id,
          doc: composition,
          assetUrls: urls,
          backends: backends as Render.CompositionBackend[],
          frames: [
            0,
            ...(regressionFrames[item.id] ?? []),
            Math.floor(composition.frameCount / 2),
            composition.frameCount - 1,
          ],
        });
      for (const backend of backends) {
        const page = await browser.newPage();
        const encoder = smoke
          ? undefined
          : cinematicPreviewEncoder(
              scene,
              join(directory, `${hardwareFixtures.length}-${backend}.mp4`),
            );
        try {
          await page.addInitScript("window.__name = (fn) => fn;");
          await page.goto(server.resolvedUrls!.local[0]!);
          if (!environment) {
            environment = await probeRenderEnvironment(page);
            assertPinnedRenderEnvironment(environment);
          }
          if (encoder) {
            await page.exposeFunction("captureCinematicFrame", encoder.write);
            await page.exposeFunction("finishCinematicCapture", encoder.finish);
          }
          const report = await page.evaluate(
            async ({
              sceneJson,
              compositionJson,
              regressionFrames,
              urls,
              backend,
              smoke,
              tier,
            }) => {
              const scene = JSON.parse(sceneJson) as ReturnType<
                typeof Render.compilePreparedScene
              >;
              const composition = JSON.parse(compositionJson) as Composition;
              const oracleUrl = "/tests/helpers/legacy-illustrated-oracle.ts";
              const oracle = (await import(oracleUrl)) as typeof LegacyOracle;
              const moduleUrl = "/packages/renderer-core/src/index.ts";
              const m = (await import(moduleUrl)) as typeof Render;
              const canvas = document.createElement("canvas"),
                oldCanvas = document.createElement("canvas");
              const legacy = oracle.createIllustratedPreview(
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
                    await crypto.subtle.digest(
                      "SHA-256",
                      new Uint8Array(pixels),
                    ),
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
                      ...regressionFrames,
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
                  if (!smoke)
                    await (
                      window as unknown as {
                        captureCinematicFrame: (png: string) => Promise<void>;
                      }
                    ).captureCinematicFrame(
                      canvas.toDataURL("image/png").split(",")[1]!,
                    );
                }
                for (const frame of [...frames].reverse()) {
                  native.renderFrame(frame);
                  assertBrowser(
                    (await hash(native.readPixels())) === hashes.get(frame),
                    `Reverse seek changed frame ${frame}`,
                  );
                }
                const previewChecksum = smoke
                  ? undefined
                  : await (
                      window as unknown as {
                        finishCinematicCapture: () => Promise<string>;
                      }
                    ).finishCinematicCapture();
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
                  previewChecksum,
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
              regressionFrames: regressionFrames[item.id] ?? [],
              urls,
              backend,
              smoke,
              tier: entry.tier,
            },
          );
          console.log(
            `${backend} ${item.id}: ${report.frames} frames ${JSON.stringify(report)}`,
          );
          assert.deepEqual(report.errors, [], `${item.id} diagnostics`);
          assert.deepEqual(report.failures, [], `${item.id} pixels`);
          if (!smoke && backend === "canvas2d")
            assert.ok(
              report.ratio! <= 1.25,
              `${item.id} Canvas ratio ${report.ratio} > 1.25`,
            );
          if (!smoke && backend === "webgl2" && report.ratio! > 1.25)
            console.log(
              `CE6-P deferred WebGL timing only: ${item.id} ${report.ratio}`,
            );
          totalFrames += report.frames;
          reports.push({ id: item.id, backend, ...report });
          if (!smoke)
            exports.push(
              await assertAdapterExport(
                source,
                dirname(path),
                item.id,
                backend as Render.CompositionBackend,
                report.previewChecksum,
              ),
            );
        } finally {
          try {
            await encoder?.close();
          } finally {
            await page.close();
          }
        }
      }
    }
  }
  console.log(
    `CE4d ${smoke ? "diagnostic smoke" : "legacy parity"}: ${fixtures.length} fixtures, ${totalFrames} frames`,
  );
  if (!smoke) {
    const hardware = await cameraHardwarePreview(
      server.resolvedUrls!.local[0]!,
      hardwareFixtures,
    );
    const proof = resolve(
      root,
      "benchmarks/results/composition-ce4d-legacy-verification",
    );
    await mkdir(proof, { recursive: true });
    await writeFile(
      join(proof, "native-acceptance.json"),
      JSON.stringify(
        {
          environment,
          reports,
          exports,
          hardware,
          policy: {
            pixels: "unchanged CE0 near tiers",
            state:
              "0.001 pixel, all-frame matrices/opacity/provider states/follow constraints in unit checks",
            canvasTiming: 1.25,
            webglTiming: "CE6-P deferred; measured unchanged method",
          },
        },
        null,
        2,
      ) + "\n",
    );
  }
} finally {
  try {
    await browser.close();
  } finally {
    try {
      await server.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
