import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createNativePbrMixedFixture } from "../helpers/native-pbr-mixed-fixture.ts";
import { proveNativeExportV3HTTP } from "../helpers/native-pbr-export-http-proof.ts";
import { loadComposition } from "@still-shift/animation-engine";
import { createNativeObservationRequestVersions } from "../../packages/animation-engine/src/native-observation.ts";
import { isNativeObservationRequestV3 } from "@still-shift/execution-runtime/export";
const { root, directory } = await createNativePbrMixedFixture();
try {
  const loaded = await loadComposition(
      join(directory, "composition.json"),
      "webgl2",
    ),
    binding = await createNativeObservationRequestVersions(loaded);
  assert.ok(binding && isNativeObservationRequestV3(binding));
  const expected = binding.expectedPasses(2);
  assert.equal(expected.length, 9);
  assert.deepEqual(
    new Set(expected.map((pass) => pass.version)),
    new Set(["native3d-frame-1", "native3d-frame-2", "native3d-frame-3"]),
  );
  assert.ok(
    expected.some(
      (pass) =>
        pass.version === "native3d-frame-3" &&
        !Number.isInteger(pass.sampleFrame),
    ),
  );
  assert.notEqual(binding.expectedPasses(2), expected);
  const controller = new AbortController();
  controller.abort(Error("producer3-cancelled"));
  await assert.rejects(
    createNativeObservationRequestVersions(loaded, undefined, {
      signal: controller.signal,
    }),
    /producer3-cancelled/,
  );
  await assert.rejects(
    createNativeObservationRequestVersions({
      ...loaded,
      nativeAppearanceCodeSha256: `sha256:${"a".repeat(64)}`,
    }),
  );
  const http = await proveNativeExportV3HTTP(root, directory);
  assert.equal(http.length, 8);
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "actual mixed source1/source2/source3 fractional exposure export, authenticated HTTP faults and independent retained-row/pixel replay; installed/whole-world proof pending",
        expectedProtocols: [...new Set(expected.map((pass) => pass.version))],
        http,
        supportedPacks: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({ directory, status: "passed", runs: http.length }) + "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        status: "failed",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stderr.write(JSON.stringify({ directory, status: "failed" }) + "\n");
  throw error;
}
