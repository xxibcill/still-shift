import { chromium, type Page } from "playwright";
import { describe, expect, it } from "vitest";

import {
  launchRenderBrowser,
  probeRenderEnvironment,
} from "../../packages/execution-runtime/src/render-browser.ts";

const exportRaster = async (page: Page) => {
  const pixels = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d", { alpha: false })!;
    const gradient = context.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, "#e8dfc9");
    gradient.addColorStop(1, "#2b4a3a");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 512);
    context.filter = "blur(3px)";
    context.globalCompositeOperation = "multiply";
    context.fillStyle = "#c05a3c";
    context.beginPath();
    context.arc(170, 162, 120, 0, Math.PI * 2);
    context.fill();
    context.filter = "none";
    context.globalCompositeOperation = "screen";
    context.setTransform(0.94, 0.21, -0.21, 0.94, 30, -8);
    context.fillStyle = "rgba(40, 90, 200, 0.55)";
    context.fillRect(180, 130, 170, 140);
    const bytes = context.getImageData(0, 0, 512, 512).data;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(pixels, "base64");
};

describe("render environment raster probe", () => {
  it("reproduces the pinned fingerprint across fresh canvases", async () => {
    const browser = await launchRenderBrowser();
    try {
      const page = await browser.newPage();
      expect(await probeRenderEnvironment(page)).toEqual(
        await probeRenderEnvironment(page),
      );
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("distinguishes Canvas raster paths with the same WebGL renderer", async (context) => {
    const pinned = await launchRenderBrowser();
    let angle: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      angle = await chromium.launch({
        headless: true,
        args: [
          "--use-angle=swiftshader",
          "--use-gl=angle",
          "--enable-unsafe-swiftshader",
        ],
      });
      const pinnedPage = await pinned.newPage();
      const anglePage = await angle.newPage();
      const pinnedEnvironment = await probeRenderEnvironment(pinnedPage);
      const angleEnvironment = await probeRenderEnvironment(anglePage);
      expect(angleEnvironment.webglRenderer).toBe(
        pinnedEnvironment.webglRenderer,
      );
      const pinnedPixels = await exportRaster(pinnedPage);
      const anglePixels = await exportRaster(anglePage);
      // Some environments cannot enable the alternate Canvas raster path.
      if (pinnedPixels.equals(anglePixels)) context.skip();
      expect(angleEnvironment.rasterFingerprint).not.toBe(
        pinnedEnvironment.rasterFingerprint,
      );
    } finally {
      await angle?.close();
      await pinned.close();
    }
  }, 30_000);
});
