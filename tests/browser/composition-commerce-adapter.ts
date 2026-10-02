import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { renderComposition } from "@still-shift/animation-engine";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { dirname, resolve, join } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  CommerceSceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import {
  compileCommerceScene,
  commerceToComposition,
} from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";
import { commerceTextVariants } from "../helpers/composition-commerce-text.ts";
import type * as CommerceTextTests from "../helpers/composition-commerce-text.ts";
import { commerceGeometryVariants } from "../helpers/composition-commerce-geometry.ts";

const root = resolve(import.meta.dirname, "../..");
const inventory = JSON.parse(
  await readFile(
    resolve(root, "tests/visual/composition-baselines/fixtures.json"),
    "utf8",
  ),
) as {
  fixtures: {
    id: string;
    path: string;
    family: string;
    kind: string;
    tier: "near";
  }[];
};
const only = process.argv.indexOf("--only");
const accepted = new Set(
  [
    "a01-landscape",
    "a01-feed",
    "h01-landscape",
    "h01-portrait",
    "h03-thai",
    "h04-square",
    "vertical-h01-portrait",
    ...[
      "attachment",
      "background",
      "callout",
      "detail",
      "drift",
      "fade",
      "float",
      "introduction",
      "overshoot",
      "panel",
      "parallax",
      "path",
      "product",
      "rotate",
      "scale",
      "shadow",
      "studio",
      "text",
      "translate",
    ].map((id) => `atom-${id}`),
  ].map((id) => `commerce/${id}`),
);
for (const context of ["commerce", "isolated"])
  for (const name of [
    "bracket",
    "instances",
    "layout",
    "leader",
    "outline",
    "pin",
    "sequence",
    "stagger",
    "state",
    "supply",
    "text-fit",
    "tour",
    "transform",
    "travel",
    "underline",
    "value",
    "visibility",
  ])
    accepted.add(`component/${context}-${name}`);
const selected = inventory.fixtures.filter(
  (f) =>
    accepted.has(f.id) && (only < 0 || f.id.includes(process.argv[only + 1]!)),
);
assert.ok(selected.length, "No commerce fixtures selected");
if (only < 0)
  assert.equal(selected.length, accepted.size, "Missing CE0 commerce fixture");
const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const browser = await launchRenderBrowser();
let totalFrames = 0,
  totalItems = 0;
try {
  for (const entry of selected) {
    const sourcePath = resolve(root, entry.path);
    const source = CommerceSceneSchema.parse(
      JSON.parse(await readFile(sourcePath, "utf8")),
    );
    const inputs = [
      { id: entry.id, scene: source },
      ...commerceTextVariants(entry.id, source),
      ...commerceGeometryVariants(entry.id, source),
    ];
    for (const item of inputs) {
      const input = CommerceSceneSchema.parse(item.scene);
      const composition = commerceToComposition(input),
        scene = compileCommerceScene(input);
      assertCompositionAdapterState(scene, composition);
      const urls = Object.fromEntries(
        composition.assets.map((a) => [
          a.id,
          `/@fs${resolve(dirname(sourcePath), a.path)}`,
        ]),
      );
      const page = await browser.newPage();
      await page.addInitScript("window.__name = (fn) => fn;");
      await page.goto(server.resolvedUrls!.local[0]!);
      const report = await page.evaluate(
        async ({ sceneJson, compositionJson, urls, tier, profile }) => {
          const scene = JSON.parse(sceneJson) as ReturnType<
            typeof Render.compileCommerceScene
          >;
          const composition = JSON.parse(compositionJson) as Composition;
          const moduleUrl = "/packages/renderer-core/src/index.ts";
          const m = (await import(moduleUrl)) as typeof Render;
          const legacyCanvas = document.createElement("canvas"),
            canvas = document.createElement("canvas");
          const legacy = m.createIllustratedPreview(
            legacyCanvas,
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
          const testModule = "/tests/helpers/composition-commerce-text.ts";
          const { assertCommerceTextPreparation } = (await import(
            testModule
          )) as typeof CommerceTextTests;
          const preparationChecks = assertCommerceTextPreparation(
            composition,
            resources,
          );
          const oldCtx = legacyCanvas.getContext("2d")!,
            ctx = canvas.getContext("2d")!;
          const hashes = new Map<number, string>();
          const hash = async (bytes: Uint8ClampedArray<ArrayBuffer>) =>
            Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            ).join(",");
          let maxDelta = 0,
            minPsnr = Infinity,
            legacyMs = 0,
            compositionMs = 0,
            legacyRenderMs = 0,
            compositionRenderMs = 0;
          const failures: { frame: number; delta: number; psnr: number }[] = [];
          const renderTimings: { frame: number; milliseconds: number }[] = [];
          legacy.renderFrame(0);
          preview.renderFrame(0);
          for (let frame = 0; frame < composition.frameCount; frame++) {
            let at = performance.now();
            legacy.renderFrame(frame);
            legacyRenderMs += performance.now() - at;
            const expected = oldCtx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            ).data;
            legacyMs += performance.now() - at;
            at = performance.now();
            const result = preview.renderFrame(frame);
            const renderMs = performance.now() - at;
            compositionRenderMs += renderMs;
            if (profile) renderTimings.push({ frame, milliseconds: renderMs });
            const actual = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            ).data;
            compositionMs += performance.now() - at;
            if (result.diagnostics.some((d) => d.severity === "error"))
              throw new Error(JSON.stringify(result.diagnostics));
            const comparison = m.compareFrames(
              expected,
              actual,
              canvas.width,
              canvas.height,
            );
            maxDelta = Math.max(maxDelta, comparison.maxChannelDelta);
            minPsnr = Math.min(minPsnr, comparison.psnr);
            if (!m.meetsTier(comparison, tier) && failures.length < 5)
              failures.push({
                frame,
                delta: comparison.maxChannelDelta,
                psnr: comparison.psnr,
              });
            if (
              frame === 0 ||
              frame === Math.floor(composition.frameCount / 2) ||
              frame === composition.frameCount - 1
            )
              hashes.set(frame, await hash(actual));
          }
          for (const [frame, expected] of [...hashes].reverse()) {
            preview.renderFrame(frame);
            if (
              (await hash(
                ctx.getImageData(0, 0, canvas.width, canvas.height).data,
              )) !== expected
            )
              throw new Error(`Backward seek differs at ${frame}`);
          }
          let evaluationMs = 0,
            graphMs = 0;
          if (profile)
            for (let frame = 0; frame < composition.frameCount; frame++) {
              const at = performance.now();
              const tree = m.evaluateComp(composition, frame);
              const evaluated = performance.now();
              m.buildRenderGraph(composition, tree);
              evaluationMs += evaluated - at;
              graphMs += performance.now() - evaluated;
            }
          // Pixel comparison allocates full-frame buffers and analysis data. Measure
          // render + readback separately once every frame is warm. Pair the same
          // frame and alternate which backend runs first, including across passes,
          // rather than charging a whole timeline's runtime pauses to one backend.
          const benchmark = (
            render: (frame: number) => unknown,
            context: CanvasRenderingContext2D,
            frame: number,
          ) => {
            const start = performance.now();
            render(frame);
            context.getImageData(0, 0, canvas.width, canvas.height);
            return performance.now() - start;
          };
          const timings = Array.from({ length: 3 }, (_, pass) => {
            let legacyMs = 0,
              compositionMs = 0;
            for (let frame = 0; frame < composition.frameCount; frame++) {
              if ((frame + pass) % 2 === 0) {
                legacyMs += benchmark(legacy.renderFrame, oldCtx, frame);
                compositionMs += benchmark(preview.renderFrame, ctx, frame);
              } else {
                compositionMs += benchmark(preview.renderFrame, ctx, frame);
                legacyMs += benchmark(legacy.renderFrame, oldCtx, frame);
              }
            }
            return { legacyMs, compositionMs, ratio: compositionMs / legacyMs };
          });
          const ratio = timings
            .map((timing) => timing.ratio)
            .sort((a, b) => a - b)[1]!;
          preview.dispose();
          legacy.dispose();
          return {
            maxDelta,
            minPsnr,
            failures,
            ratio,
            timings,
            preparationChecks,
            ...(profile
              ? {
                  legacyMs,
                  compositionMs,
                  legacyRenderMs,
                  compositionRenderMs,
                  evaluationMs,
                  graphMs,
                  slowFrames: renderTimings
                    .sort((a, b) => b.milliseconds - a.milliseconds)
                    .slice(0, 5),
                }
              : {}),
          };
        },
        {
          sceneJson: JSON.stringify(scene),
          compositionJson: JSON.stringify(composition),
          urls,
          tier: entry.tier,
          profile: process.argv.includes("--profile"),
        },
      );
      console.log(
        `${item.id}: ${input.frameCount} frames ${JSON.stringify(report)}`,
      );
      await page.close();
      assert.deepEqual(report.failures, [], `${item.id} pixel parity`);
      assert.ok(
        report.ratio <= 1.25,
        `${item.id} render + readback ratio ${report.ratio} exceeds 1.25`,
      );
      totalFrames += input.frameCount;
      totalItems++;
    }
  }
  console.log(
    `CE4b commerce parity: ${totalItems} items, ${totalFrames} frames`,
  );
  if (only < 0)
    for (const name of ["text-fit", "value", "leader", "attachment"]) {
      const directory = await mkdtemp(join(tmpdir(), "still-shift-ce4b-"));
      try {
        const sourcePath = resolve(
          root,
          name === "attachment"
            ? "benchmarks/fixtures/ecommerce-motion/atoms/attachment.json"
            : `benchmarks/fixtures/reusable-components/commerce-${name}.json`,
        );
        const compositionPath = join(directory, "composition.json");
        let errors = "";
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
            {
              stdout: () => {},
              stderr: (text) => {
                errors += text;
              },
            },
          ),
          0,
          errors,
        );
        const composition = JSON.parse(
          await readFile(compositionPath, "utf8"),
        ) as Composition;
        const first = await renderComposition({
          compositionPath,
          outputPath: join(directory, "first.mp4"),
        });
        const second = await renderComposition({
          compositionPath,
          outputPath: join(directory, "second.mp4"),
        });
        assert.equal(first.frameCount, composition.frameCount);
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
        console.log(
          `CE4b ${name} export: ${first.frameCount} frames, two byte-identical MP4s; relocated assets and overwrite protection pass`,
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
} finally {
  await browser.close();
  await server.close();
}
