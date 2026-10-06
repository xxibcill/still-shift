import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { type Composition } from "@still-shift/scene-contract";
import { depthToComposition } from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Legacy from "../../packages/renderer-core/src/webgl-renderer.ts";
import type * as Metrics from "../../packages/renderer-core/src/frame-tolerance.ts";
import { depthReferenceFixtures } from "../helpers/composition-depth-fixtures.ts";

const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(
  await readFile(
    resolve(root, "tests/visual/composition-depth-reference/darwin-arm64.json"),
    "utf8",
  ),
) as {
  rows: {
    id: string;
    sourceHash: string;
    depthHash: string;
    hashes: string[];
  }[];
};
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await launchRenderBrowser();
const reports = [];
try {
  const fixtures = depthReferenceFixtures();
  assert.equal(fixtures.length, 17);
  for (const fixture of fixtures) {
    const reference = manifest.rows.find((row) => row.id === fixture.id)!;
    const doc = depthToComposition(
      {
        ...fixture.scene,
        canvas: { width: fixture.width, height: fixture.height },
      },
      {
        id: fixture.id,
        source: {
          id: "source",
          type: "image",
          path: fixture.source,
          sha256: "sha256:" + reference.sourceHash,
          width: 1600,
          height: 900,
        },
        ...(fixture.scene.motion.mode === "depth"
          ? {
              depth: {
                id: "depth",
                type: "image" as const,
                path: fixture.depth!,
                sha256: "sha256:" + reference.depthHash,
                width: 1600,
                height: 900,
              },
            }
          : {}),
      },
    );
    const page = await browser.newPage();
    try {
      await page.addInitScript("window.__name=(fn)=>fn;");
      await page.goto(server.resolvedUrls!.local[0]!);
      assertPinnedRenderEnvironment(await probeRenderEnvironment(page));
      const result = await page.evaluate(
        async ({ fixture, documentJson, reference }) => {
          const doc = JSON.parse(documentJson) as Composition;
          const renderUrl = "/packages/renderer-core/src/index.ts",
            legacyUrl = "/packages/renderer-core/src/webgl-renderer.ts",
            metricsUrl = "/packages/renderer-core/src/frame-tolerance.ts";
          const renderer: typeof Render = await import(renderUrl),
            legacy: typeof Legacy = await import(legacyUrl),
            metrics: typeof Metrics = await import(metricsUrl);
          const resources = await renderer.loadCompositionResources(
            doc,
            (id) =>
              `/benchmarks/fixtures/composition/ce4d/${id === "source" ? fixture.source : fixture.depth}`,
          );
          const canvas = document.createElement("canvas");
          canvas.width = doc.width;
          canvas.height = doc.height;
          const old = document.createElement("canvas");
          old.width = doc.width;
          old.height = doc.height;
          const native = renderer.createCompositionPreview(
            canvas,
            doc,
            resources,
            { backend: "webgl2" },
          );
          const original = legacy.createWebGLPreview(
            old,
            fixture.scene,
            resources.images.get("source") as HTMLImageElement,
            resources.images.get("depth") as HTMLImageElement,
          );
          const gl = old.getContext("webgl2")!;
          const hashes: string[] = [];
          let maxChannelDelta = 0;
          try {
            for (let frame = 0; frame < doc.frameCount; frame++) {
              original.renderFrame(frame);
              native.renderFrame(frame);
              const bottom = new Uint8Array(doc.width * doc.height * 4);
              gl.readPixels(
                0,
                0,
                doc.width,
                doc.height,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                bottom,
              );
              const digest = new Uint8Array(
                await crypto.subtle.digest("SHA-256", bottom),
              );
              const legacyHash = Array.from(digest, (value) =>
                value.toString(16).padStart(2, "0"),
              ).join("");
              if (legacyHash !== reference.hashes[frame])
                throw new Error(
                  `Independent old-depth reference changed at ${frame}`,
                );
              const expected = new Uint8ClampedArray(bottom.length);
              for (let row = 0; row < doc.height; row++)
                expected.set(
                  bottom.subarray(
                    row * doc.width * 4,
                    (row + 1) * doc.width * 4,
                  ),
                  (doc.height - row - 1) * doc.width * 4,
                );
              const actual = native.readPixels();
              const compared = metrics.compareFrames(
                expected,
                actual,
                doc.width,
                doc.height,
              );
              maxChannelDelta = Math.max(
                maxChannelDelta,
                compared.maxChannelDelta,
              );
              if (!metrics.meetsTier(compared, "near"))
                throw new Error(
                  `Native depth parity frame ${frame}: ${JSON.stringify(compared)}`,
                );
              const nativeDigest = new Uint8Array(
                await crypto.subtle.digest("SHA-256", new Uint8Array(actual)),
              );
              hashes.push(
                Array.from(nativeDigest, (value) =>
                  value.toString(16).padStart(2, "0"),
                ).join(""),
              );
            }
            for (let frame = doc.frameCount - 1; frame >= 0; frame--) {
              native.renderFrame(frame);
              const digest = new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  new Uint8Array(native.readPixels()),
                ),
              );
              if (
                Array.from(digest, (value) =>
                  value.toString(16).padStart(2, "0"),
                ).join("") !== hashes[frame]
              )
                throw new Error(`Native reverse seek changed frame ${frame}`);
            }
            return { frames: doc.frameCount, maxChannelDelta, hashes };
          } finally {
            native.dispose();
            original.dispose();
          }
        },
        { fixture, documentJson: JSON.stringify(doc), reference },
      );
      reports.push({ id: fixture.id, ...result });
      console.log(
        `${fixture.id}: ${result.frames} native forward/reverse frames, delta ${result.maxChannelDelta}`,
      );
    } finally {
      await page.close();
    }
  }
  await writeFile(
    process.env.STILL_SHIFT_DEPTH_NATIVE_REPORT ??
      resolve(root, "benchmarks/results/composition-ce4d-depth-native.json"),
    JSON.stringify(
      {
        scope:
          "all 17 prepared depth/flat/fallback adapter timelines; default consolidation/exports/hardware remain pending",
        reports,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
