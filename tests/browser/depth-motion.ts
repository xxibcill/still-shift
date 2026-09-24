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
  await racePage.close();

  process.stdout.write(
    `Depth motion verified: far ${farTravel}px, near ${nearTravel}px; latest selection preserved\n`,
  );
} finally {
  await browser?.close();
  await server?.close();
}
