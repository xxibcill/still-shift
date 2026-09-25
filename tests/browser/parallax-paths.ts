import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import {
  CinematicSceneSchema,
  CinematicAnimationResultSchema,
} from "../../packages/scene-contract/src/cinematic.ts";
import { compileCinematicScene } from "../../packages/renderer-core/src/cinematic-scene.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
import { inspectFocusQuality } from "./focus-quality.ts";

// Validate existing quick exports against the interactive lab at the same duration.
const output = resolve(
  process.argv[2] ??
    "benchmarks/results/cinematic-illustrated/path-variations-v1",
);
const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "parallax-paths-"));
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const samples: unknown[] = [];
const focusChecks: unknown[] = [];
const errors: string[] = [];
const entries =
  process.argv[3] === "detail_to_world"
    ? [["ci-05-detail-to-world", "detail"]]
    : process.argv[3] === "focus_handoff"
      ? [["ci-06-focus-handoff", "focus"]]
      : [
          ["ci-04-rising-vista", "rising"],
          ["ci-07-curved-approach", "curved"],
        ];
let compiledConfigurations = 0;
async function pixels(path: string, frame?: number) {
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
}
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [id, name] of entries) {
    const source = CinematicSceneSchema.parse(
      JSON.parse(
        await readFile(
          `benchmarks/fixtures/cinematic-illustrated/${id}.json`,
          "utf8",
        ),
      ),
    );
    for (const fps of [24, 30] as const)
      for (const durationMs of [3000, 4000, 8000])
        for (const intensity of [
          "dramatic",
          "standard",
          "restrained",
        ] as const) {
          compileCinematicScene({
            ...source,
            fps,
            durationMs,
            recipe: { ...source.recipe, intensity },
          });
          compiledConfigurations++;
        }
    const video = join(output, `${name}.mp4`);
    const result = CinematicAnimationResultSchema.parse(
      JSON.parse(await readFile(`${video}.result.json`, "utf8")),
    );
    assert.equal(result.frameCount, 96);
    assert.equal(result.cameraValidation.checkedFrames, 96);
    const { stdout } = await run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,nb_frames,r_frame_rate,duration",
      "-of",
      "json",
      video,
    ]);
    const stream = JSON.parse(stdout).streams[0];
    assert.equal(stream.width, 1920);
    assert.equal(stream.height, 1080);
    assert.equal(stream.nb_frames, "96");
    assert.equal(stream.r_frame_rate, "24/1");
    assert.equal(Number(stream.duration), 4);
    await page.goto(
      `${server.resolvedUrls!.local[0]}illustrated.html?collection=cinematic&scene=${id}&duration=4000`,
    );
    await page.waitForFunction(
      (title) =>
        document
          .querySelector("#status")
          ?.textContent?.startsWith(`${title} ready`),
      source.title,
    );
    if (source.recipe.preset === "focus_handoff")
      focusChecks.push(await inspectFocusQuality(page, source));
    const frames =
      source.recipe.preset === "focus_handoff"
        ? [0, 23, 43, 62, 95]
        : [0, 12, 36, 64, 95];
    for (const frame of frames) {
      const base64 = await page.evaluate((frame) => {
        const slider = document.querySelector<HTMLInputElement>("#scrub")!;
        slider.value = String(frame);
        slider.dispatchEvent(new Event("input"));
        return document
          .querySelector<HTMLCanvasElement>("#illustrated-preview")!
          .toDataURL()
          .split(",")[1]!;
      }, frame);
      const still = join(temporary, `${name}-${frame}.png`);
      await writeFile(still, Buffer.from(base64, "base64"));
      const score = compareFrameSamples(
        await pixels(still),
        await pixels(video, frame),
        96,
        54,
      );
      assert.equal(
        score.warning,
        null,
        `${name} frame ${frame}: ${JSON.stringify(score)}`,
      );
      samples.push({ id, frame, score });
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, "qa.json"),
    JSON.stringify(
      { compiledConfigurations, errors, samples, focusChecks },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      compiledConfigurations,
      parityFrames: samples.length,
      errors,
    }),
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
