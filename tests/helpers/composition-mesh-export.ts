import { writeFile, access } from "node:fs/promises";
import {
  type AnimationEngineError,
  type Composition,
} from "@still-shift/scene-contract";
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

/** Structured renderer diagnostics survive actual worker transport and failed export cleanup. */
export async function checkMeshDiagnosticExports(directory: string) {
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const workers of [1, 4] as const)
      for (const kind of ["pin", "flip"] as const) {
        const prefix = `diagnostic-${backend}-${workers}-${kind}`;
        const compositionPath = join(directory, `${prefix}.json`);
        const outputPath = join(directory, `${prefix}.mp4`);
        const composition: Composition = {
          schemaVersion: "composition-1",
          id: prefix,
          width: 32,
          height: 32,
          fps: 24,
          frameCount: 4,
          assets: [],
          layers: [
            {
              id: "art",
              type: "solid",
              size: [4, 4],
              color: "#ffffff",
              transform: { anchor: [0, 0] },
              effects: [
                kind === "pin"
                  ? {
                      id: "deform",
                      effect: "distort.puppet",
                      params: { rest: [[10, 10]], pins: [[10, 10]] },
                    }
                  : {
                      id: "deform",
                      effect: "distort.mesh-warp",
                      params: {
                        size: [4, 4],
                        controls: [
                          [0, 0],
                          [-1, 0],
                          [0, 1],
                          [-1, 1],
                        ],
                      },
                    },
              ],
            },
          ],
        };
        await writeFile(compositionPath, JSON.stringify(composition));
        let failed = false;
        try {
          await renderComposition({
            compositionPath,
            outputPath,
            backend,
            workers,
          });
        } catch (error) {
          failed = true;
          assert.ok(error instanceof Error);
          const failure = error as AnimationEngineError;
          assert.equal(
            failure.code,
            "RENDER_FAILED",
            `${prefix}: ${String(error)}`,
          );
          const code = kind === "pin" ? "comp-mesh-pin" : "comp-mesh-flip";
          const path = `layers.0.effects.0.params.${kind === "pin" ? "rest.0" : "controls"}`;
          assert.equal(failure.context?.diagnostic, code);
          assert.equal(failure.context?.path, path);
          assert.equal(failure.context?.node, "art");
          assert.ok(Number.isInteger(failure.context?.frame));
          const diagnostics = JSON.parse(
            failure.context!.diagnostics as string,
          );
          assert.equal(diagnostics[0].code, code);
          assert.equal(diagnostics[0].path, path);
          reports.push({ backend, workers, kind, diagnostics });
          console.log("Mesh diagnostic export:", backend, workers, kind);
        }
        assert.ok(failed, "Invalid mesh export must reject");
        for (const file of [
          outputPath,
          `${outputPath}.scene.json`,
          `${outputPath}.result.json`,
        ])
          await assert.rejects(access(file), { code: "ENOENT" });
      }
  return reports;
}
