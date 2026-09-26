import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import {
  StorySceneSchema,
  StoryAnimationResultSchema,
} from "../../packages/scene-contract/src/story.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";

const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "still-shift-story-"));
const argument = process.argv.indexOf("--renders");
const renders = argument < 0 ? temporary : resolve(process.argv[argument + 1]!);
const entries = JSON.parse(
  await readFile("benchmarks/fixtures/story-motion/catalog.json", "utf8"),
) as { id: string; title: string }[];
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const samples: unknown[] = [];
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
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `${server.resolvedUrls!.local[0]}illustrated.html?collection=story`,
  );
  for (const entry of entries) {
    await page.selectOption("#scene", `story:${entry.id}`);
    await page.waitForFunction(
      (title) =>
        document
          .querySelector("#status")
          ?.textContent?.startsWith(`${title} ready`),
      entry.title,
    );
    assert.equal(await page.locator("#story-controls").isVisible(), true);
    const scenePath = resolve(
      `benchmarks/fixtures/story-motion/${entry.id}.json`,
    );
    const video = join(renders, `${entry.id}.mp4`);
    if (renders === temporary)
      await new PreparedAnimationEngine().animate({
        scenePath,
        outputPath: video,
      });
    const result = StoryAnimationResultSchema.parse(
      JSON.parse(await readFile(`${video}.result.json`, "utf8")),
    );
    assert.equal(
      result.checksums.source,
      `sha256:${createHash("sha256")
        .update(await readFile(scenePath))
        .digest("hex")}`,
    );
    assert.equal(result.frameCount, 192);
    const captures = new Map<number, string>();
    for (const frame of [0, 48, 71, 72, 120, 143, 144, 166, 191, 0]) {
      const base64 = await page.evaluate((index) => {
        const slider = document.querySelector<HTMLInputElement>("#scrub")!;
        slider.value = String(index);
        slider.dispatchEvent(new Event("input"));
        return document
          .querySelector<HTMLCanvasElement>("#illustrated-preview")!
          .toDataURL()
          .split(",")[1]!;
      }, frame);
      if (captures.has(frame)) {
        assert.equal(
          base64,
          captures.get(frame),
          "Backward seek must be pixel-identical",
        );
        continue;
      }
      captures.set(frame, base64);
      const image = join(temporary, `${entry.id}-${frame}.png`);
      await writeFile(image, Buffer.from(base64, "base64"));
      const score = compareFrameSamples(
        await rgb(image),
        await rgb(video, frame),
        96,
        54,
      );
      assert.equal(
        score.warning,
        null,
        `${entry.id} ${frame}: ${JSON.stringify(score)}`,
      );
      samples.push({ id: entry.id, frame, score });
    }
    assert.notEqual(
      captures.get(0),
      captures.get(191),
      "Every recipe must change the visible scene",
    );
  }
  // Exercise the authoring controls on a discrete event, including rejected edits.
  await page.selectOption("#scene", "story:category-swap");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.startsWith("Category Swap ready"),
  );
  await page.locator("#story-controls summary").click();
  const timing = page.locator("#story-events input").first();
  await timing.fill("999");
  await page.getByRole("button", { name: "Apply timing", exact: true }).click();
  assert.match(
    await page.locator("#story-events [role=status]").innerText(),
    /inside the rendered timeline/,
  );
  await timing.fill("100");
  await page.getByRole("button", { name: "Apply timing", exact: true }).click();
  assert.match(
    await page.locator("#story-events [role=status]").innerText(),
    /Timing applied/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Phone layout must not overflow",
  );

  // Real exports cover non-integer milliseconds and the existing CLI route.
  const input = StorySceneSchema.parse(
    JSON.parse(
      await readFile(
        "benchmarks/fixtures/story-motion/category-swap.json",
        "utf8",
      ),
    ),
  );
  for (const asset of input.assets)
    asset.path = resolve("benchmarks/fixtures/story-motion", asset.path);
  const exactPath = join(temporary, "exact-646.json");
  await writeFile(
    exactPath,
    JSON.stringify({ ...input, frameCount: 646, episodeStartFrame: 4748 }),
  );
  const exact = await new PreparedAnimationEngine().animate({
    scenePath: exactPath,
    outputPath: join(temporary, "exact-646.mp4"),
  });
  assert.equal(exact.frameCount, 646);
  assert.equal(exact.durationMs, (646 * 1000) / 24);
  const thirtyPath = join(temporary, "thirty.json");
  await writeFile(thirtyPath, JSON.stringify({ ...input, fps: 30 }));
  const { stdout } = await run(process.execPath, [
    "--import",
    "tsx",
    "tools/still-shift-cli/src/cli.ts",
    "animate-scene",
    "--scene",
    thirtyPath,
    "--output",
    join(temporary, "thirty.mp4"),
  ]);
  const thirty = StoryAnimationResultSchema.parse(JSON.parse(stdout));
  assert.equal(thirty.fps, 30);
  assert.equal(thirty.frameCount, 192);
  assert.deepEqual(errors, []);
  const report = {
    comparisons: samples.length,
    backwardSeeks: entries.length,
    exactFrameExport: 646,
    cli30fpsFrames: 192,
    samples,
  };
  if (renders !== temporary)
    await writeFile(
      join(renders, "parity-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(
    `Story QA passed: ${samples.length} parity comparisons, seven backward seeks, timing controls, phone layout, 646-frame export, 30fps CLI.`,
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
