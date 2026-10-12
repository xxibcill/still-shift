import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import {
  compileMechanismCueProject,
  patchMechanismCueAuthoring,
  readMechanismCueAuthoring,
} from "@still-shift/animation-engine";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";
import {
  prepareMechanismCueNativePlates,
  checkMechanismCueNativePlates,
} from "../../packages/animation-engine/src/mechanism/cue-native-plates.ts";
import { nativePlateCancellationProof } from "../helpers/mechanism-native-plate-cancellation.ts";
import { parallelOutputProof } from "../helpers/composition-parallel-proof.ts";
const directory = await mkdtemp("/private/tmp/still-shift-ms2-native-plates-");
const families: unknown[] = [];
try {
  for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
    const base = join(directory, family),
      fixture = await createCueProjectFixture(base, family),
      compiledDirectory = join(base, "compiled"),
      platesDirectory = join(base, "plates");
    await compileMechanismCueProject(
      fixture.familyPath,
      fixture.cuePath,
      compiledDirectory,
    );
    const capture = await prepareMechanismCueNativePlates(
      fixture.familyPath,
      fixture.cuePath,
      compiledDirectory,
      platesDirectory,
    );
    const original = await checkMechanismCueNativePlates(
      fixture.familyPath,
      fixture.cuePath,
      compiledDirectory,
      platesDirectory,
    );
    assert.equal(original.originalNativeFrames, 60);
    assert.equal(original.originalNativePasses, 60);
    const result = JSON.parse(
      await readFile(capture.receipt.renderResult.path, "utf8"),
    );
    const proof = await parallelOutputProof(
      capture.receipt.sequence.path,
      result.metrics,
    );
    assert.equal(proof.encoded.length, 60);
    assert.equal(proof.decodedFrames.length, 60);
    const current = await readMechanismCueAuthoring(
      fixture.instance,
      fixture.cuePath,
    );
    await patchMechanismCueAuthoring(fixture.instance, fixture.cuePath, {
      schemaVersion: "mechanism-cue-patch-1",
      baseRevision: current.document.revision,
      baseHash: current.projectHash,
      operations: [
        { cue: "contact", property: "caption", value: "Here" },
        { cue: "contact", sound: "tick", property: "sound-gain", value: -6 },
      ],
    });
    const editedDirectory = join(base, "edited");
    await compileMechanismCueProject(
      fixture.familyPath,
      fixture.cuePath,
      editedDirectory,
    );
    const edited = await checkMechanismCueNativePlates(
      fixture.familyPath,
      fixture.cuePath,
      editedDirectory,
      platesDirectory,
    );
    assert.equal(edited.nativePictureSha256, original.nativePictureSha256);
    assert.equal(edited.sequenceSha256, original.sequenceSha256);
    const framePath = capture.receipt.sequence.path.replace("%06d", "000020"),
      frame = await readFile(framePath);
    await writeFile(framePath, Buffer.concat([frame, Buffer.from([0])]));
    await assert.rejects(
      () =>
        checkMechanismCueNativePlates(
          fixture.familyPath,
          fixture.cuePath,
          editedDirectory,
          platesDirectory,
        ),
      /hash|changed/,
    );
    await writeFile(framePath, frame);
    const capturedSource = JSON.parse(
      await readFile(capture.receipt.nativeSource.path, "utf8"),
    ) as { assets: { id: string; path: string }[] };
    const mutatedArtifacts = [
      ...(
        [
          "originalCompilation",
          "originalSource",
          "nativeSource",
          "sceneManifest",
          "renderResult",
        ] as const
      ).map((key) => ({ key, path: capture.receipt[key].path })),
      { key: "sequenceManifest", path: capture.receipt.sequence.manifestPath },
      {
        key: "nativeClosure",
        path: capture.receipt.sequence.path + ".native-observations.json",
      },
      {
        key: "nativeShard",
        path: capture.receipt.sequence.path + ".native-observations.000.ndjson",
      },
      ...capturedSource.assets.map((asset) => ({
        key: "dependency." + asset.id,
        path: asset.path,
      })),
    ];
    const mutationControls: { key: string; error: string }[] = [];
    for (const artifact of mutatedArtifacts) {
      const body = await readFile(artifact.path);
      try {
        await writeFile(artifact.path, Buffer.concat([body, Buffer.from([0])]));
        let rejected: unknown;
        try {
          await checkMechanismCueNativePlates(
            fixture.familyPath,
            fixture.cuePath,
            editedDirectory,
            platesDirectory,
          );
        } catch (error) {
          rejected = error;
        }
        assert(
          rejected instanceof Error,
          "Altered original artifact must reject: " + artifact.key,
        );
        mutationControls.push({ key: artifact.key, error: String(rejected) });
      } finally {
        await writeFile(artifact.path, body);
      }
    }
    assert.equal(
      (
        await checkMechanismCueNativePlates(
          fixture.familyPath,
          fixture.cuePath,
          editedDirectory,
          platesDirectory,
        )
      ).sequenceSha256,
      original.sequenceSha256,
    );
    const next = await readMechanismCueAuthoring(
      fixture.instance,
      fixture.cuePath,
    );
    await patchMechanismCueAuthoring(fixture.instance, fixture.cuePath, {
      schemaVersion: "mechanism-cue-patch-1",
      baseRevision: next.document.revision,
      baseHash: next.projectHash,
      operations: [
        {
          cue: "contact",
          property: "camera",
          value: {
            camera: { ...fixture.instance.scene.camera, position: [8, 5, 2] },
            editing: "cut",
          },
        },
      ],
    });
    const cameraDirectory = join(base, "camera");
    await compileMechanismCueProject(
      fixture.familyPath,
      fixture.cuePath,
      cameraDirectory,
    );
    await assert.rejects(
      () =>
        checkMechanismCueNativePlates(
          fixture.familyPath,
          fixture.cuePath,
          cameraDirectory,
          platesDirectory,
        ),
      /picture/,
    );
    const canceled = join(base, "canceled"),
      controller = new AbortController(),
      reason = Error("plate pre-abort");
    controller.abort(reason);
    await assert.rejects(
      () =>
        prepareMechanismCueNativePlates(
          fixture.familyPath,
          fixture.cuePath,
          cameraDirectory,
          canceled,
          { signal: controller.signal },
        ),
      (error) => error === reason,
    );
    await assert.rejects(() => access(canceled));
    families.push({
      family,
      capture,
      original,
      edited,
      proof,
      mutationControls,
      frameMutationRejected: true,
      cameraInvalidationRejected: true,
      preAbortNoOutput: true,
    });
  }
  const cancellation = await nativePlateCancellationProof();
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify({ status: "passed", families, cancellation }, null, 2) +
      "\n",
  );
  process.stdout.write(
    JSON.stringify({ status: "passed", directory, families: families.length }) +
      "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      { status: "failed", error: String(error), families },
      null,
      2,
    ) + "\n",
  );
  throw error;
}
