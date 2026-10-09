import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import type * as MemoryChecks from "../helpers/composition-mesh-memory-reference.ts";
import { checkMeshExports } from "../helpers/composition-mesh-export.ts";
import type * as Offscreen from "../helpers/composition-mesh-offscreen.ts";
import type * as Demo from "../helpers/composition-puppet-demo.ts";
import type * as Raster from "../helpers/composition-mesh-raster-reference.ts";
import type * as Checks from "../helpers/composition-mesh-reference.ts";
const root = resolve(import.meta.dirname, "../.."),
  scratch = await mkdtemp(join(tmpdir(), "ce14-mesh-"));
const server = await createServer({
  root,
  cacheDir: join(scratch, "vite"),
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
  assertPinnedRenderEnvironment(await probeRenderEnvironment(page));
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/composition-mesh-reference.ts";
    const checks = (await import(path)) as typeof Checks;
    return checks.checkMeshRendering();
  });
  const raster = await page.evaluate(async () => {
    const path = "/tests/helpers/composition-mesh-raster-reference.ts";
    return ((await import(path)) as typeof Raster).checkMeshRasterDegeneracy();
  });
  const offscreen = await page.evaluate(async () => {
    const path = "/tests/helpers/composition-mesh-offscreen.ts";
    return ((await import(path)) as typeof Offscreen).checkOffscreenMeshes();
  });
  const memory = await page.evaluate(async () => {
    const path = "/tests/helpers/composition-mesh-memory-reference.ts";
    const checks = (await import(path)) as typeof MemoryChecks;
    return checks.checkMeshMemory();
  });
  const demo = await page.evaluate(async () => {
    const path = "/tests/helpers/composition-puppet-demo.ts";
    const checks = (await import(path)) as typeof Demo;
    return checks.checkPuppetDemo();
  });
  for (const item of demo) {
    await writeFile(
      join(scratch, `${item.name}-${item.backend}.png`),
      Buffer.from(item.picture.split(",")[1]!, "base64"),
    );
  }
  console.log("Demo pictures:", scratch);
  console.log(
    JSON.stringify({
      status: "passed",
      scope: "focused mesh pixels, seeks and ownership",
      result,
      memory,
      offscreen,
      raster,
      demo: demo.map(({ picture: _picture, ...proof }) => proof),
    }),
  );
} finally {
  await browser.close();
  await server.close();
  await rm(join(scratch, "vite"), { recursive: true, force: true });
}

const exports = await checkMeshExports(root, scratch);
await writeFile(
  join(scratch, "exports.json"),
  JSON.stringify(exports, null, 2),
);
console.log("Mesh production exports passed:", join(scratch, "exports.json"));
