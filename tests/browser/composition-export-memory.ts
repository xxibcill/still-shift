import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import type { Composition } from "@still-shift/scene-contract";
import { parallelOutputProof } from "../helpers/composition-parallel-proof.ts";

const directory = await mkdtemp(join(tmpdir(), "ce15-production-memory-"));
const composition: Composition = {
  schemaVersion: "composition-1",
  id: "production-memory",
  width: 32,
  height: 24,
  fps: 60,
  frameCount: 4,
  assets: [],
  background: null,
  layers: [
    {
      id: "moving",
      type: "solid",
      size: [8, 8],
      color: "#7733bb80",
      transform: {
        position: {
          keys: [
            { frame: 0, value: [4, 4] },
            { frame: 3, value: [24, 16] },
          ],
        },
      },
    },
    {
      id: "fixed",
      type: "solid",
      size: [32, 24],
      color: "#22446680",
      effects: [{ id: "blur", effect: "blur.gaussian", params: { radius: 2 } }],
    },
  ],
};
const path = join(directory, "source.json");
await writeFile(path, JSON.stringify(composition));
const reports = [];
for (const backend of ["canvas2d", "webgl2"] as const) {
  let reference: Awaited<ReturnType<typeof parallelOutputProof>> | undefined;
  for (const workers of [1, 4] as const)
    for (const cacheStatic of [false, true]) {
      const outputPath = join(
        directory,
        `${backend}-${workers}-${cacheStatic}.%06d.png`,
      );
      const { metrics } = await renderComposition({
        compositionPath: path,
        outputPath,
        backend,
        workers,
        cacheStatic,
        format: "png8",
        transport: "raw_rgba",
        cacheDirectory: join(directory, "media"),
      });
      const actual = await parallelOutputProof(outputPath, metrics);
      if (reference) assert.deepEqual(actual, reference);
      else reference = actual;
      const memory = metrics.compositionMemory;
      assert.ok(memory);
      assert.equal(memory.workers.length, workers);
      assert.ok(memory.sumOfWorkerPeakBytes > 0);
      assert.ok(
        memory.sumOfWorkerPeakBytes + memory.reservedNodeBudgetBytes <=
          memory.applicationLimitBytes,
      );
      for (const worker of memory.workers) {
        assert.ok(worker.beforeAcknowledgement.peak.pixels > 0);
        assert.ok(worker.beforeAcknowledgement.peak.metadata > 0);
        assert.deepEqual(worker.afterAcknowledgement?.current, {
          pixels: 0,
          metadata: 0,
        });
        assert.equal(worker.afterAcknowledgement?.reservations, 0);
      }
      reports.push({ backend, workers, cacheStatic, memory, actual });
      console.log(
        JSON.stringify({
          backend,
          workers,
          cacheStatic,
          status: "passed",
          peak: memory.sumOfWorkerPeakBytes,
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
