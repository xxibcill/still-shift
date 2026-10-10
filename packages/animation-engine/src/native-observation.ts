import { createHash } from "node:crypto";
import { setImmediate as yieldEventLoop } from "node:timers/promises";
import {
  NATIVE3D_OBSERVATION_LIMITS,
  type Composition,
  type CompositionPreparedNative3D,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../renderer-core/src/mechanism/canonical.ts";
import { compositionNativePasses } from "../../renderer-core/src/composition/render/graphs.ts";
import { resolveNative3DVariant } from "../../renderer-core/src/native3d/prepare.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import {
  admitNativeObservationCapacity,
  type ExportRequest,
  type NativeObservationExecutionBinding,
  type NativeObservationExpectedPass,
} from "@still-shift/execution-runtime/export";
import type { LoadedComposition } from "./composition-render.ts";

export type NativeMechanismExecution = NonNullable<
  NativeObservationExecutionBinding["mechanism"]
>;
const sha256 = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalMechanismJson(value)).digest("hex")}`;
const lexical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Only declared file locators are omitted; authored recipe and metadata stay bound. */
export function nativeCompositionSha256(composition: Composition): string {
  return sha256({
    ...composition,
    assets: composition.assets.map((asset) =>
      Object.fromEntries(
        Object.entries(asset).filter(
          ([key]) => key !== "path" && key !== "manifestPath",
        ),
      ),
    ),
  });
}
export function nativePreparedSha256(
  transport: CompositionPreparedNative3D,
): string {
  return sha256(transport);
}

/** Trusted graph associations; no expected matrices substitute for actual observations. */
export async function createNativeObservationRequest(
  loaded: LoadedComposition,
  mechanism?: NativeMechanismExecution,
  options: { signal?: AbortSignal | undefined } = {},
): Promise<ExportRequest["nativeObservation"]> {
  options.signal?.throwIfAborted();
  if (!loaded.preparedNative3D) return undefined;
  if (
    !loaded.native3D ||
    !loaded.nativeAppearanceCodeSha256 ||
    !loaded.nativeAppearanceCodeIdentity ||
    loaded.scene.backend !== "webgl2"
  )
    passageError(
      "comp-native3d-protocol",
      "Native observation requires its prepared sources and WebGL2 code identity",
      { path: "nativeObservations" },
    );
  const execution: NativeObservationExecutionBinding = {
    version: "native-observation-execution-1",
    compositionSourceSha256: loaded.sourceChecksum,
    compositionSha256: nativeCompositionSha256(loaded.composition),
    preparedNativeSha256: nativePreparedSha256(loaded.preparedNative3D),
    appearanceCodeSha256: loaded.nativeAppearanceCodeSha256,
    appearanceCodeIdentity: loaded.nativeAppearanceCodeIdentity,
    backend: "webgl2",
    profile: "native-three-aces-hdr-msaa4-1",
    sources: Object.entries(loaded.native3D)
      .sort(([a], [b]) => lexical(a, b))
      .flatMap(([asset, source]) =>
        Object.values(source.variants)
          .sort((a, b) => lexical(a.sourceKey, b.sourceKey))
          .map((variant) => ({
            asset,
            sourceKey: variant.sourceKey,
            sourceSha256: variant.sourceSha256,
            originalGeometrySha256: variant.originalGeometrySha256,
            effectiveSceneSha256: variant.effectiveSceneSha256,
            geometrySha256: variant.geometrySha256,
            meshDataSha256: variant.meshDataSha256,
          })),
      ),
    ...(mechanism ? { mechanism } : {}),
  };
  if (
    Buffer.byteLength(JSON.stringify(execution)) + 65536 >
    NATIVE3D_OBSERVATION_LIMITS.packetBytes
  )
    passageError(
      "comp-native3d-limit",
      "Native execution manifest exceeds its byte admission",
      { path: "nativeObservations.execution" },
    );
  const topology = new Map<
    string,
    Pick<NativeObservationExpectedPass, "parts" | "anchors">
  >();
  const expectedPasses = (
    outputFrame: number,
  ): NativeObservationExpectedPass[] => {
    options.signal?.throwIfAborted();
    const passes: NativeObservationExpectedPass[] = [];
    for (const pass of compositionNativePasses(
      loaded.composition,
      outputFrame,
      { preparedNative3D: loaded.native3D!, nativeObservationRequired: true },
    )) {
      options.signal?.throwIfAborted();
      if (passes.length >= NATIVE3D_OBSERVATION_LIMITS.passes)
        passageError(
          "comp-native3d-limit",
          "Native output exceeds contributing pass admission",
          { path: "nativeObservations", frame: outputFrame },
        );
      const frame = pass.frame;
      const variant = resolveNative3DVariant(loaded.native3D, frame);
      let inventory = topology.get(variant.sourceKey);
      if (!inventory) {
        inventory = Object.freeze({
          parts: Object.freeze(
            Object.fromEntries(
              variant.source.parts.map((part) => [
                part.id,
                Object.freeze(
                  part.parent === undefined ? {} : { parent: part.parent },
                ),
              ]),
            ),
          ),
          anchors: Object.freeze(
            Object.fromEntries(
              variant.source.anchors.map((anchor) => [
                anchor.id,
                Object.freeze({ part: anchor.part }),
              ]),
            ),
          ),
        });
        topology.set(variant.sourceKey, inventory);
      }
      passes.push({
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
        ...inventory,
      });
    }
    options.signal?.throwIfAborted();
    return passes;
  };
  // Reserve from actual key/string inventories with a conservative 40-byte number bound.
  // This bounds serializer/parser storage before any browser or output allocation.
  const large = -Number.MAX_VALUE,
    matrix = Array.from({ length: 16 }, () => large);
  const longestMeshId =
    Object.values(loaded.native3D)
      .flatMap((source) => Object.values(source.variants))
      .flatMap((variant) =>
        variant.source.geometry.meshes.map((mesh) => mesh.id),
      )
      .sort(
        (a, b) =>
          Buffer.byteLength(JSON.stringify(b)) -
          Buffer.byteLength(JSON.stringify(a)),
      )[0] ?? "mesh";
  let maximumPacketBytes = 0;
  for (
    let outputFrame = 0;
    outputFrame < loaded.composition.frameCount;
    outputFrame++
  ) {
    options.signal?.throwIfAborted();
    const passes = expectedPasses(outputFrame).map((reference, sampleIndex) => {
      const { sampleFrame, parts, anchors, ...identity } = reference;
      return {
        sampleIndex,
        sampleFrame,
        observed: {
          version: "native3d-observed-frame-1",
          ...identity,
          camera: {
            worldMatrix: matrix,
            viewMatrix: matrix,
            projectionMatrix: matrix,
            near: large,
            far: large,
            aspect: large,
            fovDegrees: large,
          },
          parts: Object.fromEntries(
            Object.entries(parts).map(([id, parent]) => [
              id,
              {
                ...parent,
                localMatrix: matrix,
                worldMatrix: matrix,
                localVisible: false,
                inheritedVisible: false,
              },
            ]),
          ),
          anchors: Object.fromEntries(
            Object.entries(anchors).map(([id, part]) => [
              id,
              {
                ...part,
                world: [large, large, large],
                pixel: [large, large],
                depth: large,
                visibility: "behind-camera",
                visibilityMethod: "three-physical-mesh-segment",
                occluderMesh: longestMeshId,
              },
            ]),
          ),
          pass: { completed: true, calls: 1000000, triangles: 100000000 },
        },
      };
    });
    maximumPacketBytes = Math.max(
      maximumPacketBytes,
      Buffer.byteLength(
        JSON.stringify(
          {
            version: "native3d-observed-output-frame-1",
            outputFrame,
            executionSha256: `sha256:${"f".repeat(64)}`,
            passes,
          },
          (_key, value) =>
            typeof value === "number"
              ? "-1.234567890123456789012345678901234e-308"
              : value,
        ),
      ),
    );
    options.signal?.throwIfAborted();
    // Each exact frame is bounded independently; release the event loop so
    // abort signals and other consumers can run without retaining frame tables.
    await yieldEventLoop();
    options.signal?.throwIfAborted();
  }
  admitNativeObservationCapacity(
    loaded.composition.frameCount,
    maximumPacketBytes,
  );
  options.signal?.throwIfAborted();
  return { execution, expectedPasses, maximumPacketBytes };
}
