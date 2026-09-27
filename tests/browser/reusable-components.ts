import { verifyBehaviorPixels } from "./component-behavior-pixels.ts";
import { verifyTimingPixels } from "./component-timing-pixels.ts";
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
  page
    .waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes(" ready ·"),
    )
    .catch(async (error) => {
      throw new Error(
        page.url() + ": " + (await page.locator("#status").textContent()),
        { cause: error },
      );
    });
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
const pixelsOnly = process.argv.includes("--pixels-only");
const isolatedOnly = process.argv.includes("--isolated-only");
const storyOnly = process.argv.includes("--story-only");
const timingOnly = process.argv.includes("--timing-only");
const behaviorsOnly = process.argv.includes("--behaviors-only");
const examples = timingOnly
  ? REUSABLE_EXAMPLES.filter((e) => e.version === "reusable-demo-3")
  : behaviorsOnly
    ? REUSABLE_EXAMPLES.filter((e) => e.version === "reusable-demo-2")
    : REUSABLE_EXAMPLES;
const modes = storyOnly
  ? ["story"]
  : isolatedOnly
    ? ["isolated"]
    : ["commerce", "story", "isolated"];
try {
  if (!pixelsOnly) {
    for (const mode of modes)
      for (const example of examples) {
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
          for (const frame of [0, fps * 8 - 1, 12, middle - 1])
            await seek(frame);
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
          assert.equal(
            scene.componentData.schemaVersion,
            settings.schemaVersion === "reusable-demo-3"
              ? "scene-components-3"
              : settings.schemaVersion === "reusable-demo-2"
                ? "scene-components-2"
                : "scene-components-1",
          );
          const video = join(output, name + ".mp4");
          for (const suffix of ["", ".scene.json", ".result.json"])
            await rm(video + suffix, { force: true });
          const result = await new PreparedAnimationEngine().animate({
            scenePath: join(bundle, "scene.json"),
            outputPath: video,
          });
          assert.equal(result.frameCount, fps * 8);
          const parity = [];
          const frames =
            settings.schemaVersion === "reusable-demo-3"
              ? [
                  0,
                  11,
                  12,
                  23,
                  24,
                  47,
                  59,
                  60,
                  71,
                  72,
                  95,
                  96,
                  119,
                  120,
                  167,
                  168,
                  fps * 8 - 1,
                ]
              : settings.schemaVersion === "reusable-demo-2"
                ? [
                    0,
                    fps - 1,
                    fps,
                    fps * 2,
                    71,
                    72,
                    73,
                    fps * 7,
                    fps * 7 + 1,
                    fps * 8 - 1,
                  ]
                : [0, 12, Math.floor(fps * 2.5), fps * 4, fps * 8 - 1];
          for (const frame of frames) {
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
              : "; source bundle, encode and boundary parity samples passed"),
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
    if (
      (!process.argv.includes("--smoke-only") ||
        process.argv.includes("--ui-export")) &&
      !isolatedOnly
    )
      for (const mode of ["commerce", "story"]) {
        await page.goto(
          origin +
            "reusable-components.html?mode=" +
            mode +
            "&example=" +
            (timingOnly ? "detail-sequence" : "tour"),
        );
        await ready();
        const exported = page.waitForEvent("download", { timeout: 180000 });
        await page.locator("#export").click();
        await (
          await exported
        ).saveAs(
          join(
            output,
            mode + (timingOnly ? "-timing-ui-export.mp4" : "-ui-export.mp4"),
          ),
        );
        const { stdout } = await run("ffprobe", [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=nb_frames",
          "-of",
          "csv=p=0",
          join(
            output,
            mode + (timingOnly ? "-timing-ui-export.mp4" : "-ui-export.mp4"),
          ),
        ]);
        assert.equal(Number(stdout.trim()), 192);
      }
    await page.goto(
      origin + "reusable-components.html?mode=commerce&example=tour",
    );
    await ready();
    await seek(0);
    const tourBefore = await canvas();
    await page.locator('[name="middleText"]').fill("X".repeat(120));
    await apply();
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes("preserved"),
    );
    assert.equal(
      await canvas(),
      tourBefore,
      "every authored caption is measured before accepting a state edit",
    );
    await page.locator('[name="middleText"]').fill("Second marker");
    await page.locator('[name="cutFrame"]').fill("200");
    await apply();
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes("preserved"),
    );
    assert.equal(await canvas(), tourBefore);
    assert.equal(await page.locator("#export").isDisabled(), true);
    await page.locator('[name="cutFrame"]').fill("96");
    await page.locator('[name="rotation"]').fill("-120");
    await page.locator('[name="travelFrom"]').fill("1");
    await page.locator('[name="travelTo"]').fill("0");
    await page.locator('[name="middleText"]').fill("Supplied detail");
    await apply();
    await ready();
    const tourEdited = await canvas();
    assert.notEqual(tourEdited, tourBefore);
    const tourSaved = page.waitForEvent("download");
    await page.locator("#save").click();
    const tourSettings = join(temp, "tour.demo.json");
    await (await tourSaved).saveAs(tourSettings);
    await page.locator('[name="rotation"]').fill("12");
    await apply();
    await ready();
    await page.locator("#load").setInputFiles(tourSettings);
    await ready();
    assert.equal(
      await canvas(),
      tourEdited,
      "v2 settings reload restores pixels",
    );
    await page.screenshot({
      path: join(output, "behavior-gallery-desktop.png"),
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
      path: join(output, "behavior-gallery-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      origin + "reusable-components.html?mode=story&example=supply-sequence",
    );
    await ready();
    await seek(90);
    const timingBefore = await canvas();
    await page.locator('[name="clipDuration"]').fill("12");
    await apply();
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes("preserved"),
    );
    assert.equal(await canvas(), timingBefore);
    assert.equal(await page.locator("#export").isDisabled(), true);
    await page.locator('[name="clipDuration"]').fill("48");
    await page.locator('[name="minSize"]').fill("60");
    await apply();
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes("preserved"),
    );
    assert.equal(await canvas(), timingBefore);
    await page.locator('[name="minSize"]').fill("32");
    await page.locator('[name="anchorX"]').fill("50");
    await page.locator('[name="invert"]').selectOption("true");
    await apply();
    await ready();
    const timingEdited = await canvas();
    assert.notEqual(timingEdited, timingBefore);
    const timingSaved = page.waitForEvent("download");
    await page.locator("#save").click();
    const timingSettings = join(temp, "timing.demo.json");
    await (await timingSaved).saveAs(timingSettings);
    await page.locator('[name="invert"]').selectOption("false");
    await apply();
    await ready();
    await page.locator("#load").setInputFiles(timingSettings);
    await ready();
    assert.equal(await canvas(), timingEdited, "v3 settings restore pixels");
    await page.screenshot({
      path: join(output, "timing-gallery-desktop.png"),
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
      path: join(output, "timing-gallery-mobile.png"),
      fullPage: true,
    });
  } else await page.goto(origin + "reusable-components.html");
  assert.deepEqual(errors, []);
  const exposure = await verifyReusableExposure(page, resolve("."));
  const behaviors = await verifyBehaviorPixels(page, resolve("."));
  const timing = await verifyTimingPixels(page, resolve("."));
  await writeFile(
    join(
      output,
      timingOnly
        ? "timing-verification.json"
        : pixelsOnly
          ? "behavior-pixels.json"
          : process.argv.includes("--smoke-only")
            ? "smoke.json"
            : storyOnly && behaviorsOnly
              ? "story-behaviors-verification.json"
              : isolatedOnly
                ? "isolated-verification.json"
                : "verification.json",
    ),
    JSON.stringify(
      {
        examples: pixelsOnly ? 0 : modes.length * examples.length,
        clocks: [24, 30],
        errors,
        exposure,
        behaviors,
        timing,
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
