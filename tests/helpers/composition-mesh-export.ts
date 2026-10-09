import assert from "node:assert/strict";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import { parallelOutputProof } from "./composition-parallel-proof.ts";

/** Actual production workers, cache modes and encoders; compare every output frame. */
export async function checkMeshExports(root: string, directory: string) {
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const) {
    let baseline: Awaited<ReturnType<typeof parallelOutputProof>> | undefined;
    for (const [workers, cacheStatic] of [
      [1, true],
      [1, true],
      [4, true],
      [4, false],
    ] as const) {
      const outputPath = join(directory, `${backend}-${reports.length}.mp4`);
      const result = await renderComposition({
        compositionPath: join(
          root,
          "examples/composition/12-puppet-acting/composition.json",
        ),
        outputPath,
        backend,
        workers,
        cacheStatic,
      });
      const proof = await parallelOutputProof(outputPath, result.metrics);
      if (baseline)
        assert.deepEqual(
          proof,
          baseline,
          `${backend}/${workers}/${cacheStatic}`,
        );
      else baseline = proof;
      assert.equal(proof.decodedFrames.length, 48);
      assert.ok(new Set(proof.decodedFrames).size >= 20);
      reports.push({
        backend,
        workers,
        cacheStatic,
        proof,
        metrics: result.metrics,
      });
      console.log("Puppet production export:", backend, workers, cacheStatic);
    }
  }
  return reports;
}
