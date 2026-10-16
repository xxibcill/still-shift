import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import { createNativeCompositionV2ProofFixture } from "./native3d-composition-v2.ts";
import { proveNativeExportV2HTTP } from "../helpers/native3d-export-v2-proof.ts";
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const { directory, root } = await createNativeCompositionV2ProofFixture(
  "/private/tmp/still-shift-ms2-normal-export2-",
);
const exports = [];
try {
  for (const name of ["normal2-a", "normal2-b"]) {
    const result = await renderComposition({
      compositionPath: join(directory, "composition.json"),
      outputPath: join(directory, name + ".mp4"),
      backend: "webgl2",
      transport: "raw_rgba",
    });
    const closure = result.metrics.nativeObservations;
    assert.equal(closure?.version, "native-observation-closure-2");
    assert.ok(closure);
    assert.equal(closure.outputFrames, 6);
    assert.equal(closure.passCount, 36);
    assert.equal(
      result.checksums.output,
      hash(await readFile(result.outputPath)),
    );
    const manifest = JSON.parse(await readFile(closure.manifestPath, "utf8"));
    assert.equal(manifest.version, "native-observation-manifest-2");
    assert.equal(manifest.execution.version, "native-observation-execution-2");
    assert.equal(manifest.output.sha256, result.checksums.output);
    exports.push({ name, result });
  }
  const fixture = JSON.parse(
    await readFile(join(directory, "composition.json"), "utf8"),
  );
  await writeFile(
    join(directory, "unused.json"),
    JSON.stringify({ ...fixture, frameCount: 1, layers: [] }),
    { flag: "wx" },
  );
  const unused = await renderComposition({
    compositionPath: join(directory, "unused.json"),
    outputPath: join(directory, "unused2.mp4"),
    backend: "webgl2",
    transport: "raw_rgba",
  });
  assert.equal(
    unused.metrics.nativeObservations?.version,
    "native-observation-closure-2",
  );
  assert.equal(unused.metrics.nativeObservations?.outputFrames, 1);
  assert.equal(unused.metrics.nativeObservations?.passCount, 0);
  const http = await proveNativeExportV2HTTP(root, directory);
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        scope: "normal-authenticated-composition2-final-export-generic-fixture",
        exports,
        http,
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
