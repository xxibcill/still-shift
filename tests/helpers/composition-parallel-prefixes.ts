import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import { compositionSourceFixture } from "./composition-source-fixture.ts";
import {
  parallelOutputProof,
  verifyParallelMetrics,
} from "./composition-parallel-proof.ts";

/** Direct native glyph/provider prefixes below actual moving image pixels. */
export async function verifyParallelPrefixes(directory: string) {
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const software of [false, true])
      for (const late of [false, true]) {
        const name = `prefixes-${backend}-${software}-${late}`;
        const { composition, svg } = await compositionSourceFixture(
          software,
          false,
        );
        composition.layers = [
          {
            id: "moving-image",
            type: "image",
            size: [29, 31],
            fit: "stretch",
            sources: [{ asset: "art" }],
            transform: {
              anchor: [0, 0],
              rotation: 17.25,
              position: {
                keys: [
                  { frame: 0, value: [3.25, 7.35] },
                  { frame: 7, value: [118.45, 55.65] },
                ],
              },
            },
          },
          ...composition.precomps![0]!.layers,
          ...composition.layers.filter(
            (layer) => layer.id !== "host" && layer.id !== "moving",
          ),
        ];
        delete composition.precomps;
        if (late)
          composition.layers.find((layer) => layer.id === "native")!.inPoint =
            4;
        composition.assets.find((asset) => asset.id === "body")!.path = resolve(
          "assets/story-motion/fonts/plex-sans-semibold.ttf",
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
          const output = join(directory, name + "-" + run + ".%06d.png");
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
            verifyParallelMetrics(metrics, workers, true, 0);
            const prefixes = metrics
              .work!.workersDetail.flatMap(
                (worker) => worker.result.rootStatistics!.roots,
              )
              .filter((root) => root.phase === "prefix");
            assert.equal(
              prefixes.reduce((sum, prefix) => sum + prefix.paints, 0),
              late ? 2 : 1,
            );
            assert.equal(
              prefixes.reduce((sum, prefix) => sum + prefix.restores, 0),
              (late ? 2 : 1) * (workers - 1),
            );
            assert.ok(prefixes.every((prefix) => prefix.fallbacks === 0));
            assert.ok(
              prefixes.some((prefix) =>
                prefix.operations.some((op) => op.layer === "native"),
              ),
            );
            assert.ok(
              prefixes.every((prefix) =>
                prefix.operations.every((op) => op.layer !== "moving-image"),
              ),
            );
          } else assert.equal(metrics.work, undefined);
          exports.push({ run, workers, proof, metrics });
        }
        reports.push({ backend, software, late, exports });
        console.log("Parallel closed prefix:", name);
      }
  return reports;
}
