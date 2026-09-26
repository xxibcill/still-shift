import { verifyCommerceEffectPixels } from "./commerce-effect-pixels.ts";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import { EFFECT_DEMOS } from "../../packages/scene-contract/src/commerce-effects.ts";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
const run = promisify(execFile);
const output = resolve("benchmarks/results/ecommerce-motion/effects");
await mkdir(output, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), "commerce-effects-"));
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
const demos = process.argv.includes("--pixels-only") ? [] : EFFECT_DEMOS;
try {
  for (const demo of demos) {
    await page.goto(origin + "commerce-components.html?demo=" + demo.id);
    await ready();
    await page.locator("#compare").check();
    const frame = Number(await page.locator("#scrub").inputValue());
    const shot = await seek(frame);
    assert.notEqual(
      shot.png,
      shot.baseline,
      demo.id + " must visibly differ from baseline",
    );
    await seek(200);
    assert.equal((await seek(frame)).png, shot.png, demo.id + " random seek");
    await writeFile(
      join(output, demo.id + ".png"),
      Buffer.from(shot.png, "base64"),
    );
    await page.locator("#effect-enabled").uncheck();
    assert.equal(await page.locator("#export").isDisabled(), true);
    await page.locator("#update").click();
    await ready();
    const off = await seek(frame);
    assert.equal(off.png, off.baseline, demo.id + " disabled parity");
    await page.locator("#effect-enabled").check();
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
    assert.ok(scene.effects?.length);
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
      demo.id +
        ": baseline toggle, random seek, 24fps bundle/export, five parity frames passed",
    );
  }
  await page.goto(origin + "commerce-components.html?demo=effects-studio");
  await ready();
  await page.locator("#compare").check();
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
  const pixels = await verifyCommerceEffectPixels(page, resolve("."));
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
