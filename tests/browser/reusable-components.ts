import assert from "node:assert/strict";
import { verifyReusableExposure } from "./reusable-component-pixels.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { REUSABLE_EXAMPLES } from "../../packages/scene-contract/src/reusable-component-demo.ts";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";

const run = promisify(execFile),
  output = resolve("benchmarks/results/reusable-components"),
  temp = await mkdtemp(join(tmpdir(), "shared-components-"));
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  origin = server.resolvedUrls!.local[0]!;
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const ready = () =>
  page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes(" ready ·"),
  );
const seek = (frame: number) =>
  page.evaluate((value) => {
    const input = document.querySelector<HTMLInputElement>("#scrub")!;
    input.value = String(value);
    input.dispatchEvent(new Event("input"));
    return document
      .querySelector<HTMLCanvasElement>("#preview")!
      .toDataURL()
      .split(",")[1]!;
  }, frame);
const canvas = () =>
  page
    .locator("#preview")
    .evaluate((node: HTMLCanvasElement) => node.toDataURL());
const apply = () =>
  page.getByRole("button", { name: "Apply changes", exact: true }).click();
async function rgb(path: string, frame?: number) {
  const { stdout } = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      [
        ...(frame === undefined ? [] : ["select=eq(n\\," + frame + ")"]),
        "scale=96:54:flags=bicubic",
      ].join(","),
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
const evidence: unknown[] = [];
const isolatedOnly = process.argv.includes("--isolated-only");
const modes = isolatedOnly ? ["isolated"] : ["commerce", "story", "isolated"];
try {
  for (const mode of modes)
    for (const example of REUSABLE_EXAMPLES) {
      await page.goto(
        origin +
          "reusable-components.html?mode=" +
          mode +
          "&example=" +
          example.id,
      );
      await ready();
      for (const fps of [24, 30]) {
        await page.locator('[name="fps"]').selectOption(String(fps));
        await apply();
        await ready();
        const middle = Math.floor(fps * 4),
          reference = await seek(middle);
        for (const frame of [0, fps * 8 - 1, 12, middle - 1]) await seek(frame);
        assert.equal(
          await seek(middle),
          reference,
          mode + " " + example.id + " backward seek at " + fps,
        );
      }
      const fps = mode === "commerce" ? 24 : 30;
      await page.locator('[name="fps"]').selectOption(String(fps));
      await apply();
      await ready();
      const name = mode + "-" + example.id;
      if (!process.argv.includes("--smoke-only")) {
        const downloaded = page.waitForEvent("download");
        await page.locator("#source").click();
        const zip = join(temp, name + ".zip");
        await (await downloaded).saveAs(zip);
        const bundle = join(temp, name);
        await run("unzip", ["-q", zip, "-d", bundle]);
        const settings = JSON.parse(
          await readFile(join(bundle, "components.demo.json"), "utf8"),
        );
        assert.equal(settings.mode, mode);
        assert.equal(settings.example, example.id);
        const scene = JSON.parse(
          await readFile(join(bundle, "scene.json"), "utf8"),
        );
        assert.equal(scene.componentData.schemaVersion, "scene-components-1");
        const video = join(output, name + ".mp4");
        for (const suffix of ["", ".scene.json", ".result.json"])
          await rm(video + suffix, { force: true });
        const result = await new PreparedAnimationEngine().animate({
          scenePath: join(bundle, "scene.json"),
          outputPath: video,
        });
        assert.equal(result.frameCount, fps * 8);
        const parity = [];
        for (const frame of [
          0,
          12,
          Math.floor(fps * 2.5),
          fps * 4,
          fps * 8 - 1,
        ]) {
          const path = join(temp, name + "-" + frame + ".png");
          await writeFile(path, Buffer.from(await seek(frame), "base64"));
          const score = compareFrameSamples(
            await rgb(path),
            await rgb(video, frame),
            96,
            54,
          );
          assert.equal(
            score.warning,
            null,
            name + " parity " + frame + ": " + JSON.stringify(score),
          );
          parity.push({ frame, ...score });
        }
        evidence.push({ name, fps, frameCount: result.frameCount, parity });
      }
      console.log(
        name +
          ": 24/30 fps, direct/backward seeking" +
          (process.argv.includes("--smoke-only")
            ? ""
            : "; source bundle, encode and 5 parity samples passed"),
      );
    }
  await page.goto(
    origin + "reusable-components.html?mode=story&example=instances",
  );
  await ready();
  await seek(90);
  const before = await canvas();
  await page.locator('[name="middleText"]').fill("X".repeat(120));
  await apply();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("preserved"),
  );
  assert.equal(await canvas(), before, "invalid edit preserves valid pixels");
  assert.equal(await page.locator("#export").isDisabled(), true);
  await page.locator('[name="middleText"]').fill("Middle changed");
  await page.locator('[name="middleDelay"]').fill("9");
  await apply();
  await ready();
  const edited = await canvas();
  assert.notEqual(edited, before);
  const saved = page.waitForEvent("download");
  await page.locator("#save").click();
  const settingsPath = join(temp, "saved.demo.json");
  await (await saved).saveAs(settingsPath);
  await page.locator('[name="middleText"]').fill("Another edit");
  await apply();
  await ready();
  await page.locator("#load").setInputFiles(settingsPath);
  await ready();
  assert.equal(await canvas(), edited, "settings reload restores pixels");
  await page.screenshot({
    path: join(output, "gallery-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: join(output, "gallery-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (!process.argv.includes("--smoke-only") && !isolatedOnly)
    for (const mode of ["commerce", "story"]) {
      await page.goto(
        origin + "reusable-components.html?mode=" + mode + "&example=value",
      );
      await ready();
      const exported = page.waitForEvent("download", { timeout: 180000 });
      await page.locator("#export").click();
      await (await exported).saveAs(join(output, mode + "-ui-export.mp4"));
      const { stdout } = await run("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_frames",
        "-of",
        "csv=p=0",
        join(output, mode + "-ui-export.mp4"),
      ]);
      assert.equal(Number(stdout.trim()), 192);
    }
  assert.deepEqual(errors, []);
  const exposure = await verifyReusableExposure(page, resolve("."));
  await writeFile(
    join(
      output,
      process.argv.includes("--smoke-only")
        ? "smoke.json"
        : isolatedOnly
          ? "isolated-verification.json"
          : "verification.json",
    ),
    JSON.stringify(
      {
        examples: modes.length * REUSABLE_EXAMPLES.length,
        clocks: [24, 30],
        errors,
        exposure,
        evidence,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
  await rm(temp, { recursive: true, force: true });
}
