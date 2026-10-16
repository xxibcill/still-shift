import type { PreparedNative3DVariantVersions } from "../../renderer-core/src/native3d/types-v2.ts";
import { setImmediate as yieldEventLoop } from "node:timers/promises";
import {
  admitNativeObservationCapacity,
  NativeObservationExecutionV2Schema,
  type NativeObservationRequestV2,
  type NativeObservationExpectedPassV2,
} from "@still-shift/execution-runtime/export";
import { compositionNativePasses } from "../../renderer-core/src/composition/render/graphs.ts";
import { resolveNative3DVariantVersions } from "../../renderer-core/src/native3d/catalogue-versions.ts";
import { nativeCompositionObservationCapacityV2 } from "../../renderer-core/src/native3d/observation-capacity-v2.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import {
  nativeCompositionSha256,
  nativePreparedSha256,
} from "./native-observation-identity.ts";
import type { LoadedComposition } from "./composition-render.ts";
import type { NativeMechanismExecution } from "./native-observation.ts";
const lexical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Trusted fresh graph sampling. Source2 is never adapted into original observations. */
export async function createNativeObservationRequestV2(
  loaded: LoadedComposition,
  mechanism?: NativeMechanismExecution,
  options: { signal?: AbortSignal | undefined } = {},
): Promise<NativeObservationRequestV2> {
  options.signal?.throwIfAborted();
  if (
    loaded.preparedNative3D?.version !== "composition-prepared-native3d-2" ||
    !loaded.native3D ||
    !loaded.nativeAppearanceCodeIdentity ||
    !loaded.nativeAppearanceCodeSha256 ||
    loaded.scene.backend !== "webgl2"
  )
    passageError(
      "comp-native3d-protocol",
      "Execution2 requires verified prepared source2 and WebGL2 appearance identity",
      { path: "nativeObservations.execution" },
    );
  const native3D = loaded.native3D;
  const graphOptions = {
    preparedNative3D: native3D,
    nativeObservationRequired: true as const,
  };
  const execution = NativeObservationExecutionV2Schema.parse({
    version: "native-observation-execution-2",
    compositionSourceSha256: loaded.sourceChecksum,
    compositionSha256: nativeCompositionSha256(loaded.composition),
    preparedNativeSha256: nativePreparedSha256(loaded.preparedNative3D),
    appearanceCodeSha256: loaded.nativeAppearanceCodeSha256,
    appearanceCodeIdentity: loaded.nativeAppearanceCodeIdentity,
    backend: "webgl2",
    profile: "native-three-aces-hdr-msaa4-1",
    sources: Object.entries(native3D)
      .sort(([a], [b]) => lexical(a, b))
      .flatMap(([asset, scene]) =>
        Object.values(scene.variants)
          .sort((a, b) => lexical(a.sourceKey, b.sourceKey))
          .map((variant: PreparedNative3DVariantVersions) => ({
            asset,
            sourceVersion: variant.source.schemaVersion,
            sourceKey: variant.sourceKey,
            sourceSha256: variant.sourceSha256,
            originalGeometrySha256: variant.originalGeometrySha256,
            effectiveSceneSha256: variant.effectiveSceneSha256,
            geometrySha256: variant.geometrySha256,
            meshDataSha256: variant.meshDataSha256,
            ...(variant.version === "prepared-native3d-variant-2"
              ? {
                  shapeAssociations: Object.values(
                    variant.shapeAssociations,
                  ).sort((a, b) => lexical(a.shape, b.shape)),
                }
              : {}),
          })),
      ),
    ...(mechanism ? { mechanism } : {}),
  });
  const expectedPasses = (
    outputFrame: number,
  ): NativeObservationExpectedPassV2[] => {
    options.signal?.throwIfAborted();
    return [
      ...compositionNativePasses(loaded.composition, outputFrame, graphOptions),
    ].map((pass) => {
      const frame = pass.frame,
        variant = resolveNative3DVariantVersions(native3D, frame);
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
      if (
        frame.version !== "native3d-frame-1" ||
        variant.version !== "prepared-native3d-variant-1"
      )
        passageError(
          "comp-native3d-protocol",
          "Expected source/frame protocol differs",
          { frame: outputFrame, path: "nativeObservations" },
        );
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
  };
  let maximumPacketBytes = 0;
  for (let frame = 0; frame < loaded.composition.frameCount; frame++) {
    options.signal?.throwIfAborted();
    maximumPacketBytes = Math.max(
      maximumPacketBytes,
      nativeCompositionObservationCapacityV2(
        loaded.composition,
        frame,
        graphOptions,
      ),
    );
    if (frame % 32 === 31) await yieldEventLoop();
  }
  admitNativeObservationCapacity(
    loaded.composition.frameCount,
    maximumPacketBytes,
  );
  return { execution, expectedPasses, maximumPacketBytes };
}
