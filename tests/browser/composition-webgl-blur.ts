import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Browser, Page } from "playwright";
import { createServer } from "vite";
import {
  StorySceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import { compileStoryComposition } from "@still-shift/animation-engine";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import type * as Blur from "../helpers/composition-webgl-blur.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import {
  compareFrames,
  meetsTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";
import { primitiveBlurVariants } from "../helpers/composition-primitive-blur.ts";

async function checkEditorialPreview(origin: string, hardware: Browser) {
  const path = resolve("benchmarks/fixtures/typography/editorial.json");
  const source = StorySceneSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  const variant = primitiveBlurVariants("typography/editorial", source)[0]!;
  const composition = await compileStoryComposition(
    variant.scene,
    dirname(path),
  );
  const urls = Object.fromEntries(
    composition.assets.map((asset) => [
      asset.id,
      new URL(`/@fs${resolve(dirname(path), asset.path)}`, origin).href,
    ]),
  );
  const pinned = await launchRenderBrowser({ profile: "pinned" });
  try {
    const reference = await pinned.newPage(),
      actual = await hardware.newPage();
    for (const page of [reference, actual]) {
      await page.addInitScript("window.__name = (fn) => fn;");
      await page.goto(origin);
    }
    for (const backend of ["canvas2d", "webgl2"] as const)
      for (const frame of [0, 3, 40, 70, 80, 120, 150]) {
        const expected = await readFrame(
          reference,
          composition,
          urls,
          backend,
          frame,
        );
        const rendered = await readFrame(
          actual,
          composition,
          urls,
          backend,
          frame,
        );
        const compared = compareFrames(
          expected,
          rendered,
          composition.width,
          composition.height,
        );
        assert.ok(
          meetsTier(compared, "perceptual"),
          `${variant.id} ${backend} frame ${frame}: ${JSON.stringify(compared)}`,
        );
        console.log("Editorial hardware blur:", {
          backend,
          frame,
          ...compared,
        });
      }
    await actual.close();
  } finally {
    await pinned.close();
  }
}

async function readFrame(
  page: Page,
  composition: Composition,
  urls: Record<string, string>,
  backend: "canvas2d" | "webgl2",
  frame: number,
) {
  const encoded = await page.evaluate(
    async ({ compositionJson, urls, backend, frame }) => {
      const composition = JSON.parse(compositionJson) as Composition;
      const moduleUrl = "/packages/renderer-core/src/index.ts";
      const m = (await import(moduleUrl)) as typeof Render;
      const cache = window as unknown as {
        blurResources?: Render.CompositionResources;
      };
      cache.blurResources ??= await m.loadCompositionResources(
        composition,
        (id) => urls[id]!,
      );
      // A fresh canvas keeps the hardware raster active instead of triggering
      // Chromium's repeated-readback migration to CPU Canvas.
      const preview = m.createCompositionPreview(
        document.createElement("canvas"),
        composition,
        cache.blurResources,
        { backend },
      );
      try {
        const report = preview.renderFrame(frame);
        if (
          report.diagnostics.some(
            (diagnostic) => diagnostic.severity === "error",
          )
        )
          throw new Error(JSON.stringify(report.diagnostics));
        const bytes = preview.readPixels();
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000)
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
          );
        return btoa(binary);
      } finally {
        preview.dispose();
      }
    },
    { compositionJson: JSON.stringify(composition), urls, backend, frame },
  );
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

const profile = process.argv.includes("--hardware") ? "hardware" : "pinned";
const server = await createServer({
  root: resolve(import.meta.dirname, "../.."),
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await launchRenderBrowser({ profile });
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  console.log(
    "Primitive blur environment:",
    await probeRenderEnvironment(page, profile),
  );
  const results = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-blur.ts";
    return ((await import(url)) as typeof Blur).checkWebglPrimitiveBlur();
  });
  console.log("WebGL primitive blur raster parity:", results);
  if (profile === "hardware") {
    const environment = await probeRenderEnvironment(page, profile);
    assert.doesNotMatch(environment.webglRenderer, /swiftshader|software/i);
    await checkEditorialPreview(server.resolvedUrls!.local[0]!, browser);
  }
} finally {
  await browser.close();
  await server.close();
}
