import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { readStoryPassage } from "@still-shift/animation-engine";
import {
  StorySceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import {
  compileStoryScene,
  storyToComposition,
} from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import { assertAdapterExport } from "../helpers/composition-adapter-exports.ts";
import { storyComponentVariants } from "../helpers/composition-story-components.ts";
import { motionPathVariants } from "../helpers/composition-motion-path.ts";
import { appearanceVariants } from "../helpers/composition-appearance.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

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
const componentsOnly = process.argv.includes("--components");
const isComponent = (id: string) =>
  id.startsWith("component/story-") || id.startsWith("component/passage-");
const selected = inventory.fixtures.filter(
  (f) =>
    (["story", "story-passage"].includes(f.family) || isComponent(f.id)) &&
    (!componentsOnly || isComponent(f.id)) &&
    (only < 0 || f.id.includes(process.argv[only + 1]!)),
);
assert.ok(selected.length, "No story fixtures selected");
if (only < 0)
  assert.equal(
    selected.filter((f) => isComponent(f.id)).length,
    23,
    "Missing CE0 story component entry",
  );
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
    const inputs =
      entry.kind === "passage"
        ? (await readStoryPassage(sourcePath)).beats.map((beat) => ({
            id: `${entry.id}/${beat.id}`,
            scene: beat.scene,
          }))
        : [
            {
              id: entry.id,
              scene: JSON.parse(await readFile(sourcePath, "utf8")),
            },
          ];
    const cases = inputs.flatMap((item) => [
      item,
      ...storyComponentVariants(item.id, StorySceneSchema.parse(item.scene)),
      ...motionPathVariants(item.id, StorySceneSchema.parse(item.scene)),
      ...appearanceVariants(item.id, StorySceneSchema.parse(item.scene)),
    ]);
    for (const item of cases) {
      const input = StorySceneSchema.parse(item.scene);
      const composition = storyToComposition(input),
        scene = compileStoryScene(input);
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
            typeof Render.compileStoryScene
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
          const preview = m.createCompositionPreview(
            canvas,
            composition,
            await m.loadCompositionResources(composition, (id) => urls[id]!),
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
            compositionRenderMs += performance.now() - at;
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
          preview.dispose();
          legacy.dispose();
          return {
            maxDelta,
            minPsnr,
            failures,
            ratio: compositionMs / legacyMs,
            ...(profile
              ? {
                  legacyMs,
                  compositionMs,
                  legacyRenderMs,
                  compositionRenderMs,
                  evaluationMs,
                  graphMs,
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
      if (
        (only < 0 || process.argv.includes("--exports")) &&
        [
          "component/story-leader/spatial-morph",
          "component/story-state/appearance-uniform",
        ].includes(item.id)
      )
        await assertAdapterExport(input, dirname(sourcePath), item.id);
      if (
        only < 0 &&
        ([
          "component/story-text-fit",
          "component/story-value",
          "component/story-mask",
          "component/story-leader/flow-target-inverted",
          "component/story-state/blended-container",
        ].includes(item.id) ||
          (entry.id.startsWith("component/passage-") && item === cases[0]))
      )
        await assertAdapterExport(input, dirname(sourcePath), item.id);
    }
  }
  console.log(
    `CE4 story/component parity: ${totalItems} items, ${totalFrames} frames`,
  );
} finally {
  await browser.close();
  await server.close();
}
