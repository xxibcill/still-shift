import {
  NATIVE3D_OBSERVATION_LIMITS,
  NATIVE3D_FRAME_FINALIZER_VERSION,
  NATIVE3D_SHAPE_PRECISION_POLICY,
  type Composition,
} from "@still-shift/scene-contract";
import { renderMemory } from "../managed-memory-context.ts";
import { passageError } from "../passage-diagnostics.ts";
import { compositionNativePasses } from "../composition/render/graphs.ts";
import type { EvaluationOptions } from "../composition/evaluate/types.ts";
import { resolveNative3DVariantVersions } from "./catalogue-versions.ts";

const digest = `sha256:${"f".repeat(64)}`;
const large = -Number.MAX_VALUE;
const vector = [large, large, large];
const matrix = Array.from({ length: 16 }, () => large);
const camera = {
  worldMatrix: matrix,
  viewMatrix: matrix,
  projectionMatrix: matrix,
  near: large,
  far: large,
  aspect: large,
  fovDegrees: large,
};
const layout = {
  location: large,
  byteLength: large,
  components: 3,
  type: 5126,
  enabled: true,
  normalized: false,
  integer: false,
  divisor: 0,
  stride: 12,
  byteOffset: 0,
};

/** Capacity template only: this cannot be returned as observed GPU evidence. */
export function nativeCompositionObservationCapacityV2(
  composition: Composition,
  outputFrame: number,
  options: EvaluationOptions,
): number {
  // Bound the single-pass template and serializer backing before creating them.
  const lease = renderMemory()?.reserve(
    "metadata",
    NATIVE3D_OBSERVATION_LIMITS.packetBytes * 8 + 262144,
    undefined,
    true,
  );
  try {
    let bytes = 256,
      count = 0;
    const encoder = new TextEncoder();
    for (const pass of compositionNativePasses(
      composition,
      outputFrame,
      options,
    )) {
      if (count >= NATIVE3D_OBSERVATION_LIMITS.passes)
        passageError(
          "comp-native3d-limit",
          "Native output exceeds contributing pass admission",
          {
            frame: outputFrame,
            node: pass.frame.controller,
            path: "nativeObservations",
          },
        );
      const reference = pass.frame;
      const variant = resolveNative3DVariantVersions(
        options.preparedNative3D,
        reference,
      );
      const longestMesh =
        variant.source.geometry.meshes
          .map((mesh) => mesh.id)
          .sort(
            (a, b) =>
              encoder.encode(JSON.stringify(b)).length -
              encoder.encode(JSON.stringify(a)).length,
          )[0] ?? "mesh";
      const parts = Object.fromEntries(
        variant.source.parts.map((part) => [
          part.id,
          {
            ...(part.parent === undefined ? {} : { parent: part.parent }),
            localMatrix: matrix,
            worldMatrix: matrix,
            localVisible: false,
            inheritedVisible: false,
          },
        ]),
      );
      const projection = {
        world: vector,
        pixel: [large, large],
        depth: large,
        visibility: "behind-camera",
        occluderMesh: longestMesh,
      };
      const common = {
        controller: reference.controller,
        scope: reference.scope,
        scopeFrame: reference.scopeFrame,
        sourceFrame: reference.sourceFrame,
        sourceSha256: reference.sourceSha256,
        effectiveSceneSha256: reference.effectiveSceneSha256,
        geometrySha256: reference.geometrySha256,
        appearanceCodeSha256: digest,
        viewport: [0, 0, pass.width, pass.height],
        camera,
        parts,
        pass: { completed: true, calls: large, triangles: large },
      };
      let observed: unknown;
      if (
        variant.version === "prepared-native3d-variant-1" &&
        reference.version === "native3d-frame-1"
      ) {
        observed = {
          ...common,
          version: "native3d-observed-frame-1",
          frameKey: reference.frameKey,
          anchors: Object.fromEntries(
            variant.source.anchors.map((anchor) => [
              anchor.id,
              {
                part: anchor.part,
                ...projection,
                visibilityMethod: "three-physical-mesh-segment",
              },
            ]),
          ),
        };
      } else if (
        variant.version === "prepared-native3d-variant-2" &&
        reference.version === "native3d-frame-2"
      ) {
        observed = {
          ...common,
          version: "native3d-observed-frame-2",
          sourceVersion: "mechanism-scene-2",
          usedStreamVersion: "native3d-used-indexed-streams-1",
          digestPacking: "float32-uint16-little-endian-1",
          finalizerVersion: NATIVE3D_FRAME_FINALIZER_VERSION,
          precisionPolicy: NATIVE3D_SHAPE_PRECISION_POLICY,
          sourceKey: reference.sourceKey,
          frameKeySha256: digest,
          anchors: Object.fromEntries(
            variant.source.anchors.map((anchor) => [
              anchor.id,
              {
                status: "positioned",
                source: anchor.source,
                part: reference.frame.anchors[anchor.id]!.part,
                ...projection,
                positionMethod: "used-position-landmark-1",
                visibilityMethod:
                  "three-physical-mesh-segment-with-used-shapes-2",
              },
            ]),
          ),
          shapes: Object.fromEntries(
            Object.entries(variant.shapeAssociations).map(
              ([id, association]) => [
                id,
                {
                  association,
                  status: "drawn",
                  driverStateKey: reference.frame.shapeStates[id]!.stateKey,
                  ownerWorldMatrix: matrix,
                  positionSha256: digest,
                  normalSha256: digest,
                  indexSha256: digest,
                  positionLayout: layout,
                  normalLayout: layout,
                  landmarks: Object.fromEntries(
                    Object.keys(reference.frame.shapeStates[id]!.landmarks).map(
                      (landmark) => [
                        landmark,
                        {
                          local: vector,
                          world: vector,
                          positionMethod: "used-position-landmark-1",
                        },
                      ],
                    ),
                  ),
                  submissions: association.groups.map((group) => ({
                    ...group,
                    drawOrdinal: large,
                    readbackOrdinal: large,
                    streamSet: 0,
                    mode: 4,
                    type: 5123,
                    byteOffset: large,
                  })),
                },
              ],
            ),
          ),
        };
      } else {
        passageError(
          "comp-native3d-protocol",
          "Native capacity source/frame protocols differ",
          {
            frame: outputFrame,
            node: reference.controller,
            path: "nativeObservations",
          },
        );
      }
      // A quoted 40-byte scalar upper bound covers every finite JSON number.
      bytes +=
        encoder.encode(
          JSON.stringify(
            { sampleIndex: count++, sampleFrame: pass.sampleFrame, observed },
            (_key, value) =>
              typeof value === "number"
                ? "-1.234567890123456789012345678901234e-308"
                : value,
          ),
        ).length + 1;
      if (bytes > NATIVE3D_OBSERVATION_LIMITS.packetBytes)
        passageError(
          "comp-native3d-limit",
          "Native output exceeds observation byte admission",
          {
            frame: outputFrame,
            node: reference.controller,
            path: "nativeObservations",
          },
        );
    }
    return bytes;
  } finally {
    lease?.release();
  }
}
