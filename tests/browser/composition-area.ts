import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import type { Composition } from "@still-shift/scene-contract";

// Decode every pixel with a bounded stream, including complete native alpha.
async function decodedFrames(path: string, fps: number, frameBytes: number) {
  const child = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-threads",
      "1",
      "-framerate",
      String(fps),
      "-start_number",
      "0",
      "-i",
      path,
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
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(Error(stderr)),
    );
  });
  done.catch(() => undefined);
  const hashes: string[] = [];
  let bytes = 0,
    digest = createHash("sha256");
  try {
    for await (const chunk of child.stdout) {
      const block = chunk as Buffer;
      for (let offset = 0; offset < block.length; ) {
        const length = Math.min(block.length - offset, frameBytes - bytes);
        digest.update(block.subarray(offset, offset + length));
        offset += length;
        bytes += length;
        if (bytes === frameBytes) {
          hashes.push(digest.digest("hex"));
          digest = createHash("sha256");
          bytes = 0;
        }
      }
    }
    await done;
    assert.equal(bytes, 0);
    return hashes;
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

const directory = await mkdtemp(join(tmpdir(), "ce15-full-area-"));
const quick = process.argv.includes("--quick");
const smoke = quick || process.argv.includes("--smoke");
const reports = [];
for (const backend of (quick ? ["canvas2d"] : ["canvas2d", "webgl2"]) as (
  | "canvas2d"
  | "webgl2"
)[])
  for (const fps of smoke ? [60] : [1, 24, 60]) {
    const composition: Composition = {
      schemaVersion: "composition-1",
      id: "full-area",
      width: 8192,
      height: 8192,
      fps,
      frameCount: 4,
      assets: [],
      background: "#11223380",
      layers: [
        {
          id: "panel",
          type: "solid",
          size: [4096, 8192],
          color: "#dd885580",
          transform: { anchor: [0, 0], position: [1024, 0] },
        },
      ],
    };
    const source = join(directory, `${backend}-${fps}.json`);
    await writeFile(source, JSON.stringify(composition));
    let expected: { encoded: string[]; decoded: string[] } | undefined;
    for (const workers of smoke ? ([1, 4] as const) : ([1, 2, 3, 4] as const))
      for (const cacheStatic of [false, true]) {
        const outputPath = join(
          directory,
          `${backend}-${fps}-${workers}-${cacheStatic}.%06d.png`,
        );
        const { metrics } = await renderComposition({
          compositionPath: source,
          outputPath,
          backend,
          workers,
          cacheStatic,
          format: "png8",
          transport: "raw_rgba",
        });
        const proof = {
          encoded: metrics.output!.sequence!.frames,
          decoded: await decodedFrames(outputPath, fps, 8192 * 8192 * 4),
        };
        assert.equal(proof.decoded.length, 4);
        if (expected) assert.deepEqual(proof, expected);
        else expected = proof;
        const memory = metrics.compositionMemory!;
        assert.equal(memory.concurrentWorkers, 1);
        assert.ok(
          memory.peakConcurrentWorkerBytes + memory.reservedNodeBudgetBytes <=
            memory.applicationLimitBytes,
        );
        assert.equal(memory.workers.length, workers);
        for (const worker of memory.workers) {
          assert.deepEqual(worker.afterAcknowledgement?.current, {
            pixels: 0,
            metadata: 0,
          });
          assert.equal(worker.afterAcknowledgement?.reservations, 0);
        }
        const rootPaints = metrics
          .work!.workersDetail.flatMap(
            (worker) => worker.result.rootStatistics?.roots ?? [],
          )
          .reduce((sum, root) => sum + root.paints, 0);
        if (cacheStatic)
          assert.equal(
            rootPaints,
            1,
            "static full-area root paints once globally",
          );
        reports.push({ backend, fps, workers, cacheStatic, proof, metrics });
        await writeFile(
          join(directory, "results.json"),
          JSON.stringify({ status: "in-progress", reports }, null, 2) + "\n",
        );
        console.log(
          JSON.stringify({
            backend,
            fps,
            workers,
            cacheStatic,
            status: "passed",
            peak: memory.peakConcurrentWorkerBytes,
            rss: metrics.peakSampledProcessTreeRssBytes,
          }),
        );
      }
  }
await writeFile(
  join(directory, "results.json"),
  JSON.stringify({ status: "passed", reports }, null, 2) + "\n",
);
console.log(
  JSON.stringify({ status: "passed", directory, exports: reports.length }),
);
