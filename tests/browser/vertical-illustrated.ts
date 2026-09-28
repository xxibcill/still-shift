import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import { PreparedAnimationResultSchema } from "../../packages/scene-contract/src/prepared.ts";

const run = promisify(execFile);
const directory = await mkdtemp(
  join(tmpdir(), "still-shift-vertical-illustrated-"),
);
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls!.local[0]}illustrated.html`);
  await page.locator("#scene").selectOption("chronicle-reveal");
  await page.locator("#output-format").selectOption("vertical");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.startsWith("Layered reveal ready"),
  );
  assert.deepEqual(
    await page
      .locator("#illustrated-preview")
      .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
    [1080, 1920],
  );
  await page.locator("#scene").selectOption("cinematic:ci-01-threshold-push");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.includes("Scene unavailable"),
  );
  assert.match(await page.locator("#error").innerText(), /coverage/i);
  await page.locator("#scene").selectOption("cinematic:ci-04-rising-vista");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.startsWith("Rising Vista · Across the fields ready"),
  );
  assert.deepEqual(
    await page
      .locator("#illustrated-preview")
      .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
    [1080, 1920],
  );

  const output = join(directory, "illustrated.mp4");
  const { stdout: cliOutput } = await run(
    process.execPath,
    [
      "--import",
      "tsx",
      "tools/still-shift-cli/src/cli.ts",
      "animate-scene",
      "--scene",
      resolve("benchmarks/fixtures/history-offstage-v2/chronicle-reveal.json"),
      "--output",
      output,
      "--format",
      "vertical",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(JSON.parse(cliOutput).metrics.format, "vertical");
  const result = PreparedAnimationResultSchema.parse(
    JSON.parse(await readFile(`${output}.result.json`, "utf8")),
  );
  assert.equal(result.checksums.source.startsWith("sha256:"), true);
  assert.deepEqual(
    [result.metrics.width, result.metrics.height, result.frameCount],
    [1080, 1920, 168],
  );
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,codec_name",
    "-of",
    "json",
    output,
  ]);
  const stream = JSON.parse(stdout).streams[0];
  assert.deepEqual(
    [stream.width, stream.height, stream.codec_name],
    [1080, 1920, "h264"],
  );

  const asset = JSON.parse(
    await readFile(
      "benchmarks/fixtures/story-motion/relationship-build.json",
      "utf8",
    ),
  ).assets[0];
  asset.path = resolve("benchmarks/fixtures/story-motion", asset.path);
  const storyPath = join(directory, "story.json");
  const storyOutput = join(directory, "story.mp4");
  await writeFile(
    storyPath,
    JSON.stringify({
      schemaVersion: "story-scene-1",
      title: "Direct portrait override",
      fps: 24,
      frameCount: 8,
      motionModel: "curves-1",
      width: 1920,
      height: 1080,
      background: "#211f1b",
      assets: [asset],
      nodes: [
        {
          id: "box",
          type: "rect",
          x: 100,
          y: 400,
          width: 300,
          height: 300,
          fill: "#e8dfc9",
        },
      ],
      recipe: {
        preset: "generic",
        moves: [
          {
            node: "box",
            window: { start: 1, end: 7, cue: "mark" },
            to: { x: 500 },
          },
        ],
        emphasis: [],
      },
      formats: { vertical: { nodes: { box: { x: 320, y: 700 } } } },
    }),
  );
  const { stdout: storyCliOutput } = await run(
    process.execPath,
    [
      "--import",
      "tsx",
      "tools/still-shift-cli/src/cli.ts",
      "animate-scene",
      "--scene",
      storyPath,
      "--output",
      storyOutput,
      "--format",
      "vertical",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const storyResult = JSON.parse(storyCliOutput);
  assert.deepEqual(
    [
      storyResult.metrics.width,
      storyResult.metrics.height,
      storyResult.frameCount,
    ],
    [1080, 1920, 8],
  );
  assert.equal(
    JSON.parse(await readFile(`${storyOutput}.input.json`, "utf8")).format,
    "vertical",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Vertical Lab variants, cinematic coverage failure, and illustrated/story H.264 exports passed.",
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
