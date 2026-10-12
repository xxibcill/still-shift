import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { join, basename } from "node:path";
import {
  NativeObservedOutputFrameV2Schema,
  type NativeObservedOutputFrameV2,
} from "@still-shift/scene-contract";
import {
  NativeObservationSinkV2,
  NativeObservationExecutionV2Schema,
  verifyNativeObservationClosureV2,
  type NativeObservationExpectedPassV2,
} from "../../packages/execution-runtime/src/native-observation-v2.ts";
import type { readCompositionSource } from "../../packages/animation-engine/src/composition-source.ts";
import {
  nativeCompositionSha256,
  nativePreparedSha256,
} from "../../packages/animation-engine/src/native-observation.ts";
import { compositionNativePasses } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import { resolveNative3DVariantVersions } from "../../packages/renderer-core/src/native3d/catalogue-versions.ts";
import { nativeCompositionObservationCapacityV2 } from "../../packages/renderer-core/src/native3d/observation-capacity-v2.ts";
import type { nativeCompositionJournalV2Frames } from "./native3d-composition-v2-proof.ts";
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
type Loaded = Awaited<ReturnType<typeof readCompositionSource>>;
type Captures = Awaited<ReturnType<typeof nativeCompositionJournalV2Frames>>;
/** Actual preview RGBA/used-stream receipts only; the normal authenticated movie export remains a separate gate. */
export async function verifyNativeJournalV2Proof(
  loaded: Loaded,
  captures: Captures,
  directory: string,
) {
  const sources = Object.entries(loaded.native3D!).flatMap(([asset, scene]) =>
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
  );
  const execution = NativeObservationExecutionV2Schema.parse({
    version: "native-observation-execution-2",
    compositionSourceSha256: loaded.sourceChecksum,
    compositionSha256: nativeCompositionSha256(loaded.composition),
    preparedNativeSha256: nativePreparedSha256(loaded.preparedNative3D!),
    appearanceCodeSha256: loaded.nativeAppearanceCodeSha256,
    appearanceCodeIdentity: loaded.nativeAppearanceCodeIdentity,
    backend: "webgl2",
    profile: "native-three-aces-hdr-msaa4-1",
    sources,
  });
  const expectedPasses = (
    outputFrame: number,
  ): NativeObservationExpectedPassV2[] =>
    [
      ...compositionNativePasses(loaded.composition, outputFrame, {
        preparedNative3D: loaded.native3D!,
        nativeObservationRequired: true,
      }),
    ].map((pass) => {
      const frame = pass.frame,
        variant = resolveNative3DVariantVersions(loaded.native3D, frame);
      if (
        frame.version === "native3d-frame-2" &&
        variant.version === "prepared-native3d-variant-2"
      )
        return {
          version: frame.version,
          sampleFrame: pass.sampleFrame,
          appearanceCodeSha256: execution.appearanceCodeSha256,
          reference: frame,
          variant,
        };
      assert.equal(frame.version, "native3d-frame-1");
      assert.equal(variant.version, "prepared-native3d-variant-1");
      if (
        frame.version !== "native3d-frame-1" ||
        variant.version !== "prepared-native3d-variant-1"
      )
        throw Error("Wrong source/frame association");
      return {
        version: frame.version,
        asset: frame.asset,
        variant,
        legacy: {
          sampleFrame: pass.sampleFrame,
          frameKey: frame.frameKey,
          controller: frame.controller,
          scope: frame.scope,
          scopeFrame: frame.scopeFrame,
          sourceFrame: frame.sourceFrame,
          sourceSha256: frame.sourceSha256,
          effectiveSceneSha256: frame.effectiveSceneSha256,
          geometrySha256: frame.geometrySha256,
          appearanceCodeSha256: execution.appearanceCodeSha256,
          viewport: [0, 0, pass.width, pass.height],
          parts: Object.fromEntries(
            variant.source.parts.map((part) => [
              part.id,
              part.parent === undefined ? {} : { parent: part.parent },
            ]),
          ),
          anchors: Object.fromEntries(
            variant.source.anchors.map((anchor) => [
              anchor.id,
              { part: anchor.part },
            ]),
          ),
        },
      };
    });
  let retained = 0,
    peak = 0;
  const reserve = (bytes: number) => {
    retained += bytes;
    peak = Math.max(peak, retained);
    let active = true;
    return {
      release() {
        if (active) {
          active = false;
          retained -= bytes;
        }
      },
    };
  };
  const maximumPacketBytes = Math.max(
    ...captures.map((capture) =>
      nativeCompositionObservationCapacityV2(
        loaded.composition,
        capture.frame,
        { preparedNative3D: loaded.native3D!, nativeObservationRequired: true },
      ),
    ),
  );
  const outputPath = join(directory, "journal-preview.rgba");
  const sink = new NativeObservationSinkV2({
    outputPath,
    exportId: "real-preview-journal2",
    frameCount: loaded.composition.frameCount,
    maximumPacketBytes,
    execution,
    expectedPasses,
    reserve,
  });
  const packets: NativeObservedOutputFrameV2[] = [];
  const rgba = Buffer.concat(
    captures.map((capture) => Buffer.from(capture.rgba)),
  );
  const output = {
    sha256: hash(rgba),
    frameCount: captures.length,
    width: loaded.composition.width,
    height: loaded.composition.height,
    transport: "raw_rgba" as const,
  };
  const stride = output.width * output.height * 4;
  let passCount = 0;
  try {
    for (const [index, capture] of captures.entries()) {
      assert.equal(capture.frame, index);
      const packet = NativeObservedOutputFrameV2Schema.parse({
        version: "native3d-observed-output-frame-2",
        outputFrame: capture.frame,
        executionSha256: sink.executionSha256,
        passes: capture.passes,
      });
      await writeFile(
        join(directory, `journal-frame-${index}.json`),
        JSON.stringify(
          {
            packet,
            expected: expectedPasses(index).map((assigned) =>
              assigned.version === "native3d-frame-2"
                ? {
                    version: assigned.version,
                    sampleFrame: assigned.sampleFrame,
                    sourceFrame: assigned.reference.sourceFrame,
                    shapes: Object.fromEntries(
                      Object.entries(assigned.reference.frame.shapeStates).map(
                        ([id, shape]) => [
                          id,
                          {
                            stateKey: shape.stateKey,
                            association: assigned.variant.shapeAssociations[id],
                          },
                        ],
                      ),
                    ),
                  }
                : {
                    version: assigned.version,
                    sampleFrame: assigned.legacy.sampleFrame,
                  },
            ),
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
      await writeFile(
        join(directory, `journal-frame-${index}.rgba`),
        Buffer.from(capture.rgba),
        { flag: "wx" },
      );
      await sink.acceptPacket(0, Buffer.from(JSON.stringify(packet)));
      sink.requirePacket(0, index);
      const bytes = Buffer.from(capture.rgba);
      assert.equal(bytes.length, stride);
      await sink.commitPixel(0, index, {
        transport: "raw_rgba",
        byteLength: bytes.length,
        transportBytesSha256: hash(bytes),
      });
      passCount += packet.passes.length;
      packets.push(packet);
    }
    const closure = await sink.finalize(
      { outputFrames: captures.length, passCount },
      output,
    );
    await writeFile(outputPath, rgba, { flag: "wx" });
    for (const publication of sink.publications)
      await rename(publication.staged, publication.destination);
    const replay = async () =>
      verifyNativeObservationClosureV2({
        closure,
        execution,
        expectedPasses,
        output,
        reserve,
        onFrame(packet, pixel) {
          assert.equal(pixel.transport, "raw_rgba");
          assert.equal(pixel.byteLength, stride);
          assert.equal(
            pixel.transportBytesSha256,
            hash(
              rgba.subarray(
                packet.outputFrame * stride,
                (packet.outputFrame + 1) * stride,
              ),
            ),
          );
        },
      });
    const verified = await replay();
    assert.equal(verified.outputFrames, captures.length);
    assert.equal(verified.passCount, passCount);
    const negatives: { id: string; message: string }[] = [];
    const expectFailure = async (
      id: string,
      operation: () => unknown | Promise<unknown>,
    ) => {
      let message: string | undefined;
      try {
        await operation();
      } catch (error) {
        message = String(error);
      }
      assert.ok(message, `Negative must fail: ${id}`);
      negatives.push({ id, message });
    };
    const first = packets[0]!;
    const faults: [string, (packet: NativeObservedOutputFrameV2) => void][] = [
      [
        "execution-sha",
        (p) => {
          p.executionSha256 = hash("wrong-execution");
        },
      ],
      [
        "sample-clock",
        (p) => {
          p.passes[0]!.sampleFrame += 0.01;
        },
      ],
      [
        "sample-order",
        (p) => {
          p.passes.reverse();
        },
      ],
      [
        "pass-coverage",
        (p) => {
          p.passes.pop();
        },
      ],
      [
        "numeric-camera",
        (p) => {
          const observed = p.passes.find(
            (pass) => pass.observed.version === "native3d-observed-frame-2",
          )!.observed;
          observed.camera = {
            ...observed.camera,
            worldMatrix: [
              observed.camera.worldMatrix[0],
              observed.camera.worldMatrix[1],
              observed.camera.worldMatrix[2],
              observed.camera.worldMatrix[3],
              observed.camera.worldMatrix[4],
              observed.camera.worldMatrix[5],
              observed.camera.worldMatrix[6],
              observed.camera.worldMatrix[7],
              observed.camera.worldMatrix[8],
              observed.camera.worldMatrix[9],
              observed.camera.worldMatrix[10],
              observed.camera.worldMatrix[11],
              observed.camera.worldMatrix[12] + 0.01,
              observed.camera.worldMatrix[13],
              observed.camera.worldMatrix[14],
              observed.camera.worldMatrix[15],
            ],
          };
        },
      ],
      [
        "appearance-sha",
        (p) => {
          p.passes[0]!.observed.appearanceCodeSha256 = hash("wrong-appearance");
        },
      ],
    ];
    for (const [id, mutate] of faults) {
      const bad = new NativeObservationSinkV2({
        outputPath: join(directory, `negative-${id}.rgba`),
        exportId: id,
        frameCount: output.frameCount,
        maximumPacketBytes,
        execution,
        expectedPasses,
        reserve,
      });
      try {
        const packet = structuredClone(first);
        mutate(packet);
        await expectFailure(id, () =>
          bad.acceptPacket(0, Buffer.from(JSON.stringify(packet))),
        );
        await expectFailure(id + "-no-pixels", () => bad.requirePacket(0, 0));
      } finally {
        await bad.dispose();
      }
    }
    for (const key of [
      "originalGeometrySha256",
      "meshDataSha256",
      "sourceSha256",
    ] as const) {
      const bound = structuredClone(execution);
      bound.sources.find(
        (source) => source.sourceVersion === "mechanism-scene-2",
      )![key] = hash("wrong-" + key);
      const bad = new NativeObservationSinkV2({
        outputPath: join(directory, `negative-binding-${key}.rgba`),
        exportId: key,
        frameCount: output.frameCount,
        maximumPacketBytes,
        execution: bound,
        expectedPasses,
        reserve,
      });
      try {
        await expectFailure("declared-" + key, () =>
          bad.acceptPacket(
            0,
            Buffer.from(
              JSON.stringify({
                ...first,
                executionSha256: bad.executionSha256,
              }),
            ),
          ),
        );
      } finally {
        await bad.dispose();
      }
    }
    const associationBinding = structuredClone(execution);
    const shapeSource = associationBinding.sources.find(
      (entry) => entry.sourceVersion === "mechanism-scene-2",
    )!;
    if (shapeSource.sourceVersion !== "mechanism-scene-2")
      throw Error("Missing changing source");
    shapeSource.shapeAssociations[0]!.declarationSha256 = hash(
      "wrong-shape-association",
    );
    const mismatchedShape = new NativeObservationSinkV2({
      outputPath: join(directory, "negative-shape-association.rgba"),
      exportId: "shape-association",
      frameCount: output.frameCount,
      maximumPacketBytes,
      execution: associationBinding,
      expectedPasses,
      reserve,
    });
    try {
      await expectFailure("declared-shape-association", () =>
        mismatchedShape.acceptPacket(
          0,
          Buffer.from(
            JSON.stringify({
              ...first,
              executionSha256: mismatchedShape.executionSha256,
            }),
          ),
        ),
      );
    } finally {
      await mismatchedShape.dispose();
    }
    const manifestBytes = await readFile(closure.manifestPath),
      manifest = JSON.parse(manifestBytes.toString());
    manifest.version = "native-observation-manifest-1";
    const downgraded = Buffer.from(JSON.stringify(manifest));
    await writeFile(closure.manifestPath, downgraded);
    await expectFailure("manifest-downgrade", () =>
      verifyNativeObservationClosureV2({
        closure: { ...closure, manifestSha256: hash(downgraded) },
        execution,
        expectedPasses,
        output,
        reserve,
      }),
    );
    await writeFile(closure.manifestPath, manifestBytes);
    const shardPath = join(directory, verified.artifacts[0]!.path),
      shard = await readFile(shardPath);
    const rows = shard.toString().trimEnd().split("\n");
    const row = JSON.parse(rows[0]!);
    row.version = "native3d-observation-row-1";
    rows[0] = JSON.stringify(row);
    const badRows = Buffer.from(rows.join("\n") + "\n");
    await writeFile(shardPath, badRows);
    const updated = JSON.parse(manifestBytes.toString());
    updated.artifacts[0].sha256 = hash(badRows);
    updated.artifacts[0].byteLength = badRows.length;
    updated.byteLength += badRows.length - shard.length;
    const updatedBytes = Buffer.from(JSON.stringify(updated));
    await writeFile(closure.manifestPath, updatedBytes);
    await expectFailure("row-downgrade", () =>
      verifyNativeObservationClosureV2({
        closure: { ...closure, manifestSha256: hash(updatedBytes) },
        execution,
        expectedPasses,
        output,
        reserve,
      }),
    );
    await writeFile(shardPath, shard);
    await writeFile(closure.manifestPath, manifestBytes);
    await replay();
    assert.equal(retained, 0);
    const result = {
      scope: "actual-preview-raw-pixel-journal-probe2",
      status: "passed",
      output,
      closure,
      passCount,
      frameProtocols: packets.map((packet) =>
        packet.passes.map((pass) => pass.observed.version),
      ),
      negatives,
      peakJournalMetadataBytes: peak,
      retainedJournalMetadataBytes: retained,
      artifacts: verified.artifacts.map((artifact) => ({
        ...artifact,
        path: basename(artifact.path),
      })),
    };
    await writeFile(
      join(directory, "journal-run.json"),
      JSON.stringify(result, null, 2) + "\n",
      { flag: "wx" },
    );
    return result;
  } finally {
    await sink.dispose();
    assert.equal(retained, 0);
  }
}
