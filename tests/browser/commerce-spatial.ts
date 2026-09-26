import { verifyCommerceSpatialPixels } from "./commerce-spatial-pixels.ts";

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import { SPATIAL_DEMOS } from "../../packages/scene-contract/src/commerce-spatial-demos.ts";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
const run = promisify(execFile);
const output = resolve("benchmarks/results/ecommerce-motion/spatial");
await mkdir(output, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), "commerce-spatial-"));
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1560, height: 1050 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const origin = server.resolvedUrls!.local[0]!;
const ready = () =>
  page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes(" ready ·"),
  );
const seek = (frame: number) =>
  page.evaluate((value) => {
    const input = document.querySelector<HTMLInputElement>("#scrub")!;
    input.value = String(value);
    const start = performance.now();
    input.dispatchEvent(new Event("input"));
    return {
      png: document
        .querySelector<HTMLCanvasElement>("#commerce-preview")!
        .toDataURL()
        .split(",")[1]!,
      baseline: document
        .querySelector<HTMLCanvasElement>("#baseline-preview")!
        .toDataURL()
        .split(",")[1]!,
      milliseconds: performance.now() - start,
    };
  }, frame);
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
        "scale=96:96:flags=bicubic",
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
const demos = process.argv.includes("--pixels-only") ? [] : SPATIAL_DEMOS;
try {
  for (const demo of demos) {
    await page.goto(origin + "commerce-components.html?demo=" + demo.id);
    await ready();
    const frame = Number(await page.locator("#scrub").inputValue());
    const shot = await seek(frame);
    await seek(0);
    await seek(239);
    assert.equal((await seek(frame)).png, shot.png, demo.id + " random seek");
    await writeFile(
      join(output, demo.id + ".png"),
      Buffer.from(shot.png, "base64"),
    );
    await page.locator("#duration").fill("4");
    await page.locator("#fps").selectOption("24");
    await page.locator("#update").click();
    await ready();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#download").click(),
    ]);
    const zip = join(temp, demo.id + ".zip"),
      bundle = join(temp, demo.id);
    await download.saveAs(zip);
    await mkdir(bundle);
    await run("unzip", ["-q", zip, "-d", bundle]);
    const scene = CommerceSceneSchema.parse(
      JSON.parse(await readFile(join(bundle, "scene.json"), "utf8")),
    );
    assert.equal(scene.metadata.registration.status, "experimental");
    assert.ok(scene.geometry?.length);
    assert.equal(scene.fps, 24);
    for (const asset of [...scene.assets, ...scene.fonts])
      assert.equal(
        "sha256:" +
          createHash("sha256")
            .update(await readFile(join(bundle, asset.path)))
            .digest("hex"),
        asset.sha256,
      );
    const video = join(output, demo.id + ".mp4");
    for (const suffix of ["", ".scene.json", ".result.json"])
      await rm(video + suffix, { force: true });
    const started = performance.now();
    await new PreparedAnimationEngine().animate({
      scenePath: join(bundle, "scene.json"),
      outputPath: video,
    });
    const parity = [];
    for (const index of [0, 10, 24, 48, 95]) {
      const path = join(temp, demo.id + "-" + index + ".png");
      await writeFile(path, Buffer.from((await seek(index)).png, "base64"));
      const score = compareFrameSamples(
        await rgb(path),
        await rgb(video, index),
        96,
        96,
      );
      assert.equal(
        score.warning,
        null,
        demo.id + " parity " + index + ": " + JSON.stringify(score),
      );
      parity.push({ frame: index, ...score });
    }
    evidence.push({
      demo: demo.id,
      previewMilliseconds: shot.milliseconds,
      exportMilliseconds: performance.now() - started,
      parity,
    });
    console.log(
      demo.id + ": random seek, 24fps bundle/export, five parity frames passed",
    );
  }
  await page.goto(origin + "commerce-components.html?demo=attachment");
  await ready();

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
  const pixels = await verifyCommerceSpatialPixels(page, resolve("."));
  await page.goto(origin + "commerce-components.html?demo=layout");
  await ready();
  for (const profile of ["feed", "square", "portrait"])
    for (const locale of ["en", "th"]) {
      await page.locator("#layout-profile").selectOption(profile);
      await page.locator("#locale").selectOption(locale);
      const copy =
        locale === "th"
          ? "รายละเอียดที่มองเห็นได้\nดูสินค้าอย่างใกล้ชิด"
          : "SAMPLE 01.\nA considered daily ritual.";
      await page.locator("#demo-text").fill(copy);
      assert.equal(await page.locator("#export").isDisabled(), true);
      await page.locator("#update").click();
      await ready();
      const dimensions = await page
        .locator("#commerce-preview")
        .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]);
      assert.deepEqual(
        dimensions,
        profile === "portrait"
          ? [1080, 1920]
          : profile === "square"
            ? [1080, 1080]
            : [1080, 1350],
      );
      await writeFile(
        join(output, "layout-" + profile + "-" + locale + ".png"),
        Buffer.from((await seek(0)).png, "base64"),
      );
    }
  await page.locator("#demo-text").fill("X".repeat(500));
  await page.locator("#update").click();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("minimum size"),
  );
  assert.equal(await page.locator("#export").isDisabled(), true);
  await page.goto(origin + "commerce-components.html?demo=attachment");
  await ready();
  await page.locator("#anchor-y").fill("0.5");
  await page.locator("#update").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.includes("protected product region"),
  );
  assert.equal(await page.locator("#export").isDisabled(), true);

  assert.deepEqual(errors, []);
  await writeFile(
    join(
      output,
      process.argv.includes("--pixels-only")
        ? "pixel-verification.json"
        : "verification.json",
    ),
    JSON.stringify(
      {
        demos: demos.length,
        parityFrames: demos.length * 5,
        pixels,
        errors,
        evidence,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await server.close();
  await rm(temp, { recursive: true, force: true });
}
