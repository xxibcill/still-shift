import assert from "node:assert/strict";

import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import {
  estimateDepthSubject,
  focusCropWindow,
} from "../../packages/renderer-core/src/depth-reframe.ts";

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
const focalDepthSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="256" height="256" fill="rgb(32,32,32)"/>
  <rect x="170" y="65" width="70" height="110" fill="rgb(240,240,240)"/>
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

const ready = (page: Page) =>
  page.waitForFunction(
    () =>
      document.querySelector("#status")?.textContent?.includes("ready") &&
      document.querySelector("#preview-stage")?.getAttribute("aria-busy") ===
        "false",
  );

type DepthRefreshWindow = Window & {
  depthRefresh: { started: boolean; release: () => void };
};

async function holdDepthRefresh(page: Page) {
  await page.evaluate(() => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const state = { started: false, release };
    (window as unknown as DepthRefreshWindow).depthRefresh = state;
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      HTMLImageElement.prototype.decode = decode;
      state.started = true;
      await decode.call(this);
      await blocked;
    };
  });
}

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
  const initialParameters = JSON.parse(
    (await page.locator("#parameters").textContent()) ?? "{}",
  );
  assert.match(initialParameters.rendererVersion, /^composition-webgl2-/);
  const first = await measureMarkers(page);
  await page.locator("#output-format").selectOption("vertical");
  await page.locator("#focus-mode").selectOption("manual");
  await page.locator("#focus-x").fill("0.75");
  await page.locator("#focus-x").press("Tab");
  await ready(page);
  assert.deepEqual(
    await page
      .locator("#preview")
      .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
    [1080, 1920],
  );
  const reframed = await measureMarkers(page);
  assert.ok(Number.isNaN(reframed.red) && Number.isFinite(reframed.green));
  await holdDepthRefresh(page);
  await page.locator("#output-format").selectOption("landscape");
  await page.waitForFunction(
    () => (window as unknown as DepthRefreshWindow).depthRefresh.started,
  );
  assert.equal(
    await page.locator("#preview-stage").getAttribute("aria-busy"),
    "true",
  );
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#frame");
    if (!slider) throw new Error("Frame slider is missing");
    slider.value = slider.max;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() =>
    (window as unknown as DepthRefreshWindow).depthRefresh.release(),
  );
  await ready(page);
  assert.equal(
    await page.locator("#frame").inputValue(),
    await page.locator("#frame").getAttribute("max"),
    "A seek during preparation must survive the committed refresh",
  );
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
  await ready(page);
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

  await page.locator("#preset").selectOption("panel_reveal");
  await page.locator("#local-depth").setInputFiles([]);
  await page.locator("#load-local").click();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("ready"),
  );
  const flatParameters = JSON.parse(
    (await page.locator("#parameters").textContent()) ?? "{}",
  );
  assert.equal(flatParameters.motion.mode, "flat_2d");
  const revealFirst = await measureMarkers(page);
  assert.ok(
    Number.isNaN(revealFirst.red) && Number.isNaN(revealFirst.green),
    "The panel reveal must begin with the source concealed",
  );
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#frame")!;
    slider.value = "20";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const revealHeld = await measureMarkers(page);
  assert.ok(
    Number.isFinite(revealHeld.red) && Number.isFinite(revealHeld.green),
    "The panel reveal must show the whole source after its opening beat",
  );

  await page.locator("#preset").selectOption("comparison_step");
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#frame")!;
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const comparisonFirst = await measureMarkers(page);
  assert.ok(
    Number.isFinite(comparisonFirst.red) && Number.isNaN(comparisonFirst.green),
    "The comparison must hold the left panel while concealing the right",
  );
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#frame")!;
    slider.value = "70";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const comparisonHeld = await measureMarkers(page);
  assert.ok(
    Number.isFinite(comparisonHeld.red) &&
      Number.isFinite(comparisonHeld.green),
    "The comparison must reveal the right panel and hold both",
  );

  await page.locator("#preset").selectOption("locked_hold");
  const holdLast = await measureMarkers(page);
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#frame")!;
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const holdFirst = await measureMarkers(page);
  assert.deepEqual(
    holdFirst,
    holdLast,
    "A locked hold must not move the image",
  );
  await page.locator("#preset").selectOption("slow_push");
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

  const focalPixels = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++)
      focalPixels[(y * 256 + x) * 4] =
        x >= 170 && x < 240 && y >= 65 && y < 175 ? 240 : 32;
  const expectedSubject = estimateDepthSubject(256, 256, focalPixels);
  assert.ok(expectedSubject);
  const expectedCrop = focusCropWindow(
    256,
    256,
    1080,
    1920,
    expectedSubject.focus,
  );
  await page.locator("#local-depth").setInputFiles({
    name: "focal-depth.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(focalDepthSvg),
  });
  await page.locator("#output-format").selectOption("vertical");
  await page.locator("#focus-mode").selectOption("auto");
  await page.locator("#load-local").click();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("ready"),
  );
  const autoParameters = JSON.parse(
    (await page.locator("#parameters").textContent()) ?? "{}",
  ) as {
    framing: {
      source: string;
      focus: [number, number];
      crop: { x: number; y: number; width: number; height: number };
    };
  };
  assert.equal(autoParameters.framing.source, "depth-estimate");
  assert.ok(
    Math.abs(autoParameters.framing.focus[0] - expectedSubject.focus[0]) <
      0.005,
  );
  assert.ok(
    Math.abs(autoParameters.framing.focus[1] - expectedSubject.focus[1]) <
      0.005,
  );
  assert.ok(Math.abs(autoParameters.framing.crop.x - expectedCrop.x) < 0.005);
  assert.ok(
    Math.abs(autoParameters.framing.crop.width - expectedCrop.width) < 0.005,
  );
  await page.locator("#focus-mode").selectOption("manual");
  await page.locator("#focus-x").fill("0.2");
  await page.locator("#focus-x").press("Tab");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.includes("subject exceeds the vertical crop"),
  );
  await page.locator("#focus-mode").selectOption("auto");
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("ready"),
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
      const edgePreview = await createWebGLPreview(
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
      ?.textContent?.includes("6/6 preview frames generated"),
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
  ) as {
    motion: { preset: string; intensity: string; seed: number };
    warnings: { code: string }[];
  };
  assert.deepEqual(
    {
      preset: selectedScene.motion.preset,
      intensity: selectedScene.motion.intensity,
      seed: selectedScene.motion.seed,
    },
    { preset: "cinematic_float", intensity: "standard", seed: 19 },
  );
  assert.ok(
    selectedScene.warnings.some(
      (warning) => warning.code === "INTENSITY_DOWNGRADED",
    ),
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
