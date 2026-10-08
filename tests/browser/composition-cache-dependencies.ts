import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import type { Composition } from "@still-shift/scene-contract";
import { mediaRgbaPng } from "../helpers/composition-media-png.ts";
import {
  parallelChecksum,
  parallelOutputProof,
} from "../helpers/composition-parallel-proof.ts";

const directory = await mkdtemp(join(tmpdir(), "ce15-cache-dependencies-"));
const image = mediaRgbaPng(16, 16, Buffer.alloc(16 * 16 * 4, 137));
await writeFile(join(directory, "image.png"), image);
const reports = [];
for (const backend of ["canvas2d", "webgl2"] as const)
  for (const variant of [
    "unrelated-expression",
    "expression-only-motion",
    "constant-expression",
    "constant-keys",
    "changing-expression",
    "changing-camera",
  ] as const) {
    const composition: Composition = {
      schemaVersion: "composition-1",
      id: "dependencies",
      width: 32,
      height: 24,
      fps: 60,
      frameCount: 8,
      background: "#22446680",
      assets: [
        {
          id: "image",
          type: "image",
          path: "image.png",
          sha256: parallelChecksum(image),
          width: 16,
          height: 16,
        },
      ],
      layers: [
        {
          id: "moving",
          type: "image",
          size: [16, 16],
          sources: [{ asset: "image" }],
          transform: {
            anchor: [0, 0],
            position: {
              keys: [
                { frame: 0, value: [1.25, 1.35] },
                { frame: 7, value: [13.45, 8.65] },
              ],
            },
          },
        },
        {
          id: "floor",
          type: "solid",
          size: [21, 17],
          color: "#bb773380",
          transform: { anchor: [0, 0], position: [2.25, 3.45], rotation: 17.3 },
        },
      ],
      ...(variant === "changing-camera"
        ? {
            camera2d: {
              keys: [
                { frame: 0, x: 0, y: 0, zoom: 1 },
                { frame: 7, x: 3, y: 2, zoom: 1 },
              ],
            },
          }
        : {
            expressions: {
              [variant === "unrelated-expression" ||
              variant === "expression-only-motion"
                ? "moving.transform.rotation"
                : "floor.transform.rotation"]: {
                source:
                  variant === "constant-expression"
                    ? "17.3"
                    : "17.3 + time * 100",
              },
            },
          }),
    };
    if (variant === "expression-only-motion")
      composition.layers[0]!.transform!.position = [1.25, 1.35];
    if (variant === "constant-keys") {
      delete composition.expressions;
      composition.layers[1]!.transform!.rotation = {
        keys: [
          { frame: 0, value: 17.3 },
          { frame: 7, value: 17.3 },
        ],
      };
    }
    const path = join(directory, `${backend}-${variant}.json`);
    await writeFile(path, JSON.stringify(composition));
    let expected;
    for (const workers of [undefined, 1, 4] as const) {
      const outputPath = join(
        directory,
        `${backend}-${variant}-${workers ?? "baseline"}.%06d.png`,
      );
      const { metrics } = await renderComposition({
        compositionPath: path,
        outputPath,
        backend,
        format: "png8",
        transport: "raw_rgba",
        ...(workers ? { workers } : {}),
      });
      const proof = await parallelOutputProof(outputPath, metrics);
      if (expected) assert.deepEqual(proof, expected);
      else expected = proof;
      assert.equal(new Set(proof.decodedFrames).size, 8);
      if (workers) {
        const prefixes = metrics
          .work!.workersDetail.flatMap(
            (worker) => worker.result.rootStatistics!.roots,
          )
          .filter((root) => root.phase === "prefix");
        if (variant !== "changing-expression")
          assert.equal(
            prefixes.reduce((sum, row) => sum + row.paints, 0),
            1,
          );
        if (
          variant === "unrelated-expression" ||
          variant === "expression-only-motion" ||
          variant === "constant-expression" ||
          variant === "constant-keys"
        ) {
          assert.equal(
            prefixes.reduce((sum, row) => sum + row.restores, 0),
            workers - 1,
          );
          assert.ok(prefixes.every((row) => row.fallbacks === 0));
        } else {
          const roots = metrics.work!.workersDetail.flatMap(
            (worker) => worker.result.rootStatistics!.roots,
          );
          assert.ok(roots.some((row) => row.fallbacks > 0));
        }
      }
      reports.push({ backend, variant, workers, proof, metrics });
      console.log(
        JSON.stringify({ backend, variant, workers, status: "passed" }),
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
