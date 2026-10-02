import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type * as Rational from "../helpers/composition-webgl-float-sum.ts";
import type * as Checks from "../helpers/composition-webgl-reference.ts";
const server = await createServer({
  root: resolve(import.meta.dirname, "../.."),
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const sums = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-float-sum.ts";
    return ((await import(url)) as typeof Rational).checkWebglFloatSum();
  });
  console.log("WebGL exact Float32 accumulation:", sums);
  const reuse = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    return ((await import(url)) as typeof Checks).checkWebglFrameReuse();
  });
  console.log("WebGL frame reuse:", reuse);
  const providerReuse = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    return ((await import(url)) as typeof Checks).checkWebglProviderReuse();
  });
  console.log("WebGL provider reuse:", providerReuse);
  const results = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    const { checkWebglFrames } = (await import(url)) as typeof Checks;
    return checkWebglFrames();
  });
  for (const result of results)
    console.log("WebGL composition:", JSON.stringify(result));
  const failures: string[] = [];
  for (const result of results) {
    if (result.maxDelta > 2 || result.psnr < 50 || result.passes <= 0)
      failures.push(
        `${result.id} delta ${result.maxDelta} PSNR ${result.psnr} passes ${result.passes}`,
      );
  }
  for (const path of [
    "ce6/gaussian",
    "ce6/pixel-stack",
    "ce6/generators",
    "ce6/light-sweep",
    "ce6/echo",
    "ce6/primitive-blur",
    "ce7/exposure",
    "ce7/indexed",
    "ce4b/text-states",
    "ce4b/typography",
    "ce4a/providers",
  ]) {
    const results = await page.evaluate(async (path) => {
      const url = "/tests/helpers/composition-webgl-reference.ts";
      const { checkCompositionBackends } = (await import(url)) as typeof Checks;
      return checkCompositionBackends([
        `/benchmarks/fixtures/composition/${path}.json`,
      ]);
    }, path);
    for (const result of results) {
      console.log("WebGL native fixture:", JSON.stringify(result));
      if (result.maxDelta > 2 || result.psnr < 50)
        failures.push(
          `${result.id} delta ${result.maxDelta} PSNR ${result.psnr}`,
        );
    }
  }
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  await server.close();
}
