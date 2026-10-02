import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
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
  const results = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    const { checkWebglFrames } = (await import(url)) as typeof Checks;
    return checkWebglFrames();
  });
  for (const result of results)
    console.log("WebGL composition:", JSON.stringify(result));
  for (const result of results) {
    assert.ok(result.maxDelta <= 2, `${result.id} delta ${result.maxDelta}`);
    assert.ok(result.psnr >= 50, `${result.id} PSNR ${result.psnr}`);
    assert.ok(result.passes > 0);
  }
} finally {
  await browser.close();
  await server.close();
}
