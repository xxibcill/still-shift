import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import {
  PreparedAnimationEngine,
  loadPreparedScene,
} from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
import { runtimeBrowserUrl } from "@still-shift/execution-runtime/browser";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { expandStoryRecipe } from "../../packages/renderer-core/src/story-generic.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";

const argument = process.argv.indexOf("--output-dir");
assert.ok(argument >= 0, "Pass --output-dir <new directory>");
const output = resolve(process.argv[argument + 1]!);
await mkdir(output);
const root = resolve("."),
  run = promisify(execFile);
const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const reports: unknown[] = [];
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
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(runtimeBrowserUrl(server.resolvedUrls!.local[0]!, "export"));
  for (const name of [
    "gallery",
    "buffer-press",
    "buffer-press-accelerate",
    "supply-ramps",
    "intent-presets",
  ]) {
    const scenePath = resolve(`benchmarks/fixtures/motion-craft/${name}.json`),
      loaded = await loadPreparedScene(scenePath);
    assert.equal(loaded.scene.schemaVersion, "story-scene-1");
    const frames =
      loaded.scene.frameCount === 61
        ? [0, 1, 15, 29, 30, 31, 40, 59, 60]
        : name === "supply-ramps"
          ? [0, 35, 36, 37, 39, 96, 97, 144, 191]
          : [0, 14, 38, 50, 76, 104, 128, 179, 191];
    const result = await page.evaluate(
      async ({ root, scene, paths, frames, name }) => {
        const { createIllustratedPreview, loadIllustratedImages } =
          await import(
            `/@fs/${root}/packages/renderer-core/src/illustrated-renderer.ts`
          );
        const images = await loadIllustratedImages(
            scene,
            (id: string) => `/@fs/${paths[id]}`,
          ),
          canvas = document.createElement("canvas"),
          preview = createIllustratedPreview(canvas, scene, images);
        const render = (frame: number) => {
          preview.renderFrame(frame);
          return canvas.toDataURL().split(",")[1]!;
        };
        const captures = frames.map((frame) => ({ frame, png: render(frame) }));
        const backward = [...frames]
          .reverse()
          .every(
            (frame) =>
              render(frame) === captures.find((c) => c.frame === frame)!.png,
          );
        let textCompletion = true;
        if (name === "gallery") {
          const sharp = { ...scene, effects: [] },
            complete = document.createElement("canvas"),
            plain = document.createElement("canvas");
          const a = createIllustratedPreview(complete, sharp, images),
            b = createIllustratedPreview(
              plain,
              { ...sharp, textAnimators: [] },
              images,
            );
          a.renderFrame(40);
          b.renderFrame(40);
          textCompletion = complete.toDataURL() === plain.toDataURL();
          a.dispose();
          b.dispose();
          const { createMotionTools } = await import(
            `/@fs/${root}/apps/lab/src/motion-tools.ts`
          );
          document.body.style.cssText =
            "margin:0;padding:16px;box-sizing:border-box;background:#211f1b;color:#eee8d9;font:16px sans-serif";
          const inspector = createMotionTools(
            scene,
            (frame: number) => {
              preview.renderFrame(frame);
              inspector.dispatchEvent(
                new CustomEvent("story-frame", { detail: frame }),
              );
            },
            images,
          );
          inspector.style.maxWidth = "100%";
          document.body.replaceChildren(inspector);
        }
        return { captures, backward, textCompletion };
      },
      { root, scene: loaded.scene, paths: loaded.assetPaths, frames, name },
    );
    assert.ok(result.backward, `${name}: backward seeks differ`);
    assert.ok(
      result.textCompletion,
      "Completed glyph animator must equal original text rendering",
    );
    if (name === "gallery")
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page
          .getByLabel("Motion node", { exact: true })
          .selectOption("box");
        await page
          .getByLabel("Motion property", { exact: true })
          .selectOption("x");
        await page.getByLabel("Onion skin", { exact: true }).selectOption("3");
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "Inspector overflows viewport",
        );
        await page.screenshot({
          path: join(output, `lab-${width}.png`),
          fullPage: true,
        });
      }
    const video = join(output, `${name}.mp4`);
    await new PreparedAnimationEngine().animate({
      scenePath,
      outputPath: video,
    });
    for (const capture of result.captures) {
      const image = join(output, `${name}-${capture.frame}.png`);
      await writeFile(image, Buffer.from(capture.png, "base64"));
      const score = compareFrameSamples(
        await rgb(image),
        await rgb(video, capture.frame),
        96,
        54,
      );
      assert.equal(
        score.warning,
        null,
        `${name}/${capture.frame}: ${JSON.stringify(score)}`,
      );
      reports.push({ name, frame: capture.frame, score });
    }
    console.log(`${name}: 9 preview/export samples and reverse seeks passed`);
  }
  const original = StorySceneSchema.parse(
    JSON.parse(
      await readFile(
        "benchmarks/fixtures/story-motion/relationship-build.json",
        "utf8",
      ),
    ),
  );
  const scenes = [
    compileStoryScene(original),
    compileStoryScene(expandStoryRecipe(original)),
  ];
  const paths = Object.fromEntries(
    [...original.assets, ...(original.fonts ?? [])].map((a) => [
      a.id,
      resolve("benchmarks/fixtures/story-motion", a.path),
    ]),
  );
  const parity = await page.evaluate(
    async ({ root, scenes, paths }) => {
      const { createIllustratedPreview, loadIllustratedImages } = await import(
        `/@fs/${root}/packages/renderer-core/src/illustrated-renderer.ts`
      );
      const images = await loadIllustratedImages(
        scenes[0],
        (id: string) => `/@fs/${paths[id]}`,
      );
      const canvases = scenes.map(() => document.createElement("canvas")),
        previews = scenes.map((scene: unknown, i: number) =>
          createIllustratedPreview(canvases[i], scene, images),
        );
      for (const frame of [0, 20, 45, 60, 90, 120, 150, 170, 191]) {
        previews.forEach((p: { renderFrame: (f: number) => void }) =>
          p.renderFrame(frame),
        );
        if (canvases[0]!.toDataURL() !== canvases[1]!.toDataURL())
          return { frame, identical: false };
      }
      previews.forEach((p: { dispose: () => void }) => p.dispose());
      return { identical: true };
    },
    { root, scenes, paths },
  );
  assert.ok(
    parity.identical,
    `Generic macro pixel mismatch: ${JSON.stringify(parity)}`,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(
      {
        samples: reports,
        macroParity: parity,
        textCompletion: true,
        backwardSeeks: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Generic macro pixel parity, glyph completion, desktop and 390px inspector passed",
  );
} finally {
  await browser.close();
  await server.close();
}
