import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import { compositionSourceFixture } from "./composition-source-fixture.ts";
import {
  parallelOutputProof,
  verifyParallelMetrics,
} from "./composition-parallel-proof.ts";

export async function verifyParallelRoots(directory: string) {
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const software of [false, true])
      for (const [variant, format] of [
        ["static", "png8"],
        ["coverage", "png8"],
        ["late", "png8"],
        ["static", "h264"],
      ] as const) {
        const name = `roots-${backend}-${software}-${variant}-${format}`;
        const { composition, svg } = await compositionSourceFixture(
          software,
          false,
        );
        const inside = composition.precomps![0]!;
        composition.layers = [
          ...inside.layers,
          ...composition.layers.filter(
            (layer) => layer.id !== "host" && layer.id !== "moving",
          ),
        ];
        if (inside.textAnimators)
          composition.textAnimators = inside.textAnimators;
        delete composition.precomps;
        if (variant === "late")
          composition.layers.find((layer) => layer.id === "native")!.inPoint =
            4;
        if (variant === "coverage")
          composition.layers.find((layer) => layer.id === "cover")!.coverage =
            "required";
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
          const output = join(
            directory,
            name + "-" + run + (format === "png8" ? ".%06d.png" : ".mp4"),
          );
          const { metrics } = await renderComposition({
            compositionPath: path,
            outputPath: output,
            backend,
            format,
            transport: "raw_rgba",
            ...(workers ? { workers } : {}),
          });
          const proof = await parallelOutputProof(output, metrics);
          if (expected) assert.deepEqual(proof, expected, `${name}/${run}`);
          else {
            expected = proof;
            assert.equal(
              new Set(proof.decodedFrames).size,
              variant === "late" ? 2 : 1,
            );
          }
          if (workers) {
            verifyParallelMetrics(metrics, workers, true, 0);
            const roots = metrics.work!.workersDetail.flatMap(
              (worker) => worker.result.rootStatistics!.roots,
            );
            const expectedPaints = variant === "static" ? 1 : 2;
            assert.equal(
              roots.reduce((sum, root) => sum + root.paints, 0),
              expectedPaints,
              name,
            );
            assert.equal(
              roots.reduce((sum, root) => sum + root.restores, 0),
              expectedPaints * (workers - 1),
            );
            assert.ok(roots.every((root) => root.fallbacks === 0));
            for (const root of roots)
              for (const value of [root.paintAndReadbackMs, root.copyMs])
                assert.ok(Number.isFinite(value) && value >= 0);
          } else assert.equal(metrics.work, undefined);
          exports.push({ run, workers, proof, metrics });
        }
        reports.push({ backend, software, variant, format, exports });
        console.log("Parallel original root:", name);
      }
  return reports;
}
