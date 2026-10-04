import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  fixtures,
  composition,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { lintCompositionFile } from "@still-shift/animation-engine";
import type * as Renderer from "@still-shift/renderer-core";
import type { Composition } from "@still-shift/scene-contract";

const root = resolve(import.meta.dirname, "../..");
const server = await createServer({
  configFile: resolve(root, "apps/lab/vite.config.ts"),
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  const base = server.resolvedUrls!.local[0]!;
  await page.goto(base + "composition.html?scene=ce12/stillness-fail.json");
  await page.waitForFunction(
    () =>
      document.getElementById("status")?.dataset.ready ===
      "ce12/stillness-fail.json",
  );
  assert.match(await page.locator("#lint-summary").innerText(), /errors/);
  await page.locator('#lint-timeline button[aria-label*="frozen-run"]').click();
  assert.equal(await page.locator("#frame").inputValue(), "1");
  await page.locator("#lint").click();
  await page.waitForFunction(() =>
    document
      .getElementById("lint-summary")
      ?.textContent?.includes("pixels and state checked"),
  );
  assert.ok(
    await page
      .locator('#lint-timeline button[aria-label*="frozen-pixels"]')
      .count(),
  );
  console.log(
    "Lab timeline markers seek correctly; rendered pixel findings displayed.",
  );

  for (const [name, pair] of Object.entries(fixtures)) {
    for (const [outcome, comp] of Object.entries(pair)) {
      const nodeReport = analyzeCompositionQuality(comp);
      const browserReport = await page.evaluate(
        async ({ json, moduleUrl }) => {
          const url = moduleUrl;
          const renderer = (await import(url)) as typeof Renderer;
          return renderer.analyzeCompositionQuality(
            JSON.parse(json) as Composition,
          );
        },
        {
          json: JSON.stringify(comp),
          moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
        },
      );
      assert.deepEqual(
        browserReport,
        nodeReport,
        `${name}/${outcome}: Node/browser parity`,
      );
    }
  }
  const motion = composition([
    solid("large", {
      size: [400, 280],
      transform: {
        anchor: [0, 0],
        position: {
          keys: [
            { frame: 0, value: [60, 40] },
            { frame: 89, value: [104.5, 40], interpolation: "linear" },
          ],
        },
      },
    }),
  ]);
  const hidden = composition([
    solid("hidden-motion", {
      transform: {
        position: {
          keys: [
            { frame: 0, value: [60, 80] },
            { frame: 89, value: [104.5, 80], interpolation: "linear" },
          ],
        },
      },
    }),
    solid("opaque-cover", {
      size: [640, 360],
      transform: { anchor: [0, 0], position: [0, 0] },
    }),
  ]);
  for (const backend of ["canvas2d", "webgl2"] as const) {
    for (const [name, comp] of [
      ["motion", motion],
      ["hidden", hidden],
    ] as const) {
      const result = await page.evaluate(
        async ({ json, backend, moduleUrl }) => {
          const url = moduleUrl;
          const renderer = (await import(url)) as typeof Renderer;
          const comp = JSON.parse(json) as Composition;
          const preview = renderer.createCompositionPreview(
            document.createElement("canvas"),
            comp,
            await renderer.loadCompositionResources(comp, () => {
              throw new Error("No assets expected");
            }),
            { backend },
          );
          try {
            return await renderer.analyzeRenderedCompositionQuality(
              comp,
              preview,
            );
          } finally {
            preview.dispose();
          }
        },
        {
          json: JSON.stringify(comp),
          backend,
          moduleUrl: `/@fs/${root}/packages/renderer-core/src/index.ts`,
        },
      );
      assert.equal(result.measured.pixels, true);
      assert.equal(
        result.diagnostics.some((d) => d.code === "frozen-run"),
        false,
      );
      assert.equal(
        result.diagnostics.some((d) => d.code === "frozen-pixels"),
        name === "hidden",
        `${backend}/${name}`,
      );
    }
  }
  const cliPixels = await lintCompositionFile(
    resolve(root, "benchmarks/fixtures/composition/ce12/stillness-fail.json"),
    {},
    { pixels: true },
  );
  assert.equal(cliPixels.measured.pixels, true);
  assert.ok(cliPixels.diagnostics.some((d) => d.code === "frozen-pixels"));
  console.log(
    "14 fixtures have Node/browser parity; independent meaningful pixel motion checks pass on Canvas2D and WebGL2; file lint uses pinned browser.",
  );
} finally {
  await browser.close();
  await server.close();
}
