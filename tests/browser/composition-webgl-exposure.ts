import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import type * as Checks from "../helpers/composition-webgl-exposure.ts";

const profile = process.argv.includes("--hardware") ? "hardware" : "pinned";
const cache = await mkdtemp(join(tmpdir(), "ce6p-exposure-vite-"));
const server = await createServer({
  root: resolve(import.meta.dirname, "../.."),
  cacheDir: cache,
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
  const environment = await probeRenderEnvironment(page, profile);
  if (profile === "pinned") assertPinnedRenderEnvironment(environment);
  console.log("Exposure environment:", JSON.stringify(environment));
  console.log(
    "WebGL final exposure sum/resolve exactness:",
    await page.evaluate(async () => {
      const url = "/tests/helpers/composition-webgl-exposure.ts";
      return ((await import(url)) as typeof Checks).checkWebglExposureFusion();
    }),
  );
} finally {
  await browser.close();
  await server.close();
  await rm(cache, { recursive: true, force: true });
}
