import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import type * as MemoryChecks from "../helpers/composition-mesh-memory-reference.ts";
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
  const memory = await page.evaluate(async () => {
    const path = "/tests/helpers/composition-mesh-memory-reference.ts";
    const checks = (await import(path)) as typeof MemoryChecks;
    return checks.checkMeshMemory();
  });
  console.log(
    JSON.stringify({
      status: "passed",
      scope: "focused mesh pixels, seeks and ownership",
      result,
      memory,
    }),
  );
} finally {
  await browser.close();
  await server.close();
  await rm(scratch, { recursive: true, force: true });
}
