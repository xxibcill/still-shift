import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import type { Browser, Page } from "playwright";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import {
  compareFrames,
  meetsTier,
  strictestTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "@still-shift/scene-contract";

/** Fresh contexts keep hardware Canvas from migrating after repeated readbacks. */
export async function shapeHardwarePreview(
  root: string,
  fixtures: readonly (readonly [string, Composition])[],
) {
  const cache = await mkdtemp(join(tmpdir(), "native-shape-hardware-")),
    server = await createServer({
      root,
      cacheDir: cache,
      configFile: false,
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0 },
    });
  const sessions: {
    browser: Browser;
    page: Page;
    environment: Awaited<ReturnType<typeof probeRenderEnvironment>>;
  }[] = [];
  try {
    await server.listen();
    for (const profile of ["pinned", "hardware"] as const) {
      const browser = await launchRenderBrowser({ profile }),
        page = await browser.newPage();
      await page.addInitScript("window.__name=(fn)=>fn;");
      await page.goto(server.resolvedUrls!.local[0]!);
      sessions.push({
        browser,
        page,
        environment: await probeRenderEnvironment(page, profile),
      });
    }
    assert.doesNotMatch(
      sessions[1]!.environment.webglRenderer,
      /SwiftShader/,
      "Hardware acceptance requires an actual hardware renderer",
    );
    const reports = [];
    for (const [fixture, doc] of fixtures)
      for (const backend of ["canvas2d", "webgl2"] as const)
        for (const frame of [
          0,
          Math.floor(doc.frameCount / 2),
          doc.frameCount - 1,
        ]) {
          const pixels: Buffer[] = [];
          for (const { page } of sessions) {
            const encoded = await page.evaluate(
              async ({
                json,
                backend,
                frame,
              }: {
                json: string;
                backend: "canvas2d" | "webgl2";
                frame: number;
              }) => {
                const url = "/packages/renderer-core/src/index.ts",
                  m = (await import(url)) as typeof Render,
                  preview = m.createCompositionPreview(
                    document.createElement("canvas"),
                    JSON.parse(json),
                    { images: new Map(), fonts: new Map() },
                    { backend },
                  );
                try {
                  preview.renderFrame(frame);
                  const bytes = preview.readPixels();
                  let binary = "";
                  for (let i = 0; i < bytes.length; i += 0x8000)
                    binary += String.fromCharCode(
                      ...bytes.subarray(i, i + 0x8000),
                    );
                  return btoa(binary);
                } finally {
                  preview.dispose();
                }
              },
              { json: JSON.stringify(doc), backend, frame },
            );
            pixels.push(Buffer.from(encoded, "base64"));
          }
          const metrics = compareFrames(
            new Uint8ClampedArray(pixels[0]!),
            new Uint8ClampedArray(pixels[1]!),
            doc.width,
            doc.height,
          );
          assert(
            meetsTier(metrics, "perceptual"),
            `${fixture}/${backend}/${frame}: hardware ${JSON.stringify(metrics)}`,
          );
          reports.push({
            fixture,
            backend,
            frame,
            tier: strictestTier(metrics),
            maxDelta: metrics.maxChannelDelta,
            psnr: Number.isFinite(metrics.psnr) ? metrics.psnr : 999,
            ssim: metrics.ssim,
          });
        }
    return {
      environments: sessions.map((session) => session.environment),
      tier: "unchanged perceptual hardware policy",
      comparisons: reports.length,
      reports,
    };
  } finally {
    for (const { browser } of sessions) await browser.close();
    await server.close();
    await rm(cache, { recursive: true, force: true });
  }
}
