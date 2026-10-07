import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import { compositionSourceFixture } from "./composition-source-fixture.ts";
import {
  parallelOutputProof,
  verifyParallelMetrics,
} from "./composition-parallel-proof.ts";

/** Actual export parity and global native preparation counts, including repeat runs. */
export async function verifyParallelSources(directory: string) {
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const software of [false, true])
      for (const animated of [false, true]) {
        const name = `sources-${backend}-${software}-${animated}`;
        const { composition, svg } = await compositionSourceFixture(
          software,
          animated,
        );
        const font = composition.assets.find((asset) => asset.id === "body")!;
        font.path = resolve("assets/story-motion/fonts/plex-sans-semibold.ttf");
        const art = composition.assets.find((asset) => asset.id === "art")!;
        art.path = name + ".svg";
        await writeFile(join(directory, art.path), svg);
        const path = join(directory, name + ".json");
        await writeFile(path, JSON.stringify(composition));
        let expected;
        const exports = [];
        for (const [run, workers] of [
          ["baseline", undefined],
          ["one", 1],
          ["four", 4],
          ["repeat", 4],
        ] as const) {
          const output = join(directory, `${name}-${run}.%06d.png`);
          const { metrics } = await renderComposition({
            compositionPath: path,
            outputPath: output,
            backend,
            format: "png8",
            transport: "raw_rgba",
            ...(workers ? { workers } : {}),
          });
          const proof = await parallelOutputProof(output, metrics);
          if (expected) assert.deepEqual(proof, expected, `${name}/${run}`);
          else {
            expected = proof;
            assert.equal(new Set(proof.decodedFrames).size, 8);
          }
          if (workers) {
            verifyParallelMetrics(metrics, workers, true);
            const work = metrics.work!;
            let painted = 0;
            for (const [kind, count] of [
              ["coverage-asset", 1],
              ["glyph", 3],
              ["glyph-stroke", animated ? 8 : 2],
            ] as const) {
              const sources = work.workersDetail
                .flatMap(
                  (worker) => worker.result.sourceStatistics?.sources ?? [],
                )
                .filter((source) => source.kind === kind);
              assert.equal(sources.length, workers, `${name}/${kind}`);
              assert.equal(
                sources.reduce((sum, item) => sum + item.paints, 0),
                count,
              );
              assert.equal(
                sources.reduce((sum, item) => sum + item.restores, 0),
                count * (workers - 1),
              );
              for (const source of sources)
                for (const value of [
                  source.paintAndReadbackMs,
                  source.restoreMs,
                ])
                  assert.ok(Number.isFinite(value) && value >= 0);
              painted += count;
            }
            const independent = work.workersDetail.reduce(
              (sum, worker) =>
                sum +
                worker.result.cacheStatistics!.independentSurfacePaints +
                worker.result.rootStatistics!.roots.reduce(
                  (sum, root) => sum + root.paints,
                  0,
                ),
              0,
            );
            assert.equal(
              work.surfaceStore!.publishedSurfaces,
              painted + independent,
            );
          } else assert.equal(metrics.work, undefined);
          exports.push({ run, workers, proof, metrics });
        }
        reports.push({ backend, software, animated, exports });
        console.log("Parallel source preparation:", name);
      }
  return reports;
}
