import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import type * as Proof from "../helpers/native3d-shape-world-proof.ts";

const hash = (bytes: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
export async function runNativeShapeWorldProof() {
  const root = resolve(import.meta.dirname, "../..");
  const directory = await mkdtemp("/private/tmp/still-shift-ms2-shape-world-");
  const source = mechanismV2Fixture();
  source.camera = {
    ...source.camera,
    position: [8, 5, 15],
    target: [4, 0, 0],
    fovDegrees: 50,
  };
  const sourceBytes = JSON.stringify(source, null, 2) + "\n";
  const sourceSha256 = hash(sourceBytes);
  await writeFile(join(directory, "source.json"), sourceBytes, { flag: "wx" });
  const producerPaths = [
    "tests/helpers/native3d-shape-world-proof.ts",
    "tests/browser/native3d-shape-world.ts",
    "packages/renderer-core/src/native3d/three-shapes.ts",
    "packages/renderer-core/src/native3d/three-world.ts",
    "packages/renderer-core/src/native3d/three-materials.ts",
    "packages/renderer-core/src/native3d/prepare-v2.ts",
    "packages/renderer-core/src/native3d/evaluate-v2.ts",
  ];
  const producers = await Promise.all(
    producerPaths.map(async (path) => ({
      path,
      sha256: hash(await readFile(join(root, path))),
    })),
  );
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    resolve: {
      alias: [
        {
          find: /^@still-shift\/scene-contract$/,
          replacement: join(root, "packages/scene-contract/src/index.ts"),
        },
      ],
    },
    server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use((req, res, next) => {
    if (req.url !== "/shape-world-proof") {
      next();
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><html><body></body></html>");
  });
  let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
  try {
    await server.listen();
    browser = await launchRenderBrowser();
    const page = await browser.newPage();
    await page.addInitScript("window.__name=(fn)=>fn;");
    await page.goto(server.resolvedUrls!.local[0]! + "shape-world-proof");
    const environment = await probeRenderEnvironment(page);
    assertPinnedRenderEnvironment(environment);
    const result = await page.evaluate(
      async (input) => {
        const modulePath = "/tests/helpers/native3d-shape-world-proof.ts";
        const proof = (await import(modulePath)) as typeof Proof;
        return proof.nativeShapeWorldProof(input.source, input.sourceSha256);
      },
      { source, sourceSha256 },
    );
    const frames: Array<
      Omit<(typeof result.captures)[number], "rgba" | "pngBase64"> & {
        rgbaSha256: string;
        bytes: number;
      }
    > = [];
    for (const capture of result.captures) {
      const rgba = new Uint8Array(capture.rgba);
      await writeFile(join(directory, capture.id + ".rgba"), rgba, {
        flag: "wx",
      });
      await writeFile(
        join(directory, capture.id + ".png"),
        Buffer.from(capture.pngBase64, "base64"),
        { flag: "wx" },
      );
      frames.push({
        id: capture.id,
        rgbaSha256: hash(rgba),
        bytes: rgba.byteLength,
        calls: capture.calls,
        sourceFrame: capture.sourceFrame,
      });
    }
    const frame = (id: string) => frames.find((capture) => capture.id === id)!;
    assert.equal(frames.length, 5);
    assert.equal(frame("rest-a").rgbaSha256, frame("rest-b").rgbaSha256);
    assert.equal(
      frame("rest-a").rgbaSha256,
      frame("rest-a-reverse").rgbaSha256,
    );
    assert.equal(frame("bent-a").rgbaSha256, frame("bent-a-repeat").rgbaSha256);
    assert.notEqual(frame("rest-a").rgbaSha256, frame("bent-a").rgbaSha256);
    assert.deepEqual(result.ownersPerWorld, [2, 2]);
    await writeFile(
      join(directory, "run.json"),
      JSON.stringify(
        {
          version: "native3d-shape-world-proof-1",
          status: "passed",
          sourceSha256,
          environment,
          producers,
          frames,
          scope: result.scope,
          limits:
            "Actual shared factory/owned geometry and framebuffer pixels only. No independent used-GPU stream/landmark ledger, composition/export publication or family/pilot acceptance.",
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    process.stdout.write(
      JSON.stringify({
        directory,
        status: "passed",
        frames: frames.length,
        scope: result.scope,
      }) + "\n",
    );
  } catch (error) {
    await writeFile(
      join(directory, "failure.json"),
      JSON.stringify(
        {
          status: "failed",
          sourceSha256,
          producers,
          error: error instanceof Error ? error.stack : String(error),
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    process.stdout.write(
      JSON.stringify({ directory, status: "failed" }) + "\n",
    );
    throw error;
  } finally {
    await browser?.close();
    await server.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
)
  await runNativeShapeWorldProof();
