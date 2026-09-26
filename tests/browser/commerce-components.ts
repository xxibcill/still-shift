import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { COMPONENT_DEMOS } from "../../packages/scene-contract/src/commerce-components.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "commerce-components-"));
const output = resolve("benchmarks/results/ecommerce-motion/atoms");
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1080 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const origin = server.resolvedUrls!.local[0]!;
const ready = () =>
  page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes(" ready ·"),
  );
const seek = (frame: number) =>
  page.evaluate((index) => {
    const input = document.querySelector<HTMLInputElement>("#scrub")!;
    input.value = String(index);
    input.dispatchEvent(new Event("input"));
    return document
      .querySelector<HTMLCanvasElement>("#commerce-preview")!
      .toDataURL()
      .split(",")[1]!;
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
try {
  for (const demo of COMPONENT_DEMOS) {
    await page.goto(origin + "commerce-components.html?demo=" + demo.id);
    await ready();
    assert.equal(
      await page.locator(".workspace-heading .support").innerText(),
      "Experimental example",
    );
    const still = await seek(120);
    await seek(10);
    assert.equal(await seek(120), still, demo.id + " backwards seek");
    await writeFile(
      join(output, demo.id + ".png"),
      Buffer.from(still, "base64"),
    );
    assert.equal(await page.locator("#export").isEnabled(), true);
    if (!["studio", "introduction", "callout"].includes(demo.id)) continue;
    const video = join(output, demo.id + ".mp4");
    for (const suffix of ["", ".scene.json", ".result.json"])
      await rm(video + suffix, { force: true });
    await new PreparedAnimationEngine().animate({
      scenePath: resolve(
        "benchmarks/fixtures/ecommerce-motion/atoms",
        demo.id + ".json",
      ),
      outputPath: video,
    });
    const scores = [];
    for (const frame of [0, 30, 60, 120, 239]) {
      const path = join(temporary, demo.id + "-" + frame + ".png");
      await writeFile(path, Buffer.from(await seek(frame), "base64"));
      const score = compareFrameSamples(
        await rgb(path),
        await rgb(video, frame),
        96,
        96,
      );
      assert.equal(
        score.warning,
        null,
        demo.id + " parity at " + frame + ": " + JSON.stringify(score),
      );
      scores.push({ frame, ...score });
    }
    evidence.push({ demo: demo.id, scores });
    console.log(
      demo.id + ": export, five parity frames and backwards seek passed",
    );
  }
  await page.goto(origin + "commerce-components.html?demo=studio");
  await ready();
  const before = await seek(120);
  await page.locator("#shadow-softness").fill("0.6");
  assert.equal(await page.locator("#export").isDisabled(), true);
  await page.locator("#update").click();
  await ready();
  assert.notEqual(await seek(120), before);
  await page.locator("#fps").selectOption("24");
  await page.locator("#update").click();
  await ready();
  assert.equal(await page.locator("#scrub").getAttribute("max"), "191");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#download").click(),
  ]);
  const zip = join(temporary, "studio.zip");
  await download.saveAs(zip);
  const bundle = join(temporary, "bundle");
  await mkdir(bundle);
  await run("unzip", ["-q", zip, "-d", bundle]);
  const scene = CommerceSceneSchema.parse(
    JSON.parse(await readFile(join(bundle, "scene.json"), "utf8")),
  );
  for (const asset of [...scene.assets, ...scene.fonts])
    assert.equal(
      "sha256:" +
        createHash("sha256")
          .update(await readFile(resolve(bundle, asset.path)))
          .digest("hex"),
      asset.sha256,
    );
  const settings = JSON.parse(
    await readFile(join(bundle, "shadow-preparation.json"), "utf8"),
  );
  assert.equal(settings.softness, 0.6);
  assert.equal(scene.metadata.registration.status, "experimental");
  assert.ok(
    (await readFile(join(bundle, "assets/OFL.txt"), "utf8")).includes(
      "SIL OPEN FONT LICENSE",
    ),
  );
  const bundledVideo = join(temporary, "bundle.mp4");
  await new PreparedAnimationEngine().animate({
    scenePath: join(bundle, "scene.json"),
    outputPath: bundledVideo,
  });
  const screenshot = join(temporary, "bundle.png");
  await writeFile(screenshot, Buffer.from(await seek(96), "base64"));
  assert.equal(
    compareFrameSamples(
      await rgb(screenshot),
      await rgb(bundledVideo, 96),
      96,
      96,
    ).warning,
    null,
  );
  const [videoDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    page.locator("#export").click(),
  ]);
  const exported = join(output, "studio-browser-24fps.mp4");
  await videoDownload.saveAs(exported);
  assert.equal(
    compareFrameSamples(await rgb(screenshot), await rgb(exported, 96), 96, 96)
      .warning,
    null,
  );
  console.log(
    "Edited shadow: 24 fps, PNG checksums, bundle reproduction and browser export passed",
  );
  await page.goto(origin + "commerce-components.html?demo=text");
  await ready();
  await page.locator("#locale").selectOption("th");
  await page.locator("#demo-text").fill("เรียบง่าย\nในทุกวัน");
  await page.locator("#update").click();
  await ready();
  await writeFile(
    join(output, "text-thai.png"),
    Buffer.from(await seek(100), "base64"),
  );
  await page.locator("#demo-text").fill("Long supplied words ".repeat(25));
  await page.locator("#update").click();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.classList.contains("error"),
  );
  assert.equal(await page.locator("#export").isDisabled(), true);
  await page.goto(origin + "commerce-components.html?demo=studio");
  await ready();
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
  await page.setViewportSize({ width: 1500, height: 1080 });
  await page.screenshot({
    path: join(output, "gallery-desktop.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, "verification.json"),
    JSON.stringify(
      {
        demos: 12,
        parityFrames: 15,
        editedShadow24fps: true,
        sourceBundle: true,
        thaiText: true,
        overflow: true,
        responsive: true,
        evidence,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Component gallery passed: 12 previews, three composition exports, 15 parity frames, edited shadow bundle, browser export, Thai text, overflow and mobile layout.",
  );
} finally {
  await browser.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
