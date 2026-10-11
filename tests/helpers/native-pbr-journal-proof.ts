import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  NativeObservationExecutionV3Schema,
  NativeObservationSinkV3,
  verifyNativeObservationClosureV3,
  type NativeObservationExpectedPassV3,
} from "../../packages/execution-runtime/src/native-observation-v3.ts";
import {
  nativeCompositionSha256,
  nativePreparedSha256,
} from "../../packages/animation-engine/src/native-observation-identity.ts";
import { compositionNativePasses } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import { resolveNative3DVariantVersions } from "../../packages/renderer-core/src/native3d/catalogue-versions.ts";
import { nativeCompositionObservationCapacityV3 } from "../../packages/renderer-core/src/native3d/observation-capacity-v3.ts";
import type { LoadedComposition } from "../../packages/animation-engine/src/composition-render.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import type { NativeObservedOutputFrameV3 } from "@still-shift/scene-contract";
const hash = (value: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
/** Real receipt/one-frame raw journal proof; normal export dispatch is still separate. */
export async function nativePbrJournalProof(
  loaded: LoadedComposition,
  diagnostic: NativeObservedOutputFrameV3,
  pixels: Uint8Array,
  directory: string,
) {
  assert.equal(diagnostic.outputFrame, 0);
  assert.ok(
    loaded.native3D &&
      loaded.preparedNative3D &&
      loaded.nativeAppearanceCodeIdentity &&
      loaded.nativeAppearanceCodeSha256,
  );
  const catalogue = loaded.native3D;
  const execution = NativeObservationExecutionV3Schema.parse({
    version: "native-observation-execution-3",
    compositionSourceSha256: loaded.sourceChecksum,
    compositionSha256: nativeCompositionSha256(loaded.composition),
    preparedNativeSha256: nativePreparedSha256(loaded.preparedNative3D),
    appearanceCodeSha256: loaded.nativeAppearanceCodeSha256,
    appearanceCodeIdentity: loaded.nativeAppearanceCodeIdentity,
    backend: "webgl2",
    profile: "native-three-aces-hdr-msaa4-1",
    sources: Object.entries(catalogue).flatMap(([asset, scene]) =>
      Object.values(scene.variants).map((variant) => ({
        asset,
        sourceVersion: variant.source.schemaVersion,
        sourceKey: variant.sourceKey,
        sourceSha256: variant.sourceSha256,
        originalGeometrySha256: variant.originalGeometrySha256,
        effectiveSceneSha256: variant.effectiveSceneSha256,
        geometrySha256: variant.geometrySha256,
        meshDataSha256: variant.meshDataSha256,
        ...(variant.version === "prepared-native3d-variant-2"
          ? { shapeAssociations: Object.values(variant.shapeAssociations) }
          : {}),
      })),
    ),
  });
  const graphOptions = {
    preparedNative3D: catalogue,
    nativeObservationRequired: true as const,
  };
  const expectedPasses = (
    outputFrame: number,
  ): NativeObservationExpectedPassV3[] => {
    assert.equal(outputFrame, 0);
    return [
      ...compositionNativePasses(loaded.composition, outputFrame, graphOptions),
    ].map((pass) => {
      const variant = resolveNative3DVariantVersions(catalogue, pass.frame);
      if (
        pass.frame.version !== "native3d-frame-3" ||
        variant.version !== "prepared-native3d-variant-3"
      )
        throw Error("Scoped journal fixture requires actual source3 passes");
      return {
        version: "native3d-frame-3",
        sampleFrame: pass.sampleFrame,
        appearanceCodeSha256: execution.appearanceCodeSha256,
        reference: pass.frame,
        variant,
      };
    });
  };
  const maximumPacketBytes = nativeCompositionObservationCapacityV3(
    loaded.composition,
    0,
    graphOptions,
  );
  const memory = new ManagedMemory({ pixels: 1, metadata: 16 * 1024 ** 2 });
  let reserved = 0,
    peak = 0;
  const reserve = (bytes: number) => {
    const lease = memory.reserve("metadata", bytes);
    reserved += bytes;
    peak = Math.max(peak, reserved);
    let active = true;
    return {
      release() {
        if (active) {
          active = false;
          reserved -= bytes;
          lease.release();
        }
      },
    };
  };
  const create = (id: string) =>
    new NativeObservationSinkV3({
      outputPath: join(directory, id + ".rgba"),
      exportId: id,
      frameCount: 1,
      maximumPacketBytes,
      execution,
      expectedPasses,
      reserve,
    });
  const positives = [];
  for (let take = 0; take < 2; take++) {
    const id = `journal3-${take}`,
      sink = create(id);
    try {
      const packet = { ...diagnostic, executionSha256: sink.executionSha256 };
      const bytes = Buffer.from(JSON.stringify(packet));
      const accepting = sink.acceptPacket(0, bytes);
      assert.throws(() => sink.requirePacket(0, 0), /matching assigned/);
      await accepting;
      sink.requirePacket(0, 0);
      await sink.commitPixel(0, 0, {
        transport: "raw_rgba",
        byteLength: pixels.length,
        transportBytesSha256: hash(pixels),
      });
      const output = {
        sha256: hash(pixels),
        frameCount: 1,
        width: loaded.composition.width,
        height: loaded.composition.height,
        transport: "raw_rgba" as const,
      };
      const closure = await sink.finalize(
        { outputFrames: 1, passCount: packet.passes.length },
        output,
      );
      await writeFile(join(directory, id + ".rgba"), pixels, { flag: "wx" });
      for (const publication of sink.publications)
        await rename(publication.staged, publication.destination);
      const verified = await verifyNativeObservationClosureV3({
        closure,
        execution,
        expectedPasses,
        output,
      });
      positives.push({
        packetSha256: hash(bytes),
        pixelSha256: hash(pixels),
        executionSha256: sink.executionSha256,
        closure,
        verified,
      });
    } finally {
      await sink.dispose();
    }
    assert.equal(reserved, 0);
  }
  assert.equal(positives[0]!.packetSha256, positives[1]!.packetSha256);
  const negatives = [];
  for (const id of [
    "diagnostic-identity",
    "sample-clock",
    "material-hash",
    "submitted-matrix",
    "missing-passes",
  ] as const) {
    const sink = create("bad-" + id);
    try {
      const packet = structuredClone({
        ...diagnostic,
        executionSha256: sink.executionSha256,
      });
      const receipt = packet.passes[0]!.observed;
      if (receipt.version !== "native3d-observed-frame-3")
        throw Error("Expected actual source3");
      const drawn = Object.values(receipt.meshes).find(
        (mesh) => mesh.status === "drawn",
      );
      if (!drawn || drawn.status !== "drawn")
        throw Error("Expected actual draw");
      if (id === "diagnostic-identity")
        packet.executionSha256 = diagnostic.executionSha256;
      else if (id === "sample-clock") packet.passes[0]!.sampleFrame += 0.25;
      else if (id === "material-hash")
        drawn.submissions[0]!.materialSha256 = `sha256:${"f".repeat(64)}`;
      else if (id === "submitted-matrix")
        Object.defineProperty(drawn.submissions[0]!.modelViewMatrix, 12, {
          value: drawn.submissions[0]!.modelViewMatrix[12] + 1,
        });
      else packet.passes = [];
      let message: string | undefined;
      try {
        await sink.acceptPacket(0, Buffer.from(JSON.stringify(packet)));
      } catch (error) {
        message = String(error);
      }
      assert.ok(message, `Forged ${id} was accepted`);
      assert.throws(() => sink.requirePacket(0, 0));
      assert.throws(() => sink.publications, /not complete/);
      negatives.push({ id, message });
    } finally {
      await sink.dispose();
    }
    assert.equal(reserved, 0);
  }
  // Replay must freshly validate expected source binding and packet bytes.
  await assert.rejects(
    verifyNativeObservationClosureV3({
      closure: positives[0]!.closure,
      execution: {
        ...execution,
        sources: execution.sources.map((source) => ({
          ...source,
          meshDataSha256: `sha256:${"f".repeat(64)}`,
        })),
      },
      expectedPasses,
      output: {
        sha256: hash(pixels),
        frameCount: 1,
        width: loaded.composition.width,
        height: loaded.composition.height,
        transport: "raw_rgba",
      },
    }),
  );
  return {
    scope:
      "standalone actual source3 one-frame raw journal and replay; normal export dispatch pending",
    execution,
    maximumPacketBytes,
    positives,
    negatives,
    memory: { current: reserved, peak, bounded: memory.statistics },
  };
}
