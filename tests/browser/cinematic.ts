import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import {
  PreparedAnimationEngine,
  loadPreparedScene,
} from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import {
  CinematicSceneSchema,
  CinematicAnimationResultSchema,
} from "../../packages/scene-contract/src/cinematic.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
import type * as Renderer from "../../packages/renderer-core/src/illustrated-renderer.ts";

const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "still-shift-cinematic-"));
const arg = process.argv.indexOf("--renders");
const output = arg >= 0 ? resolve(process.argv[arg + 1]!) : temporary;
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const samples: unknown[] = [];
const rgb = async (path: string, frame?: number) => {
  const filters = [
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
      filters,
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
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `${server.resolvedUrls!.local[0]}illustrated.html?collection=cinematic`,
  );
  const comparePreviewFrame = async (
    id: string,
    frame: number,
    video: string,
  ) => {
    const base64 = await page.evaluate((frame) => {
      const slider = document.querySelector<HTMLInputElement>("#scrub")!;
      slider.value = String(frame);
      slider.dispatchEvent(new Event("input"));
      return document
        .querySelector<HTMLCanvasElement>("#illustrated-preview")!
        .toDataURL()
        .split(",")[1]!;
    }, frame);
    const path = join(temporary, `${id}-${frame}.png`);
    await writeFile(path, Buffer.from(base64, "base64"));
    const score = compareFrameSamples(
      await rgb(path),
      await rgb(video, frame),
      96,
      54,
    );
    assert.equal(
      score.warning,
      null,
      `${id} frame ${frame}: ${JSON.stringify(score)}`,
    );
    samples.push({ id, frame, score });
    return base64;
  };
  const entries = JSON.parse(
    await readFile(
      "benchmarks/fixtures/cinematic-illustrated/catalog.json",
      "utf8",
    ),
  ) as { id: string; title: string }[];
  for (const entry of entries) {
    await page.locator("#scene").selectOption(`cinematic:${entry.id}`);
    await page.waitForFunction(
      (title) =>
        document
          .querySelector("#status")
          ?.textContent?.startsWith(`${title} ready`),
      entry.title,
    );
    const scenePath = resolve(
      `benchmarks/fixtures/cinematic-illustrated/${entry.id}.json`,
    );
    const video = join(output, `${entry.id}.mp4`);
    if (output === temporary)
      await new PreparedAnimationEngine().animate({
        scenePath,
        outputPath: video,
      });
    const result = CinematicAnimationResultSchema.parse(
      JSON.parse(await readFile(`${video}.result.json`, "utf8")),
    );
    assert.equal(
      result.checksums.source,
      `sha256:${createHash("sha256")
        .update(await readFile(scenePath))
        .digest("hex")}`,
    );
    assert.equal(
      result.checksums.output,
      `sha256:${createHash("sha256")
        .update(await readFile(video))
        .digest("hex")}`,
    );
    assert.equal(result.frameCount, 168);
    assert.equal(result.cameraValidation.checkedFrames, 168);
    const frames: string[] = [];
    for (const frame of [
      0, 2, 3, 4, 12, 24, 53, 84, 131, 153, 154, 155, 167, 0,
    ])
      frames.push(await comparePreviewFrame(entry.id, frame, video));
    assert.notEqual(
      frames[0],
      frames[4],
      "Dramatic motion must start within the first half second",
    );
    assert.equal(
      frames[0],
      frames.at(-1),
      "Seeking must reproduce the initial frame exactly",
    );
    assert.notEqual(
      frames[0],
      frames.at(-2),
      "Parallax must visibly change the scene",
    );
    await page.locator("#play").click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector<HTMLInputElement>("#scrub")!.value) > 0,
    );
    await page.locator("#play").click();
  }
  await page.locator("#scene").selectOption(`cinematic:${entries[0]!.id}`);
  await page.waitForFunction(
    () => !document.querySelector<HTMLButtonElement>("#play")!.disabled,
  );
  const strengthFrames: string[] = [];
  for (const strength of ["restrained", "standard", "dramatic"]) {
    await page.locator("#strength").selectOption(strength);
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>("#play")!.disabled,
    );
    strengthFrames.push(
      await page.evaluate(() => {
        const slider = document.querySelector<HTMLInputElement>("#scrub")!;
        slider.value = "167";
        slider.dispatchEvent(new Event("input"));
        return document
          .querySelector<HTMLCanvasElement>("#illustrated-preview")!
          .toDataURL();
      }),
    );
    if (strength === "standard") {
      const standardPath = join(temporary, "standard.json");
      const source = CinematicSceneSchema.parse(
        JSON.parse(
          await readFile(
            `benchmarks/fixtures/cinematic-illustrated/${entries[0]!.id}.json`,
            "utf8",
          ),
        ),
      );
      source.recipe.intensity = "standard";
      for (const asset of source.assets)
        asset.path = resolve(
          "benchmarks/fixtures/cinematic-illustrated",
          asset.path,
        );
      await writeFile(standardPath, JSON.stringify(source));
      const video = join(temporary, "standard.mp4");
      await new PreparedAnimationEngine().animate({
        scenePath: standardPath,
        outputPath: video,
      });
      for (const frame of [0, 53, 167])
        await comparePreviewFrame("standard", frame, video);
    }
  }
  assert.equal(
    new Set(strengthFrames).size,
    3,
    "All three lab strengths must produce distinct camera movement",
  );
  const primary = resolve(
    "benchmarks/fixtures/cinematic-illustrated/ci-09-layered-parallax.json",
  );
  const source = CinematicSceneSchema.parse(
    JSON.parse(await readFile(primary, "utf8")),
  );
  for (const asset of source.assets)
    asset.path = resolve(
      "benchmarks/fixtures/cinematic-illustrated",
      asset.path,
    );
  const scenePath = join(temporary, "variant.json");
  source.fps = 30;
  source.recipe.intensity = "dramatic";
  await writeFile(scenePath, JSON.stringify(source));
  const thirty = await new PreparedAnimationEngine().animate({
    scenePath,
    outputPath: join(temporary, "thirty.mp4"),
  });
  assert.equal(thirty.frameCount, 210);
  const repeat = await new PreparedAnimationEngine().animate({
    scenePath: primary,
    outputPath: join(temporary, "repeat.mp4"),
  });
  const original = JSON.parse(
    await readFile(join(output, `${entries[0]!.id}.mp4.result.json`), "utf8"),
  );
  assert.equal(
    repeat.checksums.output,
    original.checksums.output,
    "Repeated export must preserve exact pixels/timing",
  );
  const prepared = await loadPreparedScene(primary);
  const alphaError = await page.evaluate(
    async ({ scene, url }) => {
      const renderer = (await import(url)) as typeof Renderer;
      try {
        await renderer.loadIllustratedImages(
          scene,
          (id) =>
            `/cinematic/assets/${id === "background" ? "subject" : id}.png`,
        );
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    },
    {
      scene: prepared.scene,
      url: `/@fs${resolve("packages/renderer-core/src/illustrated-renderer.ts")}`,
    },
  );
  assert.match(alphaError!, /coverage contains transparent/);
  const unsafe = structuredClone(source);
  unsafe.nodes[0]!.x = 0;
  await writeFile(scenePath, JSON.stringify(unsafe));
  await assert.rejects(loadPreparedScene(scenePath), /coverage/);
  assert.deepEqual(errors, []);
  const report = {
    comparisons: samples.length,
    compositions: entries.length,
    additional30fpsFrames: 210,
    additional30fpsIntensity: "dramatic",
    deterministicRepeat: true,
    strengthControlChecked: true,
    checkedStrengths: ["restrained", "standard", "dramatic"],
    transparentPlateRejected: true,
    uncoveredFrameRejected: true,
    samples,
  };
  if (output !== temporary)
    await writeFile(
      join(output, "parity-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(
    `Cinematic QA passed: ${samples.length} frame comparisons, two compositions, 24/30 fps, deterministic repeat, transparent and uncovered plate rejection.`,
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
