import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import { loadComposition } from "@still-shift/animation-engine";
import {
  exportScene,
  type ExportRequest,
} from "@still-shift/execution-runtime/export";
import {
  COMPOSITION_OUTPUT_FORMATS,
  compositionOutputProfile,
} from "../../packages/execution-runtime/src/composition-output.ts";

export async function verifyParallelLifecycle(
  directory: string,
  compositionPath: string,
) {
  const loaded = await loadComposition(compositionPath, "webgl2", {
    cacheDirectory: join(directory, "lifecycle-cache"),
  });
  const audio = loaded.preparedAudio!;
  const base = {
    scene: loaded.scene,
    sourcePath: compositionPath,
    expectedSourceChecksum: loaded.sourceChecksum,
    depthPath: null,
    assetPaths: loaded.assetPaths,
    workers: 4 as const,
    transport: "raw_rgba" as const,
    audioInput: {
      path: loaded.assetPaths[audio.resource.id]!,
      sha256: audio.resource.sha256,
      byteLength: audio.resource.byteLength,
      sampleCount: audio.sampleCount,
    },
    resultManifestContents: () => "{}\n",
  };
  const reports: unknown[] = [];
  async function failure(
    name: string,
    options: Partial<ExportRequest>,
    predicate: (reason: unknown) => boolean,
    foreign?: { path: string; bytes: Buffer },
  ) {
    const pages: Page[] = [];
    const profile = compositionOutputProfile(options.format ?? "png8");
    const prefix = `parallel-failure-${name}`;
    const outputPath = join(
      directory,
      prefix +
        (profile.container === "image2"
          ? ".%06d.png"
          : `.${profile.container}`),
    );
    const verifyWorker = options.verifyWorker;
    await assert.rejects(
      exportScene({
        ...base,
        format: "png8",
        ...options,
        outputPath,
        verifyWorker: async (page, worker) => {
          pages[worker] = page;
          await verifyWorker?.(page, worker);
        },
      }),
      predicate,
      name,
    );
    assert.equal(pages.length, 4);
    assert.ok(
      pages.every((page) => page.isClosed()),
      `${name}: all pinned browsers closed`,
    );
    if (foreign) assert.deepEqual(await readFile(foreign.path), foreign.bytes);
    const remaining = (await readdir(directory)).filter((file) =>
      file.includes(prefix),
    );
    assert.deepEqual(
      remaining,
      foreign ? [foreign.path.slice(directory.length + 1)] : [],
      `${name}: output, sidecars and private stages removed`,
    );
    reports.push({
      name,
      pinnedBrowsers: pages.length,
      browsersClosed: true,
      publication: "none",
      stageCleanup: true,
      ...(foreign ? { foreignDestinationPreserved: true } : {}),
    });
    console.log("Parallel failure:", name);
  }
  for (const format of COMPOSITION_OUTPUT_FORMATS)
    for (const mode of ["abort", "upload-reject"] as const) {
      const reason = Error(`Parallel ${format} ${mode} at absolute frame zero`);
      const controller = new AbortController();
      let observed = 0;
      await failure(
        `${format}-${mode}`,
        {
          format,
          signal: controller.signal,
          verifyFrame: (frame, worker) => {
            assert.equal(frame, 0);
            assert.equal(worker, 0);
            observed++;
            if (mode === "abort") controller.abort(reason);
            else throw reason;
          },
        },
        (error) => error === reason,
      );
      assert.equal(observed, 1);
    }
  const controller = new AbortController();
  await failure(
    "null-abort",
    { signal: controller.signal, verifyFrame: () => controller.abort(null) },
    (error) => error === null,
  );
  await failure(
    "worker-diagnostic",
    {
      verifyWorker: async (page) => {
        await page.evaluate(() => {
          const run = window.runStillShiftExport!;
          window.runStillShiftExport = async (...args) => {
            if (args[3]?.work?.worker === 1)
              throw Object.assign(Error("Worker original diagnostic"), {
                diagnostics: [
                  {
                    code: "parallel-test-worker",
                    message: "Worker original diagnostic",
                    node: "moving",
                    frame: 1,
                    severity: "error",
                  },
                ],
              });
            return run(...args);
          };
        });
      },
    },
    (error) =>
      error instanceof Error &&
      error.message.includes(
        "parallel-test-worker: Worker original diagnostic",
      ),
  );
  const pages: Page[] = [];
  await failure(
    "browser-close",
    {
      verifyWorker: async (page, worker) => {
        pages[worker] = page;
      },
      verifyFrame: async (frame) => {
        if (frame === 0) await pages[1]!.context().browser()!.close();
      },
    },
    (error) => error instanceof Error && /closed/i.test(error.message),
  );
  for (const fault of ["index", "body", "credential", "duplicate"] as const)
    await failure(
      `frame-${fault}`,
      {
        verifyWorker: async (page, worker) => {
          if (worker !== 1) return;
          await page.evaluate((fault) => {
            const original = window.fetch.bind(window);
            let first = true;
            window.fetch = async (input, init) => {
              if (!String(input).includes("/_export/frame") || !first)
                return original(input, init);
              first = false;
              const headers = new Headers(init?.headers);
              if (fault === "index") headers.set("x-frame-index", "0");
              if (fault === "credential")
                headers.set("x-export-credential", "foreign-worker");
              if (fault === "duplicate") {
                const repeated = original(input, init);
                const response = await original(input, init);
                await repeated;
                return response;
              }
              return original(input, {
                ...init,
                headers,
                ...(fault === "body" ? { body: new Uint8Array(1) } : {}),
              });
            };
          }, fault);
        },
      },
      (error) =>
        error instanceof Error &&
        /ownership|byte count|upload failed/i.test(error.message),
    );
  for (const source of ["json", "image"] as const) {
    const path = source === "json" ? compositionPath : loaded.assetPaths.ramp!;
    const original = await readFile(path);
    try {
      await failure(
        `source-${source}`,
        {
          verifyFrame: async (frame) => {
            if (frame === 0)
              await writeFile(
                path,
                Buffer.concat([original, Buffer.from(" ")]),
              );
          },
          validateSources: async () => {
            const verified = await loadComposition(compositionPath, "webgl2", {
              cacheDirectory: join(directory, "lifecycle-cache"),
            });
            if (verified.sourceChecksum !== loaded.sourceChecksum)
              throw Error(
                "Composition source changed before output publication",
              );
          },
        },
        (error) =>
          error instanceof Error &&
          /Composition source changed (during output rendering|before output publication)|checksum/i.test(
            error.message,
          ),
      );
    } finally {
      await writeFile(path, original);
    }
  }
  const foreign = {
    path: join(directory, "parallel-failure-foreign-destination.000002.png"),
    bytes: Buffer.from("foreign destination created during rendering"),
  };
  await failure(
    "foreign-destination",
    {
      verifyFrame: async (frame) => {
        if (frame === 0)
          await writeFile(foreign.path, foreign.bytes, { flag: "wx" });
      },
    },
    (error) =>
      error instanceof Error &&
      /exists|destination|EEXIST/i.test(error.message),
    foreign,
  );
  return reports;
}
