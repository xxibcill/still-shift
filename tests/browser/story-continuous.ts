import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
import {
  measureMotionEnergy,
  requireContinuousEnergy,
} from "../../scripts/story-motion/motion-energy.ts";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { loadPreparedScene } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { PreparedNodeSchema } from "../../packages/scene-contract/src/prepared.ts";
import { strips, art } from "../../scripts/story-motion/design.ts";
import type { StoryRenderScene } from "../../packages/renderer-core/src/story-scene.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";

const root = resolve(".");
const prepared = await loadPreparedScene(
  resolve("benchmarks/fixtures/story-motion/unequal-margins.json"),
);
const base = { ...prepared.scene, motionGrammar: "v2" } as StoryRenderScene;
const assetPaths = prepared.assetPaths;
const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(
    `${server.resolvedUrls!.local[0]}tools/export-worker/index.html`,
  );
  const variants = [
    [art("single", "house", 240, 200, 600, 440)],
    strips("assembled", "house", 240, 200, 600, 440),
  ].map((nodes) => ({
    ...base,
    nodes: nodes.map((n) => PreparedNodeSchema.parse(n)),
    tracks: {},
    connectors: [],
  }));
  const result = await page.evaluate(
    async ({ root, variants, assetPaths, base }) => {
      const { createIllustratedPreview, loadIllustratedImages } = await import(
        `/@fs/${root}/packages/renderer-core/src/illustrated-renderer.ts`
      );
      const images = await loadIllustratedImages(
        base,
        (id: string) => `/@fs/${assetPaths[id]}`,
      );
      const canvas = document.createElement("canvas");
      const render = (scene: typeof base, frame = 0) => {
        createIllustratedPreview(canvas, scene, images).renderFrame(frame);
        return canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const single = render(variants[0]!),
        assembled = render(variants[1]!);
      let stripMaxDifference = 0;
      const differenceColumns = new Map<number, number>();
      for (let i = 0; i < single.length; i++) {
        stripMaxDifference = Math.max(
          stripMaxDifference,
          Math.abs(single[i]! - assembled[i]!),
        );
        if (Math.abs(single[i]! - assembled[i]!) > 1) {
          const x = Math.floor(i / 4) % 1920;
          differenceColumns.set(x, (differenceColumns.get(x) ?? 0) + 1);
        }
      }
      let fullRevealIdentical = true,
        backwardIdentical = true;
      const wipeStarts: number[] = [];
      for (const align of ["left", "center", "right"] as const) {
        const node = {
          id: "text",
          type: "text" as const,
          text: "The same season.",
          x: 960,
          y: 200,
          width: 0,
          height: 0,
          opacity: 1,
          rotation: 0,
          origin: [0.5, 0.5] as [number, number],
          fontSize: 80,
          color: "#211F1B",
          weight: "normal" as const,
          font: "sans-serif" as const,
          fontAsset: "label",
          align,
        };
        const scene = { ...base, nodes: [node], tracks: {}, connectors: [] };
        const full = render(scene);
        const context = canvas.getContext("2d")!;
        context.fillStyle = base.background;
        context.fillRect(0, 0, 1920, 1080);
        const font = images.fonts.get("label");
        context.font = `${font.weight} 80px "${font.family}"`;
        context.fillStyle = node.color;
        context.textAlign = align;
        context.textBaseline = "top";
        context.fillText(node.text, 960, 200);
        const reference = context.getImageData(0, 0, 1920, 1080).data;
        fullRevealIdentical &&= full.every((v, i) => v === reference[i]);
        const words = render({
          ...scene,
          nodes: [{ ...node, revealMode: "words" }],
        });
        fullRevealIdentical &&= full.every((v, i) => v === words[i]);
        const animated = {
          ...scene,
          tracks: {
            text: {
              reveal: [
                { time: 0, value: 0 },
                { time: 24, value: 1, easing: "linear" as const },
              ],
            },
          },
        };
        const half = render(animated, 12);
        render(animated, 23);
        const back = render(animated, 12);
        backwardIdentical &&= half.every((v, i) => v === back[i]);
        let first = 1920;
        for (let y = 190; y < 310; y++)
          for (let x = 0; x < 1920; x++)
            if (half[(y * 1920 + x) * 4]! < 160) first = Math.min(first, x);
        wipeStarts.push(first);
      }
      return {
        stripMaxDifference,
        differenceColumns: [...differenceColumns]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10),
        fullRevealIdentical,
        backwardIdentical,
        wipeStarts,
      };
    },
    { root, variants, assetPaths, base },
  );
  console.log(JSON.stringify(result));
  assert.ok(
    result.stripMaxDifference <= 1,
    "Assembled strips must recompose the single image",
  );
  assert.ok(
    result.fullRevealIdentical,
    "A complete reveal must match the original fillText",
  );
  assert.ok(result.backwardIdentical);
  assert.ok(
    result.wipeStarts[2]! < result.wipeStarts[1]! &&
      result.wipeStarts[1]! < result.wipeStarts[0]!,
  );

  const prototype = process.argv.indexOf("--prototype");
  if (prototype >= 0) {
    const directory = resolve(process.argv[prototype + 1]!);
    const input = StorySceneSchema.parse(
      JSON.parse(
        await readFile(
          "benchmarks/fixtures/story-motion-v2/unequal-margins.json",
          "utf8",
        ),
      ),
    );
    const scene = compileStoryScene(input);
    const paths = Object.fromEntries(
      [...input.assets, ...(input.fonts ?? [])].map((a) => [
        a.id,
        resolve("benchmarks/fixtures/story-motion-v2", a.path),
      ]),
    );
    await mkdir(join(directory, "browser"), { recursive: true });
    const report = await page.evaluate(
      async ({ root, scene, paths }) => {
        const { createIllustratedPreview, loadIllustratedImages } =
          await import(
            `/@fs/${root}/packages/renderer-core/src/illustrated-renderer.ts`
          );
        const images = await loadIllustratedImages(
          scene,
          (id: string) => `/@fs/${paths[id]}`,
        );
        const canvas = document.createElement("canvas");
        const preview = createIllustratedPreview(canvas, scene, images);
        const render = (frame: number) => {
          preview.renderFrame(frame);
          return canvas.toDataURL().split(",")[1]!;
        };
        const captures = [0, 18, 28, 48, 72, 100, 116, 150, 191].map(
          (frame) => ({ frame, png: render(frame) }),
        );
        const backward = [100, 28, 191, 0].every(
          (frame) =>
            render(frame) === captures.find((c) => c.frame === frame)!.png,
        );
        return { captures, backward };
      },
      { root, scene, paths },
    );
    assert.ok(report.backward, "Prototype backward seeks must be identical");
    for (const capture of report.captures)
      await writeFile(
        join(directory, "browser", `frame-${capture.frame}.png`),
        Buffer.from(capture.png, "base64"),
      );
    const run = promisify(execFile);
    const rgb = async (path: string, frame?: number) => {
      const filter = [
        ...(frame === undefined ? [] : [`select=eq(n\\,${frame})`]),
        "scale=96:54:flags=bicubic",
      ].join(",");
      const { stdout } = await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          path,
          "-vf",
          filter,
          "-fps_mode",
          "vfr",
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "pipe:1",
        ],
        { encoding: "buffer" },
      );
      return new Uint8Array(stdout);
    };
    const video = join(directory, "unequal-margins.mp4");
    const parity = [];
    for (const capture of report.captures) {
      const score = compareFrameSamples(
        await rgb(join(directory, "browser", `frame-${capture.frame}.png`)),
        await rgb(video, capture.frame),
        96,
        54,
      );
      assert.equal(
        score.warning,
        null,
        `Prototype frame ${capture.frame} preview/export parity`,
      );
      parity.push({ frame: capture.frame, ...score });
    }
    const energy = await measureMotionEnergy(video);
    requireContinuousEnergy(energy, "Unequal Margins prototype");
    assert.ok(
      energy.peakFrame >= 48 && energy.peakFrame <= 104,
      `Prototype peak frame ${energy.peakFrame} should land in the shared-strain beat (48–104)`,
    );
    await writeFile(
      join(directory, "browser-checks.json"),
      JSON.stringify(
        {
          ...result,
          backwardSeeks: 4,
          parity,
          energyGates: energy.gates,
          peakFrame: energy.peakFrame,
          frames: report.captures.map((c) => c.frame),
        },
        null,
        2,
      ) + "\n",
    );
  }
} finally {
  await browser.close();
  await server.close();
}
