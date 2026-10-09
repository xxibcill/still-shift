import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import type { Page } from "playwright";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { renderComposition } from "@still-shift/animation-engine";
import { CompositionSurfaceStore } from "../../packages/execution-runtime/src/composition-surface-store.ts";
import { CompositionSurfaceBroker } from "../../packages/execution-runtime/src/composition-surface-broker.ts";
import {
  tintCapacityFixture,
  tintEntryCapacityFixture,
} from "../helpers/composition-tint-capacity.ts";
import type * as Checks from "../helpers/composition-tint-capacity.ts";

/** Decode every pixel with bounded storage; large frames exceed buffered test helpers. */
async function decodedFrameHashes(path: string, frameBytes: number) {
  const child = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-threads",
      "1",
      "-framerate",
      "60",
      "-start_number",
      "0",
      "-i",
      path,
      "-an",
      "-threads",
      "1",
      "-pix_fmt",
      "rgba",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (bytes: Buffer) => {
    stderr = (stderr + bytes.toString()).slice(-8192);
  });
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(Error(stderr)),
    );
  });
  closed.catch(() => undefined);
  let bytes = 0,
    hash = createHash("sha256");
  const frames: string[] = [];
  try {
    for await (const chunk of child.stdout) {
      const block = chunk as Buffer;
      for (let offset = 0; offset < block.length; ) {
        const length = Math.min(block.length - offset, frameBytes - bytes);
        hash.update(block.subarray(offset, offset + length));
        offset += length;
        bytes += length;
        if (bytes === frameBytes) {
          frames.push(hash.digest("hex"));
          hash = createHash("sha256");
          bytes = 0;
        }
      }
    }
    await closed;
    assert.equal(bytes, 0);
    return frames;
  } finally {
    child.kill("SIGKILL");
    await closed.catch(() => undefined);
  }
}

const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp(join(tmpdir(), "pr49-tint-capacity-")),
  credentials = Array.from({ length: 4 }, () => randomUUID()),
  credential = credentials[0]!,
  failures: unknown[] = [];
let store = await CompositionSurfaceStore.create(directory, {
  workers: 1,
  byteLimit: 512 * 1024 ** 2,
});
let broker = new CompositionSurfaceBroker(store, [credential], (reason) =>
  failures.push(reason),
);
const server = await createServer({
  root,
  configFile: false,
  cacheDir: join(directory, "vite"),
  logLevel: "error",
  plugins: [
    {
      name: "tint-capacity",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const route = new URL(request.url ?? "/", "http://localhost")
            .pathname;
          if (!route.startsWith("/_export/surface/")) return next();
          void broker.respond(
            route.slice("/_export/surface/".length),
            request,
            response,
          );
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
const previews = [],
  exports = [];
try {
  await server.listen();
  browser = await launchRenderBrowser();
  const page = await browser.newPage();
  const baseUrl = server.resolvedUrls!.local[0]!;
  await page.goto(baseUrl);
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const variant of ["bytes", "entries"] as const) {
      const workers = variant === "entries" ? 4 : 1;
      if (previews.length || workers !== 1) {
        await store.dispose();
        store = await CompositionSurfaceStore.create(directory, {
          workers,
          byteLimit: 512 * 1024 ** 2,
        });
        broker = new CompositionSurfaceBroker(
          store,
          credentials.slice(0, workers),
          (reason) => failures.push(reason),
        );
      }
      let uncachedPaints = 0;
      for (let worker = 0; worker < workers; worker++) {
        const workerPage: Page = worker === 0 ? page : await browser.newPage();
        if (worker > 0) await workerPage.goto(baseUrl);
        try {
          const preview = await workerPage.evaluate(
            async (options) => {
              const url = "/tests/helpers/composition-tint-capacity.ts";
              return ((await import(url)) as typeof Checks).checkTintCapacity(
                options,
              );
            },
            {
              backend,
              variant,
              workers,
              requireFallback: variant === "bytes",
              baseUrl: baseUrl + "_export/surface",
              worker,
              credential: credentials[worker]!,
              scopeKey:
                "sha256:" + (backend === "canvas2d" ? "a" : "b").repeat(64),
            },
          );
          assert.equal(preview.comparedFrames, 192);
          assert.deepEqual(preview.memory.current, { pixels: 0, metadata: 0 });
          assert.equal(preview.memory.reservations, 0);
          uncachedPaints += preview.uncachedPaints;
          previews.push({ ...preview, worker });
          console.log(JSON.stringify({ phase: "preview", ...preview, worker }));
        } finally {
          if (worker > 0) await workerPage.close();
        }
      }
      assert.ok(uncachedPaints > 0);
      if (variant === "entries") {
        assert.equal(store.statistics.publishedSurfaces, 4096);
        assert.ok(store.statistics.reservedDiskBytes < 128 * 1024 ** 2);
      }
    }
  assert.deepEqual(failures, []);
  await browser.close();
  browser = undefined;
  await server.close();
  await store.dispose();
  for (const variant of ["bytes", "entries"] as const) {
    const composition =
      variant === "entries"
        ? tintEntryCapacityFixture()
        : tintCapacityFixture();
    composition.assets[0]!.path = resolve(
      root,
      "assets/story-motion/fonts/plex-sans-semibold.ttf",
    );
    const source = join(directory, `${variant}-source.json`);
    await writeFile(source, JSON.stringify(composition));
    for (const backend of ["canvas2d", "webgl2"] as const) {
      let expected: { encoded: string[]; decodedFrames: string[] } | undefined;
      for (const [name, workers] of [
        ["baseline", undefined],
        ["one", 1],
        ["four", 4],
        ["repeat", 4],
      ] as const) {
        const outputPath = join(
          directory,
          `${backend}-${variant}-${name}.%06d.png`,
        );
        const { metrics } = await renderComposition({
          compositionPath: source,
          outputPath,
          backend,
          format: "png8",
          transport: "raw_rgba",
          ...(workers === undefined ? {} : { workers }),
        });
        const proof = {
          encoded: metrics.output!.sequence!.frames,
          decodedFrames: await decodedFrameHashes(
            outputPath,
            metrics.width * metrics.height * 4,
          ),
        };
        assert.equal(proof.decodedFrames.length, composition.frameCount);
        if (expected) assert.deepEqual(proof, expected);
        else expected = proof;
        if (workers) {
          assert.equal(metrics.work!.cacheStatic, true);
          for (const worker of metrics.compositionMemory!.workers) {
            assert.deepEqual(worker.afterAcknowledgement!.current, {
              pixels: 0,
              metadata: 0,
            });
            assert.equal(worker.afterAcknowledgement!.reservations, 0);
          }
          if (workers === 1)
            assert.ok(
              metrics.work!.workersDetail.some((worker) =>
                worker.result.sourceStatistics!.sources.some(
                  (source) => source.uncachedPaints > 0,
                ),
              ),
            );
        }
        exports.push({ backend, variant, name, workers, proof, metrics });
        console.log(
          JSON.stringify({
            phase: "export",
            backend,
            variant,
            name,
            status: "passed",
          }),
        );
      }
    }
  }
  const report = { status: "passed", previews, exports };
  await writeFile(
    join(directory, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      directory,
      previews: previews.length,
      exports: exports.length,
    }),
  );
} finally {
  await browser?.close();
  await server.close();
  await store.dispose();
  await rm(join(directory, "vite"), { recursive: true, force: true });
}
