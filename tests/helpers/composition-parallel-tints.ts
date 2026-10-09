import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import {
  compositionTintFixture,
  COMPOSITION_TINT_VARIANTS,
} from "./composition-tint-fixture.ts";
import {
  parallelOutputProof,
  verifyParallelMetrics,
} from "./composition-parallel-proof.ts";

/** Actual export parity and global native preparation counts, including repeat runs. */
export async function verifyParallelTints(directory: string) {
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const software of [false, true])
      for (const variant of COMPOSITION_TINT_VARIANTS) {
        const name = `tints-${backend}-${software}-${variant}`;
        const { composition, svg } = await compositionTintFixture(
          software,
          variant,
        );
        const font = composition.assets.find((asset) => asset.id === "body")!;
        font.path = resolve("assets/story-motion/fonts/plex-sans-semibold.ttf");
        const thai = composition.assets.find((asset) => asset.id === "thai");
        if (thai)
          thai.path = resolve(
            "assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
          );
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
            assert.equal(
              new Set(proof.decodedFrames).size,
              composition.frameCount,
            );
          }
          if (workers) {
            verifyParallelMetrics(metrics, workers, true);
            const work = metrics.work!;
            let painted = 0;
            for (const [kind, count] of [
              ["coverage-asset", 1],
              [
                "glyph",
                variant === "axes"
                  ? 27
                  : variant === "correction" || variant === "state-mix"
                    ? 4
                    : 3,
              ],
              ["glyph-stroke", variant === "axes" ? 0 : 2],
            ] as const) {
              const sources = work.workersDetail
                .flatMap(
                  (worker) => worker.result.sourceStatistics?.sources ?? [],
                )
                .filter((source) => source.kind === kind);
              assert.equal(
                sources.length,
                count === 0 ? 0 : workers,
                `${name}/${kind}`,
              );
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
            const tintPaints = work.workersDetail
              .flatMap(
                (worker) => worker.result.sourceStatistics?.sources ?? [],
              )
              .filter((source) => source.kind === "glyph-tint")
              .reduce((sum, source) => sum + source.paints, 0);
            assert.equal(
              tintPaints,
              variant === "colors"
                ? 44
                : variant === "axes"
                  ? 15
                  : variant === "state-mix"
                    ? 14
                    : 10,
            );
            assert.equal(
              work.surfaceStore!.publishedSurfaces,
              painted + tintPaints + independent,
            );
          } else assert.equal(metrics.work, undefined);
          exports.push({ run, workers, proof, metrics });
        }
        reports.push({ backend, software, variant, exports });
        console.log("Parallel evaluated tints:", name);
      }
  return reports;
}
