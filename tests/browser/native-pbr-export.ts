import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import { createNativePbrCompositionFixture } from "../helpers/native-pbr-composition-fixture.ts";
const hash = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const { directory, composition } = await createNativePbrCompositionFixture(
  "/private/tmp/still-shift-ms2-normal-export3-",
);
const exports = [];
try {
  for (const name of ["normal3-a", "normal3-b"]) {
    const result = await renderComposition({
      compositionPath: join(directory, "composition.json"),
      outputPath: join(directory, name + ".mp4"),
      backend: "webgl2",
      transport: "raw_rgba",
    });
    const closure = result.metrics.nativeObservations;
    assert.equal(closure?.version, "native-observation-closure-3");
    assert.ok(closure);
    assert.equal(closure.outputFrames, 11);
    assert.equal(closure.passCount, 11);
    assert.equal(
      result.checksums.output,
      hash(await readFile(result.outputPath)),
    );
    const manifest = JSON.parse(await readFile(closure.manifestPath, "utf8"));
    assert.equal(manifest.version, "native-observation-manifest-3");
    assert.equal(manifest.execution.version, "native-observation-execution-3");
    assert.equal(manifest.output.sha256, result.checksums.output);
    assert.equal(
      manifest.execution.sources[0].sourceVersion,
      "mechanism-scene-3",
    );
    exports.push({ name, result });
  }
  await writeFile(
    join(directory, "unused.json"),
    JSON.stringify({ ...composition, frameCount: 1, layers: [] }),
    { flag: "wx" },
  );
  const unused = await renderComposition({
    compositionPath: join(directory, "unused.json"),
    outputPath: join(directory, "unused3.mp4"),
    backend: "webgl2",
    transport: "raw_rgba",
  });
  assert.equal(
    unused.metrics.nativeObservations?.version,
    "native-observation-closure-3",
  );
  assert.equal(unused.metrics.nativeObservations?.passCount, 0);
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "normal authenticated source3 production export; mixed protocols, faults, installed and whole-world budgets pending",
        exports,
        unused,
        supportedPacks: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({ directory, status: "passed", exports: exports.length }) +
      "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        status: "failed",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        exports,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stderr.write(
    JSON.stringify({ directory, status: "failed", exports: exports.length }) +
      "\n",
  );
  throw error;
}
