import { Matrix4, Vector3 } from "three";
import type { WebGLRenderer } from "three";
import {
  MechanismMatrixSchema,
  NativeShapeAssociationSchema,
  NativeFrameSnapshotV2Schema,
  NativeObservedShapePassSchema,
} from "@still-shift/scene-contract";
import type {
  NativeFrameSnapshotV2,
  NativeObservedShape,
  NativeObservedShapePass,
} from "@still-shift/scene-contract";
import {
  allocateRenderPixels,
  renderMemory,
} from "../managed-memory-context.ts";
import type { NativeThreeWorldV2 } from "./three-world.ts";
import type { PreparedNative3DVariantV2 } from "./types-v2.ts";
import type { DeepReadonly } from "./types.ts";
import { captureNativeShapeDraws } from "./three-shape-draws.ts";
import { hashNativeData } from "./canonical-hash.ts";
import {
  hashNativeUsedBytes,
  nativeUsedBytesEqual,
  packNativeExpectedStream,
} from "./used-stream-bytes.ts";
import { freezeNativeData } from "./prepare.ts";

export class NativeUsedStreamMismatchError extends Error {
  readonly mismatch: Readonly<{
    shape: string;
    stream: "position" | "normal" | "indices";
    actualSha256: string;
    expectedSha256: string;
    submissions: number;
  }>;
  constructor(mismatch: NativeUsedStreamMismatchError["mismatch"]) {
    super(
      `comp-native3d-observation: used ${mismatch.stream} bytes differ from the intended current state: ${mismatch.shape}`,
    );
    this.name = "NativeUsedStreamMismatchError";
    this.mismatch = Object.freeze({ ...mismatch });
  }
}
const activeContexts = new WeakSet<object>();
export interface NativeThreeShapeObservationResult {
  readonly receipt: DeepReadonly<NativeObservedShapePass>;
  dispose(): void;
}
function utf8Length(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 128) length++;
    else if (code < 2048) length += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      length += 4;
      index++;
    } else length += 3;
  }
  return length;
}

/** Observe a standalone scene2 color pass. Whole-frame/export acceptance is a separate versioned boundary. */
export function createNativeThreeShapeObservation(
  renderer: WebGLRenderer,
  world: NativeThreeWorldV2,
  variant: PreparedNative3DVariantV2,
) {
  let disposed = false,
    busy = false,
    generation = 0;
  const receipts = new Set<() => void>();
  return {
    dispose() {
      if (!disposed) {
        disposed = true;
        generation++;
        for (const release of receipts) release();
        receipts.clear();
      }
    },
    async capture(
      input: DeepReadonly<NativeFrameSnapshotV2>,
      options: { signal?: AbortSignal } = {},
    ): Promise<NativeThreeShapeObservationResult> {
      const context = renderer.getContext();
      if (disposed || busy || activeContexts.has(context))
        throw Error(
          "comp-native3d-observation: changing observation owner is disposed or busy",
        );
      busy = true;
      activeContexts.add(context);
      const invocation = ++generation,
        memory = renderMemory();
      let draws: ReturnType<typeof captureNativeShapeDraws> | undefined;
      let frameKeyBytes: Uint8Array<ArrayBuffer> | undefined;
      let metadata:
        | ReturnType<NonNullable<typeof memory>["reserve"]>
        | undefined;
      let primaryFailure = false,
        failureReason: unknown;
      let resultOwner: NativeThreeShapeObservationResult | undefined;
      let publishedRelease: (() => void) | undefined;
      const expectedOwners: ReturnType<typeof packNativeExpectedStream>[] = [];
      const assertLive = () => {
        if (
          disposed ||
          generation !== invocation ||
          options.signal?.aborted ||
          context.isContextLost() ||
          world.source !== variant.source ||
          world.parts.size !== variant.source.parts.length ||
          world.meshes.length !== variant.source.geometry.meshes.length ||
          (metadata && !metadata.active)
        )
          throw Error(
            "comp-native3d-observation: changing observation was aborted, disposed or lost",
          );
      };
      try {
        assertLive();
        // Admit bounded parsed state, draw metadata and returned DTO before allocating them.
        const vertices = Object.values(variant.shapeAssociations).reduce(
          (sum, shape) => sum + shape.vertexCount,
          0,
        );
        metadata = memory?.reserve(
          "metadata",
          131072 +
            vertices * 96 +
            input.frameKey.length * 4 +
            variant.source.parts.length * 1024 +
            Object.values(variant.shapeAssociations).reduce(
              (sum, shape) => sum + shape.groups.length * 4096,
              0,
            ),
          undefined,
          true,
        );
        const snapshot = NativeFrameSnapshotV2Schema.parse(input);
        if (
          snapshot.sourceKey !== variant.sourceKey ||
          snapshot.sourceSha256 !== variant.sourceSha256 ||
          snapshot.effectiveSceneSha256 !== variant.effectiveSceneSha256 ||
          snapshot.geometrySha256 !== variant.geometrySha256 ||
          Object.keys(snapshot.frame.shapeStates).length !==
            variant.source.teachingShapes.length
        )
          throw Error(
            "comp-native3d-observation: expected pass association differs from the owned prepared variant",
          );
        const expected = Object.create(null) as Record<
          string,
          {
            position: ReturnType<typeof packNativeExpectedStream>;
            normal: ReturnType<typeof packNativeExpectedStream>;
            indices: ReturnType<typeof packNativeExpectedStream>;
          }
        >;
        for (const shape of variant.source.teachingShapes) {
          const state = snapshot.frame.shapeStates[shape.id],
            mesh = variant.source.geometry.meshes.find(
              (mesh) => mesh.id === shape.mesh,
            )!;
          if (
            !state ||
            state.shape !== shape.id ||
            state.mesh !== shape.mesh ||
            state.ownerPart !== shape.ownerPart ||
            state.topologySha256 !== shape.topologySha256 ||
            state.positions.length !== mesh.positions.length
          )
            throw Error(
              "comp-native3d-observation: expected shape state differs from its sealed association",
            );
          const position = packNativeExpectedStream(state.positions, "float32");
          expectedOwners.push(position);
          const normal = packNativeExpectedStream(state.normals, "float32");
          expectedOwners.push(normal);
          const indices = packNativeExpectedStream(mesh.indices, "uint16");
          expectedOwners.push(indices);
          expected[shape.id] = { position, normal, indices };
        }
        draws = captureNativeShapeDraws(
          renderer,
          world,
          variant,
          snapshot,
          assertLive,
        );
        // Validate every used byte before any asynchronous finalization or landmark publication.
        for (const entry of draws.shapes) {
          if (!entry.streams) continue;
          const intended = expected[entry.association.shape]!;
          for (const field of ["position", "normal", "indices"] as const)
            if (
              !nativeUsedBytesEqual(entry.streams[field], intended[field].bytes)
            )
              throw new NativeUsedStreamMismatchError({
                shape: entry.association.shape,
                stream: field,
                actualSha256: await hashNativeUsedBytes(
                  entry.streams[field],
                  assertLive,
                ),
                expectedSha256: await hashNativeUsedBytes(
                  intended[field].bytes,
                  assertLive,
                ),
                submissions: entry.submissions.length,
              });
        }
        const shapes: Record<string, NativeObservedShape> = Object.create(null);
        for (const entry of draws.shapes) {
          assertLive();
          const identity = {
            association: NativeShapeAssociationSchema.parse(entry.association),
            driverStateKey: entry.driverStateKey,
          };
          if (!entry.streams) {
            shapes[entry.association.shape] = {
              ...identity,
              status: "not-drawn",
              reason: entry.reason!,
            };
            continue;
          }
          const streams = entry.streams;
          for (const [index, material] of entry.materials.entries()) {
            const group = entry.submissions[index]!;
            if ((await hashNativeData(material)) !== group.materialSha256)
              throw Error(
                "comp-native3d-observation: actual material identity differs from the sealed draw group",
              );
            assertLive();
          }
          const landmarks: Extract<
            NativeObservedShape,
            { status: "drawn" }
          >["landmarks"] = Object.create(null);
          const shape = variant.source.teachingShapes.find(
            (shape) => shape.id === entry.association.shape,
          )!;
          const used = new DataView(
            streams.position.buffer,
            streams.position.byteOffset,
            streams.position.byteLength,
          );
          const ownerMatrix = new Matrix4().fromArray(entry.ownerWorldMatrix);
          for (const landmark of shape.landmarks) {
            const local = new Vector3();
            for (const vertex of landmark.vertexIndices)
              local.add(
                new Vector3(
                  used.getFloat32(vertex * 12, true),
                  used.getFloat32(vertex * 12 + 4, true),
                  used.getFloat32(vertex * 12 + 8, true),
                ),
              );
            local.divideScalar(landmark.vertexIndices.length);
            landmarks[landmark.id] = {
              local: local.toArray() as [number, number, number],
              world: local.clone().applyMatrix4(ownerMatrix).toArray() as [
                number,
                number,
                number,
              ],
              positionMethod: "used-position-landmark-1",
            };
          }
          const { buffer: _positionBuffer, ...positionLayout } =
            streams.positionLayout;
          const { buffer: _normalBuffer, ...normalLayout } =
            streams.normalLayout;
          void _positionBuffer;
          void _normalBuffer;
          shapes[entry.association.shape] = {
            ...identity,
            status: "drawn",
            ownerWorldMatrix: MechanismMatrixSchema.parse(
              entry.ownerWorldMatrix,
            ),
            positionSha256: await hashNativeUsedBytes(
              streams.position,
              assertLive,
            ),
            normalSha256: await hashNativeUsedBytes(streams.normal, assertLive),
            indexSha256: await hashNativeUsedBytes(streams.indices, assertLive),
            positionLayout,
            normalLayout,
            landmarks,
            submissions: [...entry.submissions].sort(
              (a, b) => a.groupIndex - b.groupIndex,
            ),
          };
        }
        assertLive();
        const length = utf8Length(snapshot.frameKey);
        // Native frame keys are bounded Unicode strings; reserve the retained UTF-8 backing separately.
        frameKeyBytes = allocateRenderPixels(
          length,
          () => new Uint8Array(length),
          true,
        );
        new TextEncoder().encodeInto(snapshot.frameKey, frameKeyBytes);
        const frameKeySha256 = await hashNativeUsedBytes(
          frameKeyBytes,
          assertLive,
        );
        const result = NativeObservedShapePassSchema.parse({
          version: "native3d-observed-shape-pass-1",
          usedStreamVersion: "native3d-used-indexed-streams-1",
          digestPacking: "float32-uint16-little-endian-1",
          sourceVersion: "mechanism-scene-2",
          sourceKey: variant.sourceKey,
          sourceSha256: variant.sourceSha256,
          effectiveSceneSha256: variant.effectiveSceneSha256,
          frameKeySha256,
          controller: snapshot.controller,
          scope: snapshot.scope,
          sourceFrame: snapshot.sourceFrame,
          scopeFrame: snapshot.scopeFrame,
          shapes,
        });
        assertLive();
        const receipt = freezeNativeData(result),
          receiptLease = metadata;
        metadata = undefined;
        let released = false;
        function disposeReceipt() {
          if (!released) {
            released = true;
            receipts.delete(disposeReceipt);
            receiptLease?.release();
          }
        }
        receipts.add(disposeReceipt);
        publishedRelease = disposeReceipt;
        resultOwner = {
          get receipt() {
            if (released || (receiptLease && !receiptLease.active))
              throw Error(
                "comp-native3d-observation: observed shape receipt is disposed",
              );
            return receipt;
          },
          dispose: disposeReceipt,
        };
      } catch (error) {
        primaryFailure = true;
        failureReason = error;
      }
      const cleanup = [
        () => draws?.dispose(),
        ...expectedOwners.map((owner) => () => owner.dispose()),
        () => {
          if (frameKeyBytes) memory?.release(frameKeyBytes.buffer);
        },
        () => metadata?.release(),
      ];
      for (const release of cleanup) {
        try {
          release();
        } catch (error) {
          if (!primaryFailure) {
            primaryFailure = true;
            failureReason = error;
          }
        }
      }
      busy = false;
      activeContexts.delete(context);
      if (primaryFailure) {
        try {
          publishedRelease?.();
        } catch {
          /* Preserve the original capture or cleanup failure. */
        }
        throw failureReason;
      }
      return resultOwner!;
    },
  };
}
