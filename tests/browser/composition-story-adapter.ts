import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  StorySceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import {
  storyToComposition,
  compileStoryScene,
} from "@still-shift/renderer-core";
import { renderComposition } from "@still-shift/animation-engine";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";

const root = resolve(import.meta.dirname, "../..");
const sourcePath = resolve(
  root,
  "benchmarks/fixtures/story-motion-continuous/access-constraint.json",
);
const input = StorySceneSchema.parse(
  JSON.parse(await readFile(sourcePath, "utf8")),
);
const composition = storyToComposition(input);
const scene = compileStoryScene(input);
const extendedInput = structuredClone(input);
extendedInput.frameCount = 2000;
extendedInput.camera!.keys.at(-1)!.frame = extendedInput.frameCount - 1;
for (const flow of extendedInput.flows ?? [])
  flow.window.end = extendedInput.frameCount - 1;
const extendedComposition = storyToComposition(extendedInput);
const extendedScene = compileStoryScene(extendedInput);
const urls = Object.fromEntries(
  composition.assets.map((a) => [
    a.id,
    `/@fs${resolve(dirname(sourcePath), a.path)}`,
  ]),
);
const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const browser = await launchRenderBrowser();
const directory = await mkdtemp(join(tmpdir(), "still-shift-ce4a-"));
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const report = await page.evaluate(
    async ({
      sceneJson,
      compositionJson,
      extendedSceneJson,
      extendedCompositionJson,
      urls,
    }) => {
      const scene = JSON.parse(sceneJson) as ReturnType<
        typeof Render.compileStoryScene
      >;
      const composition = JSON.parse(compositionJson) as Composition;
      const moduleUrl = "/packages/renderer-core/src/index.ts";
      const m = (await import(moduleUrl)) as typeof Render;
      const oldCanvas = document.createElement("canvas"),
        canvas = document.createElement("canvas");
      const legacy = m.createIllustratedPreview(
        oldCanvas,
        scene,
        await m.loadIllustratedImages(scene, (id) => urls[id]!),
      );
      const resources = await m.loadCompositionResources(
        composition,
        (id) => urls[id]!,
      );
      const preview = m.createCompositionPreview(
        canvas,
        composition,
        resources,
      );
      const oldCtx = oldCanvas.getContext("2d")!,
        ctx = canvas.getContext("2d")!;
      let maxDelta = 0,
        minimumPsnr = Infinity,
        legacyMs = 0,
        compositionMs = 0;
      const failures: {
        frame: number;
        maxChannelDelta: number;
        psnr: number;
      }[] = [];
      const hashes: Record<number, string> = {};
      const hash = async (bytes: Uint8ClampedArray<ArrayBuffer>) =>
        Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      // CE0 measures render plus readback; exclude comparison and hashing cost.
      legacy.renderFrame(0);
      preview.renderFrame(0);
      for (let frame = 0; frame < composition.frameCount; frame++) {
        let at = performance.now();
        legacy.renderFrame(frame);
        const oldPixels = oldCtx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        legacyMs += performance.now() - at;
        at = performance.now();
        const result = preview.renderFrame(frame);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        compositionMs += performance.now() - at;
        if (result.diagnostics.some((d) => d.severity === "error"))
          throw new Error(JSON.stringify(result.diagnostics));
        const comparison = m.compareFrames(
          oldPixels,
          pixels,
          canvas.width,
          canvas.height,
        );
        maxDelta = Math.max(maxDelta, comparison.maxChannelDelta);
        minimumPsnr = Math.min(minimumPsnr, comparison.psnr);
        if (!m.meetsTier(comparison, "near"))
          failures.push({
            frame,
            maxChannelDelta: comparison.maxChannelDelta,
            psnr: comparison.psnr,
          });
        if ([0, 64, 114, 124, 191].includes(frame))
          hashes[frame] = await hash(pixels);
      }
      for (const frame of [124, 0, 191, 64, 114]) {
        preview.renderFrame(frame);
        if (
          hashes[frame] !==
          (await hash(ctx.getImageData(0, 0, canvas.width, canvas.height).data))
        )
          throw new Error(`Backward seek differs at ${frame}`);
      }
      // A provider passes through the same mask/isolation operations as native layers.
      const masked = structuredClone(composition);
      const text = masked.layers.find((l) => l.id === "title")!;
      text.trackMatte = { layer: "hidden-matte", mode: "alpha" };
      masked.layers.unshift({
        id: "hidden-matte",
        type: "solid",
        size: [1, 1],
        color: "#ffffff",
        transform: { position: [-100, -100], anchor: [0, 0] },
      });
      const maskCanvas = document.createElement("canvas");
      const maskPreview = m.createCompositionPreview(
        maskCanvas,
        masked,
        resources,
      );
      maskPreview.renderFrame(124);
      const control = structuredClone(composition);
      control.layers.find((l) => l.id === "title")!.enabled = false;
      const controlCanvas = document.createElement("canvas");
      const controlPreview = m.createCompositionPreview(
        controlCanvas,
        control,
        resources,
      );
      controlPreview.renderFrame(124);
      const maskComparison = m.compareFrames(
        controlCanvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data,
        maskCanvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
      );
      if (maskComparison.maxChannelDelta !== 0)
        throw new Error("Provider matte differs from hidden text control");
      controlPreview.dispose();
      maskPreview.dispose();
      const longScene = JSON.parse(extendedSceneJson) as ReturnType<
        typeof Render.compileStoryScene
      >;
      const longComposition = JSON.parse(
        extendedCompositionJson,
      ) as Composition;
      const longLegacyCanvas = document.createElement("canvas"),
        longCanvas = document.createElement("canvas");
      const longLegacy = m.createIllustratedPreview(
        longLegacyCanvas,
        longScene,
        await m.loadIllustratedImages(longScene, (id) => urls[id]!),
      );
      const longPreview = m.createCompositionPreview(
        longCanvas,
        longComposition,
        resources,
      );
      const extendedFrames = [1999, 0, 114, 1500, 64, 192];
      for (const frame of extendedFrames) {
        longLegacy.renderFrame(frame);
        longPreview.renderFrame(frame);
        const comparison = m.compareFrames(
          longLegacyCanvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height).data,
          longCanvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
        );
        if (comparison.maxChannelDelta !== 0)
          throw new Error(
            `Extended source differs at ${frame}: ${JSON.stringify(comparison)}`,
          );
      }
      longPreview.dispose();
      longLegacy.dispose();
      preview.dispose();
      legacy.dispose();
      return {
        frames: composition.frameCount,
        maxDelta,
        minimumPsnr,
        failures: failures.slice(0, 5),
        failureCount: failures.length,
        legacyMs,
        compositionMs,
        ratio: compositionMs / legacyMs,
        extendedFrames,
      };
    },
    {
      sceneJson: JSON.stringify(scene),
      compositionJson: JSON.stringify(composition),
      extendedSceneJson: JSON.stringify(extendedScene),
      extendedCompositionJson: JSON.stringify(extendedComposition),
      urls,
    },
  );
  assert.equal(report.failureCount, 0, JSON.stringify(report));
  assert.ok(
    report.ratio <= 1.25,
    `CE4a render plus readback cost exceeds 1.25×: ${JSON.stringify(report)}`,
  );
  console.log(`CE4a access-constraint: ${JSON.stringify(report)}`);
  const compositionPath = join(directory, "access.json");
  let errorOutput = "";
  const cliCode = await runCli(
    ["comp", "export-json", "--scene", sourcePath, "--output", compositionPath],
    {
      stdout: () => {},
      stderr: (text) => {
        errorOutput += text;
      },
    },
  );
  assert.equal(cliCode, 0, errorOutput);
  const compiled = JSON.parse(await readFile(compositionPath, "utf8"));
  assert.equal(compiled.schemaVersion, "composition-1");
  // The existing export runtime uses the provider registry and rebased asset paths.
  const first = await renderComposition({
    compositionPath,
    outputPath: join(directory, "first.mp4"),
  });
  const second = await renderComposition({
    compositionPath,
    outputPath: join(directory, "second.mp4"),
  });
  assert.equal(first.frameCount, input.frameCount);
  assert.equal(first.checksums.output, second.checksums.output);
  assert.deepEqual(first.systemFontLayers, []);
  assert.equal(
    await runCli(
      [
        "comp",
        "export-json",
        "--scene",
        sourcePath,
        "--output",
        compositionPath,
      ],
      { stdout: () => {}, stderr: () => {} },
    ),
    1,
  );
  // Report evidence without retaining large export artifacts in the repository.
  await writeFile(join(directory, "report.json"), JSON.stringify(report));
  console.log(
    `CE4a export: ${first.frameCount} frames, two byte-identical MP4s; export-json preserves assets and refuses overwrite`,
  );
} finally {
  await browser.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
