import assert from "node:assert/strict";

import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="256" height="256" fill="black"/>
  <rect x="62" width="4" height="256" fill="red"/>
  <rect x="190" width="4" height="256" fill="lime"/>
</svg>`;
const depthSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="128" height="256" fill="rgb(32,32,32)"/>
  <rect x="128" width="128" height="256" fill="rgb(224,224,224)"/>
</svg>`;
const flatDepthSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="256" height="256" fill="rgb(128,128,128)"/>
</svg>`;

const measureMarkers = async (
  page: Page,
): Promise<{ red: number; green: number }> =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#preview");
    if (!canvas) throw new Error("Preview canvas is missing");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 is unavailable");
    const pixels = new Uint8Array(canvas.width * 4);
    gl.readPixels(
      0,
      canvas.height / 2,
      canvas.width,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    let redSum = 0;
    let redCount = 0;
    let greenSum = 0;
    let greenCount = 0;
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = x * 4;
      if (pixels[offset]! > 180 && pixels[offset + 1]! < 80) {
        redSum += x;
        redCount += 1;
      }
      if (pixels[offset + 1]! > 180 && pixels[offset]! < 80) {
        greenSum += x;
        greenCount += 1;
      }
    }
    return { red: redSum / redCount, green: greenSum / greenCount };
  });

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
try {
  server = await createServer({
    configFile: new URL("../../apps/lab/vite.config.ts", import.meta.url)
      .pathname,
    server: { port: 4176, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4176/");
  await page.locator("#local-source").setInputFiles({
    name: "source.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(sourceSvg),
  });
  await page.locator("#local-depth").setInputFiles({
    name: "depth.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(depthSvg),
  });
  await page.locator("#load-local").click();
  await page.waitForFunction(
    () => document.querySelector("#status")?.textContent?.includes("ready"),
    null,
    { timeout: 15_000 },
  );
  const first = await measureMarkers(page);
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#frame");
    if (!slider) throw new Error("Frame slider is missing");
    slider.value = slider.max;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const last = await measureMarkers(page);
  const farTravel = first.red - last.red;
  const nearTravel = last.green - first.green;
  assert.deepEqual(errors, []);
  assert.ok(
    Number.isFinite(farTravel) && farTravel > 3,
    "Far marker must move",
  );
  assert.ok(
    Number.isFinite(nearTravel) && nearTravel - farTravel > 2,
    "Near marker must move farther than the far marker",
  );

  await page.locator("#preset").selectOption("horizontal_drift");
  const driftLast = await measureMarkers(page);
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#frame");
    if (!slider) throw new Error("Frame slider is missing");
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const driftFirst = await measureMarkers(page);
  const averageDrift =
    (driftLast.red + driftLast.green - driftFirst.red - driftFirst.green) / 2;
  assert.ok(averageDrift > 4, "Horizontal drift must move the image laterally");

  await page.locator("#local-depth").setInputFiles({
    name: "flat-depth.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(flatDepthSvg),
  });
  await page.locator("#load-local").click();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("ready"),
  );
  const fallbackParameters = JSON.parse(
    (await page.locator("#parameters").textContent()) ?? "{}",
  );
  assert.equal(fallbackParameters.motion.mode, "fallback_2d");
  assert.equal(fallbackParameters.quality.fallbackReason, "DEPTH_RANGE_FLAT");
  const fallbackFirst = await measureMarkers(page);
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#frame");
    if (!slider) throw new Error("Frame slider is missing");
    slider.value = slider.max;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const fallbackLast = await measureMarkers(page);
  assert.ok(
    Number.isFinite(fallbackLast.green - fallbackFirst.green) &&
      fallbackLast.green - fallbackFirst.green > 2,
    "Flat depth must still produce a valid moving 2D preview",
  );

  await page.locator("#local-depth").setInputFiles([]);
  await page.locator("#load-local").click();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("ready"),
  );
  const sourceOnlyParameters = JSON.parse(
    (await page.locator("#parameters").textContent()) ?? "{}",
  );
  assert.equal(sourceOnlyParameters.motion.mode, "fallback_2d");
  assert.equal(
    sourceOnlyParameters.quality.fallbackReason,
    "DEPTH_PREPARATION_FAILED",
  );
  assert.equal(await page.locator("#depth-image").isHidden(), true);

  await page.locator("#local-depth").setInputFiles({
    name: "invalid-depth.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a PNG"),
  });
  await page.locator("#load-local").click();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("ready"),
  );
  const invalidDepthParameters = JSON.parse(
    (await page.locator("#parameters").textContent()) ?? "{}",
  );
  assert.equal(
    invalidDepthParameters.quality.fallbackReason,
    "DEPTH_PREPARATION_FAILED",
  );

  const rendererModuleUrl =
    "/@fs" +
    new URL("../../packages/renderer-core/src/index.ts", import.meta.url)
      .pathname;
  const edgeDampingChangedBytes = await page.evaluate(async (moduleUrl) => {
    const { createWebGLPreview, resolvePreviewScene } = await import(moduleUrl);
    const source = new Image();
    source.src =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><pattern id="stripes" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="4" fill="black"/></pattern></defs><rect width="1600" height="900" fill="white"/><rect width="1600" height="900" fill="url(#stripes)"/></svg>',
      );
    const depth = new Image();
    depth.src =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="black"/><rect x="405" width="1195" height="900" fill="white"/></svg>',
      );
    await Promise.all([source.decode(), depth.decode()]);

    const rows: Uint8Array[] = [];
    for (const preset of ["slow_push", "horizontal_drift"] as const) {
      const edgeCanvas = document.createElement("canvas");
      edgeCanvas.width = 1920;
      edgeCanvas.height = 1080;
      const edgeScene = resolvePreviewScene({
        sourceWidth: 1600,
        sourceHeight: 900,
        depthWidth: 1600,
        depthHeight: 900,
        canvasWidth: 1920,
        canvasHeight: 1080,
        durationMs: 5000,
        fps: 30,
        preset,
        intensity: "subtle",
        requestedTravel: 0,
        requestedDepthStrength: 0.03,
        requestedLateralTravel: 0,
      });
      const edgePreview = createWebGLPreview(
        edgeCanvas,
        edgeScene,
        source,
        depth,
      );
      edgePreview.renderFrame(edgeScene.timeline.frameCount - 1);
      const gl = edgeCanvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL2 is unavailable");
      const pixels = new Uint8Array(edgeCanvas.width * 4);
      gl.readPixels(
        0,
        edgeCanvas.height / 2,
        edgeCanvas.width,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      rows.push(pixels);
      edgePreview.dispose();
    }
    let changedBytes = 0;
    for (let index = 0; index < rows[0]!.length; index += 1) {
      if (rows[0]![index] !== rows[1]![index]) changedBytes += 1;
    }
    return changedBytes;
  }, rendererModuleUrl);
  assert.ok(
    edgeDampingChangedBytes > 10,
    "A sharp edge between mesh vertices must trigger depth damping",
  );

  const racePage = await browser.newPage();
  const sourceUrl = `data:image/svg+xml;base64,${Buffer.from(sourceSvg).toString("base64")}`;
  const depthUrl = `data:image/svg+xml;base64,${Buffer.from(depthSvg).toString("base64")}`;
  const requestGate = () => {
    let markRequested!: () => void;
    let release!: () => void;
    return {
      requested: new Promise<void>((resolve) => {
        markRequested = resolve;
      }),
      blocked: new Promise<void>((resolve) => {
        release = resolve;
      }),
      markRequested: () => markRequested(),
      release: () => release(),
    };
  };
  const firstGate = requestGate();
  const secondGate = requestGate();
  await racePage.route("**/api/corpus", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "frozen",
        entries: [
          {
            id: "first",
            categories: ["portrait_person"],
            expectedShotDurationMs: 5000,
          },
          {
            id: "second",
            categories: ["portrait_person"],
            expectedShotDurationMs: 5000,
          },
        ],
      }),
    }),
  );
  await racePage.route("**/api/prepare?*", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("id");
    const gate = id === "first" ? firstGate : secondGate;
    gate.markRequested();
    await gate.blocked;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id,
        sourceUrl,
        depthUrl,
        durationMs: 5000,
        dimensions: { width: 256, height: 256 },
        cacheStatus: "hit",
        model: { id: "test-model" },
      }),
    });
  });
  await racePage.goto("http://127.0.0.1:4176/");
  await racePage.locator("#corpus-entry").selectOption("first");
  await racePage.locator("#prepare").click();
  await firstGate.requested;
  await racePage.locator("#corpus-entry").selectOption("second");
  await racePage.locator("#prepare").click();
  await secondGate.requested;
  secondGate.release();
  await racePage.waitForFunction(
    () => document.querySelector("#scene-name")?.textContent === "second",
  );
  firstGate.release();
  await racePage.waitForLoadState("networkidle");
  assert.equal(await racePage.locator("#scene-name").textContent(), "second");

  await racePage.locator("#intensity").selectOption("strong");
  await racePage.locator("#seed").fill("19");
  await racePage.locator("#build-gallery").click();
  await racePage.waitForFunction(() =>
    document
      .querySelector("#gallery-note")
      ?.textContent?.includes("6/6 midpoint"),
  );
  await racePage.locator("#intensity").selectOption("subtle");
  await racePage.locator("#seed").fill("20");
  await racePage
    .locator(".gallery-item")
    .filter({ hasText: "first · cinematic_float · strong · seed 19" })
    .click();
  await racePage.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("first ready"),
  );
  assert.equal(await racePage.locator("#intensity").inputValue(), "strong");
  assert.equal(await racePage.locator("#seed").inputValue(), "19");
  const selectedScene = JSON.parse(
    (await racePage.locator("#parameters").textContent()) ?? "{}",
  ) as { motion: { preset: string; intensity: string; seed: number } };
  assert.deepEqual(
    {
      preset: selectedScene.motion.preset,
      intensity: selectedScene.motion.intensity,
      seed: selectedScene.motion.seed,
    },
    { preset: "cinematic_float", intensity: "strong", seed: 19 },
  );

  await racePage.locator("#seed").fill("-1");
  await racePage.locator("#build-gallery").click();
  assert.equal(await racePage.locator(".gallery-item").count(), 6);
  assert.match(
    (await racePage.locator("#status").textContent()) ?? "",
    /Motion seed must be an unsigned 32-bit integer/,
  );
  await racePage.close();

  const failedPreparationPage = await browser.newPage();
  await failedPreparationPage.route("**/api/corpus", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "frozen",
        entries: [
          {
            id: "failed-depth",
            categories: ["portrait_person"],
            expectedShotDurationMs: 5000,
          },
        ],
      }),
    }),
  );
  await failedPreparationPage.route("**/api/prepare?*", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Depth model unavailable",
        code: "DEPTH_PREPARATION_FAILED",
        sourceUrl,
        durationMs: 5000,
      }),
    }),
  );
  await failedPreparationPage.goto("http://127.0.0.1:4176/");
  await failedPreparationPage
    .locator("#corpus-entry")
    .selectOption("failed-depth");
  await failedPreparationPage.locator("#prepare").click();
  await failedPreparationPage.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("ready"),
  );
  const failedPreparationParameters = JSON.parse(
    (await failedPreparationPage.locator("#parameters").textContent()) ?? "{}",
  );
  assert.equal(failedPreparationParameters.motion.mode, "fallback_2d");
  assert.equal(
    failedPreparationParameters.quality.fallbackReason,
    "DEPTH_PREPARATION_FAILED",
  );
  await failedPreparationPage.close();

  process.stdout.write(
    `Depth motion verified: far ${farTravel}px, near ${nearTravel}px; latest selection preserved\n`,
  );
} finally {
  await browser?.close();
  await server?.close();
}
