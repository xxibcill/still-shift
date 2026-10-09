import { writeFile, access } from "node:fs/promises";
import {
  type AnimationEngineError,
  type Composition,
} from "@still-shift/scene-contract";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import {
  parallelChecksum,
  parallelOutputProof,
} from "./composition-parallel-proof.ts";

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

/** Real exports retain empty collapsed frames and recover identically across workers/cache modes. */
export async function checkCollapsedMeshExports(directory: string) {
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "collapsed-mesh-export",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 4,
    background: "#000000",
    assets: [],
    layers: [
      {
        id: "art",
        type: "solid",
        size: [16, 16],
        color: "#aa5522",
        transform: {
          anchor: [0, 0],
          position: [8, 8],
          scale: {
            keys: [
              { frame: 0, value: [1, 1] },
              { frame: 1, value: [0, 0] },
              { frame: 2, value: [0, 0] },
              { frame: 3, value: [1, 1] },
            ],
          },
        },
      },
    ],
  };
  const empty = new Uint8Array(composition.width * composition.height * 4);
  for (let i = 3; i < empty.length; i += 4) empty[i] = 255;
  const emptyHash = parallelChecksum(empty);
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const referencePath = join(directory, `collapsed-${backend}-ordinary.json`);
    const referenceOutput = join(
      directory,
      `collapsed-${backend}-ordinary.mp4`,
    );
    await writeFile(referencePath, JSON.stringify(composition));
    const ordinary = await renderComposition({
      compositionPath: referencePath,
      outputPath: referenceOutput,
      backend,
      workers: 1,
      cacheStatic: true,
    });
    const reference = await parallelOutputProof(
      referenceOutput,
      ordinary.metrics,
    );
    assert.equal(reference.decodedFrames.length, 4);
    assert.equal(reference.decodedFrames[1], emptyHash);
    assert.equal(reference.decodedFrames[2], emptyHash);
    assert.notEqual(reference.decodedFrames[0], emptyHash);
    assert.notEqual(reference.decodedFrames[3], emptyHash);
    for (const kind of ["distort.puppet", "distort.mesh-warp"] as const) {
      const fixture = structuredClone(composition);
      fixture.layers[0]!.effects = [
        {
          id: "mesh",
          effect: kind,
          params:
            kind === "distort.puppet"
              ? {
                  rest: [
                    [4, 4],
                    [12, 4],
                    [8, 12],
                  ],
                  pins: [
                    [4, 4],
                    [12, 4],
                    [8, 12],
                  ],
                  refinement: 0,
                }
              : { size: [16, 16], subdivisions: 4 },
        },
      ];
      const compositionPath = join(
        directory,
        `collapsed-${backend}-${kind}.json`,
      );
      await writeFile(compositionPath, JSON.stringify(fixture));
      let baseline: Awaited<ReturnType<typeof parallelOutputProof>> | undefined;
      for (const [workers, cacheStatic] of [
        [1, true],
        [1, true],
        [4, true],
        [4, false],
      ] as const) {
        const outputPath = join(
          directory,
          `collapsed-${backend}-${reports.length}.mp4`,
        );
        const result = await renderComposition({
          compositionPath,
          outputPath,
          backend,
          workers,
          cacheStatic,
        });
        const proof = await parallelOutputProof(outputPath, result.metrics);
        assert.deepEqual(
          proof.decodedFrames,
          reference.decodedFrames,
          `${backend}/${kind}: ordinary frame parity`,
        );
        if (baseline)
          assert.deepEqual(
            proof,
            baseline,
            `${backend}/${kind}/${workers}/${cacheStatic}`,
          );
        else baseline = proof;
        reports.push({
          backend,
          kind,
          workers,
          cacheStatic,
          proof,
          emptyHash,
          metrics: result.metrics,
        });
        console.log(
          "Collapsed mesh production export:",
          backend,
          kind,
          workers,
          cacheStatic,
        );
      }
    }
  }
  return reports;
}

/** Original zero scale remains authoritative after rotated parent/child products. */
export async function checkRotatedParentMeshExports(directory: string) {
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "rotated-parent-mesh-export",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 4,
    background: "#000000",
    assets: [],
    layers: [
      {
        id: "parent",
        type: "null",
        transform: {
          anchor: [0, 0],
          position: [16, 8],
          rotation: 37,
          scale: {
            keys: [
              { frame: 0, value: [1, 1] },
              { frame: 1, value: [0, 1] },
              { frame: 2, value: [0, 1] },
              { frame: 3, value: [1, 1] },
            ],
          },
        },
      },
      {
        id: "art",
        type: "solid",
        parent: "parent",
        size: [16, 16],
        color: "#aa5522",
        transform: { anchor: [0, 0], rotation: 29 },
      },
    ],
  };
  const empty = new Uint8Array(composition.width * composition.height * 4);
  for (let i = 3; i < empty.length; i += 4) empty[i] = 255;
  const emptyHash = parallelChecksum(empty);
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const referencePath = join(
      directory,
      `rotated-parent-${backend}-ordinary.json`,
    );
    const referenceOutput = join(
      directory,
      `rotated-parent-${backend}-ordinary.mp4`,
    );
    await writeFile(referencePath, JSON.stringify(composition));
    const ordinary = await renderComposition({
      compositionPath: referencePath,
      outputPath: referenceOutput,
      backend,
      workers: 1,
      cacheStatic: true,
    });
    const reference = await parallelOutputProof(
      referenceOutput,
      ordinary.metrics,
    );
    assert.equal(reference.decodedFrames[1], emptyHash);
    assert.equal(reference.decodedFrames[2], emptyHash);
    assert.notEqual(reference.decodedFrames[0], emptyHash);
    assert.notEqual(reference.decodedFrames[3], emptyHash);
    for (const kind of ["distort.puppet", "distort.mesh-warp"] as const) {
      const fixture = structuredClone(composition);
      fixture.layers[1]!.effects = [
        {
          id: "mesh",
          effect: kind,
          params:
            kind === "distort.puppet"
              ? {
                  rest: [
                    [4, 4],
                    [12, 4],
                    [8, 12],
                  ],
                  pins: [
                    [4, 4],
                    [12, 4],
                    [8, 12],
                  ],
                  refinement: 0,
                }
              : // Include antialiased source edge pixels outside the artwork's exact rectangle.
                { origin: [-2, -2], size: [20, 20], subdivisions: 4 },
        },
      ];
      const compositionPath = join(
        directory,
        `rotated-parent-${backend}-${kind}.json`,
      );
      await writeFile(compositionPath, JSON.stringify(fixture));
      let baseline: Awaited<ReturnType<typeof parallelOutputProof>> | undefined;
      for (const workers of [1, 4] as const) {
        const cacheStatic = workers === 1;
        const outputPath = join(
          directory,
          `rotated-parent-${backend}-${reports.length}.mp4`,
        );
        const result = await renderComposition({
          compositionPath,
          outputPath,
          backend,
          workers,
          cacheStatic,
        });
        const proof = await parallelOutputProof(outputPath, result.metrics);
        assert.deepEqual(
          proof.decodedFrames,
          reference.decodedFrames,
          `${backend}/${kind}: rotated parent ordinary parity`,
        );
        if (baseline)
          assert.deepEqual(
            proof,
            baseline,
            `${backend}/${kind}/${workers}/${cacheStatic}`,
          );
        else baseline = proof;
        reports.push({
          backend,
          kind,
          workers,
          cacheStatic,
          proof,
          emptyHash,
          metrics: result.metrics,
        });
        console.log(
          "Rotated parent mesh production export:",
          backend,
          kind,
          workers,
          cacheStatic,
        );
      }
    }
  }
  return reports;
}
