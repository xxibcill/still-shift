import type { WebGLRenderer } from "three";
import {
  NativeFrameSnapshotV3Schema,
  NativeObservedFrameV3Schema,
  MechanismHashSchema,
  MechanismMatrixSchema,
  NATIVE3D_OBSERVATION_LIMITS,
  NATIVE3D_PBR_FRAME_FINALIZER_VERSION,
  NATIVE3D_PBR_PRECISION_POLICY,
} from "@still-shift/scene-contract";
import type {
  NativeFrameSnapshotV3,
  NativeObservedFrameV3,
  NativeObservedPbrMesh,
} from "@still-shift/scene-contract";
import { renderMemory } from "../managed-memory-context.ts";
import type { NativeThreeWorldV3 } from "./three-world.ts";
import type { PreparedNative3DVariantV3 } from "./types-v3.ts";
import type { DeepReadonly } from "./types.ts";
import { captureNativePbrFrameDraws } from "./three-pbr-draws.ts";
import { sealNativePbrWorldState } from "./three-pbr-frame-state.ts";
import {
  hashNativeUsedBytes,
  packNativeObservedFrameKey,
} from "./used-stream-bytes.ts";
import { hashNativeData } from "./canonical-hash.ts";
import { freezeNativeData } from "./prepare.ts";

export interface NativeThreeFrameObservationResultV3 {
  readonly receipt: DeepReadonly<NativeObservedFrameV3>;
  dispose(): void;
}
const activeContexts = new WeakSet<object>();
/** One synchronous draw capture per invocation; independently owned hashes may finish out of order. */
export function createNativeThreeQueuedFrameObservationV3(
  renderer: WebGLRenderer,
  world: NativeThreeWorldV3,
  variant: PreparedNative3DVariantV3,
  appearanceCodeSha256: string,
) {
  MechanismHashSchema.parse(appearanceCodeSha256);
  let disposed = false;
  const receipts = new Set<() => void>();
  return {
    dispose() {
      if (!disposed) {
        disposed = true;
        for (const release of receipts) release();
        receipts.clear();
      }
    },
    async capture(
      input: DeepReadonly<NativeFrameSnapshotV3>,
      options: { signal?: AbortSignal } = {},
    ): Promise<NativeThreeFrameObservationResultV3> {
      const gl = renderer.getContext();
      if (disposed || activeContexts.has(gl))
        throw Error(
          "comp-native3d-observation: PBR observation owner is disposed or busy",
        );
      activeContexts.add(gl);
      const memory = renderMemory();
      let contextHeld = true,
        transferred = false;
      let metadata:
        | ReturnType<NonNullable<typeof memory>["reserve"]>
        | undefined;
      let draws: ReturnType<typeof captureNativePbrFrameDraws> | undefined;
      let frameKey: ReturnType<typeof packNativeObservedFrameKey> | undefined;
      function releaseContext() {
        if (contextHeld) {
          contextHeld = false;
          activeContexts.delete(gl);
        }
      }
      const assertLive = () => {
        if (
          disposed ||
          options.signal?.aborted ||
          gl.isContextLost() ||
          (metadata && !metadata.active)
        )
          throw Error(
            "comp-native3d-observation: PBR observation was aborted, disposed or lost",
          );
      };
      try {
        assertLive();
        metadata = memory?.reserve(
          "metadata",
          NATIVE3D_OBSERVATION_LIMITS.packetBytes * 8 +
            262144 +
            variant.source.geometry.meshes.reduce(
              (sum, mesh) =>
                sum +
                (mesh.positions.length / 3) * 256 +
                (mesh.groups?.length ?? 1) * 8192,
              0,
            ),
          undefined,
          true,
        );
        const snapshot = NativeFrameSnapshotV3Schema.parse(input);
        if (
          snapshot.sourceKey !== variant.sourceKey ||
          snapshot.sourceSha256 !== variant.sourceSha256 ||
          snapshot.effectiveSceneSha256 !== variant.effectiveSceneSha256 ||
          snapshot.geometrySha256 !== variant.geometrySha256
        )
          throw Error(
            "comp-native3d-observation: PBR assigned pass differs from its owned prepared variant",
          );
        draws = captureNativePbrFrameDraws(
          renderer,
          world,
          variant,
          snapshot,
          assertLive,
        );
        const state = sealNativePbrWorldState(
          world,
          snapshot,
          new Set(
            draws.meshes
              .filter((mesh) => mesh.submissions.length)
              .map((mesh) => mesh.mesh),
          ),
          {
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
          },
        );
        // All GL and Three numeric queries finish before the first asynchronous digest.
        releaseContext();
        const meshes: Record<string, NativeObservedPbrMesh> =
          Object.create(null);
        for (const mesh of draws.meshes) {
          const common = {
            part: mesh.part,
            ownerWorldMatrix: MechanismMatrixSchema.parse(
              mesh.ownerWorldMatrix,
            ),
          };
          if (mesh.reason) {
            meshes[mesh.mesh] = {
              ...common,
              status: "not-drawn",
              reason: mesh.reason,
            };
            continue;
          }
          const submissions: Extract<
            NativeObservedPbrMesh,
            { status: "drawn" }
          >["submissions"] = [];
          for (const submission of mesh.submissions) {
            const captured = submission.captured,
              vertexHashes = {} as Extract<
                NativeObservedPbrMesh,
                { status: "drawn" }
              >["submissions"][number]["vertexHashes"];
            for (const [name, bytes] of Object.entries(captured.vertexBytes))
              vertexHashes[name as keyof typeof vertexHashes] =
                await hashNativeUsedBytes(
                  bytes as Uint8Array<ArrayBuffer>,
                  assertLive,
                );
            const material = variant.source.geometry.materials.find(
              (material) => material.id === submission.material,
            )!;
            submissions.push({
              groupIndex: submission.groupIndex,
              drawOrdinal: submission.drawOrdinal,
              start: submission.start,
              count: submission.count,
              material: submission.material,
              materialSha256: await hashNativeData(material),
              mode: 4,
              type: captured.draw.type as 5123 | 5125,
              byteOffset: captured.draw.offset,
              modelViewMatrix: MechanismMatrixSchema.parse(
                submission.matrices.modelViewMatrix,
              ),
              projectionMatrix: MechanismMatrixSchema.parse(
                submission.matrices.projectionMatrix,
              ),
              normalMatrix: submission.matrices.normalMatrix,
              vertexHashes,
              shaderSha256: await hashNativeUsedBytes(
                captured.shaderBytes,
                assertLive,
              ),
              textures: captured.textures,
            });
          }
          meshes[mesh.mesh] = { ...common, status: "drawn", submissions };
        }
        frameKey = packNativeObservedFrameKey(snapshot.frameKey);
        const result = NativeObservedFrameV3Schema.parse({
          version: "native3d-observed-frame-3",
          sourceVersion: "mechanism-scene-3",
          finalizerVersion: NATIVE3D_PBR_FRAME_FINALIZER_VERSION,
          precisionPolicy: NATIVE3D_PBR_PRECISION_POLICY,
          sourceKey: variant.sourceKey,
          sourceSha256: variant.sourceSha256,
          effectiveSceneSha256: variant.effectiveSceneSha256,
          geometrySha256: variant.geometrySha256,
          appearanceCodeSha256,
          controller: snapshot.controller,
          scope: snapshot.scope,
          sourceFrame: snapshot.sourceFrame,
          scopeFrame: snapshot.scopeFrame,
          frameKeySha256: await hashNativeUsedBytes(frameKey.bytes, assertLive),
          ...state,
          meshes,
        });
        if (
          new TextEncoder().encode(JSON.stringify(result)).byteLength >
          NATIVE3D_OBSERVATION_LIMITS.packetBytes
        )
          throw Error("comp-native3d-limit: PBR observed frame exceeds 1 MiB");
        assertLive();
        const receipt = freezeNativeData(result),
          lease = metadata;
        let released = false;
        const disposeReceipt = () => {
          if (!released) {
            released = true;
            receipts.delete(disposeReceipt);
            lease?.release();
          }
        };
        receipts.add(disposeReceipt);
        transferred = true;
        return {
          get receipt() {
            if (released || (lease && !lease.active))
              throw Error(
                "comp-native3d-observation: PBR observed receipt is disposed",
              );
            return receipt;
          },
          dispose: disposeReceipt,
        };
      } finally {
        releaseContext();
        draws?.dispose();
        frameKey?.dispose();
        if (!transferred) metadata?.release();
      }
    },
  };
}
