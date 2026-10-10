import {
  Native3DLayerSchema,
  NativeObservedFrameV2Schema,
  MechanismCameraSchema,
  NativeShapeAssociationSchema,
} from "@still-shift/scene-contract";
import type {
  Native3DSourceV2,
  NativeObservedShape,
  MechanismProjectedAnchor,
} from "@still-shift/scene-contract";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { sampleNativeFrameV2 } from "../../packages/renderer-core/src/native3d/evaluate-v2.ts";
import { hashNativeData } from "../../packages/renderer-core/src/native3d/canonical-hash.ts";
import {
  nativeExpectedObservedCameraV2,
  nativeExpectedShapeLandmarkV2,
} from "../../packages/renderer-core/src/native3d/observed-precision-v2.ts";
import {
  hashNativeUsedBytes,
  packNativeExpectedStream,
  packNativeObservedFrameKey,
} from "../../packages/renderer-core/src/native3d/used-stream-bytes.ts";
import { nativeAnchorVisibilities } from "../../packages/renderer-core/src/native3d/physical-visibility.ts";
import { projectMechanismAnchor } from "../../packages/renderer-core/src/mechanism/projection.ts";
import { mechanismV2Fixture } from "./mechanism-v2-fixture.ts";

/** Synthetic schema/checker fixture only; actual submitted-buffer evidence lives in the browser gate. */
export async function nativeFrameObservationFixtureV2(
  input: Native3DSourceV2 = mechanismV2Fixture(),
) {
  const prepared = await prepareNative3DSceneV2(
      input,
      await hashNativeData(input),
    ),
    variant = prepared.variants[prepared.baseSourceKey]!;
  const controller = Native3DLayerSchema.parse({
    id: "world",
    type: "native3d",
    asset: "mechanism",
    sourceStartFrame: 0,
    sourceFps: 30,
  });
  const reference = sampleNativeFrameV2(prepared, controller, {
    scope: "synthetic-frame2",
    scopeFrame: 80.5,
    layerTime: 0.5,
    owningScopeFps: 30,
    width: 320,
    height: 180,
  });
  const shapes: Record<string, NativeObservedShape> = Object.create(null);
  let ordinal = 0;
  for (const shape of input.teachingShapes) {
    const association = variant.shapeAssociations[shape.id]!,
      state = reference.frame.shapeStates[shape.id]!,
      mesh = input.geometry.meshes.find((mesh) => mesh.id === shape.mesh)!;
    const digest = async (
      values: readonly number[],
      type: "float32" | "uint16",
    ) => {
      const owner = packNativeExpectedStream(values, type);
      try {
        return await hashNativeUsedBytes(owner.bytes, () => {});
      } finally {
        owner.dispose();
      }
    };
    const landmarks = Object.fromEntries(
      shape.landmarks.map((landmark) => {
        const expected = nativeExpectedShapeLandmarkV2(
          state.positions,
          landmark,
          reference.frame.parts[shape.ownerPart]!.worldMatrix,
        );
        return [
          landmark.id,
          {
            local: expected.local,
            world: expected.world,
            positionMethod: "used-position-landmark-1" as const,
          },
        ];
      }),
    );
    const layout = {
      byteLength: association.vertexCount * 12,
      components: 3 as const,
      type: 5126 as const,
      enabled: true as const,
      normalized: false as const,
      integer: false as const,
      divisor: 0 as const,
      stride: 12 as const,
      byteOffset: 0 as const,
    };
    shapes[shape.id] = {
      association: NativeShapeAssociationSchema.parse(association),
      driverStateKey: state.stateKey,
      status: "drawn",
      ownerWorldMatrix: reference.frame.parts[shape.ownerPart]!.worldMatrix,
      positionSha256: await digest(state.positions, "float32"),
      normalSha256: await digest(state.normals, "float32"),
      indexSha256: await digest(mesh.indices, "uint16"),
      positionLayout: { ...layout, location: 0 },
      normalLayout: { ...layout, location: 1 },
      landmarks,
      submissions: association.groups.map((group) => ({
        ...group,
        drawOrdinal: ordinal,
        readbackOrdinal: ordinal++,
        streamSet: 0 as const,
        mode: 4 as const,
        type: 5123 as const,
        byteOffset: group.start * 2,
      })),
    };
  }
  const cameraDefinition = MechanismCameraSchema.parse(reference.frame.camera);
  const projected: Record<string, MechanismProjectedAnchor> =
    Object.create(null);
  for (const anchor of input.anchors) {
    const expected = reference.frame.anchors[anchor.id]!,
      source = anchor.source;
    const shape =
      source.kind === "shape-landmark" ? shapes[source.shape] : undefined;
    const world =
      source.kind === "shape-landmark" && shape?.status === "drawn"
        ? shape.landmarks[source.landmark]!.world
        : expected.world;
    projected[anchor.id] = projectMechanismAnchor(
      anchor.id,
      expected.part,
      [...world],
      reference.frame.parts[expected.part]!.visible,
      cameraDefinition,
      320,
      180,
    );
  }
  const positions = Object.fromEntries(
    input.geometry.meshes.map((mesh) => [
      mesh.id,
      (
        Object.values(reference.frame.shapeStates).find(
          (shape) => shape.mesh === mesh.id,
        )?.positions ?? mesh.positions
      ).map(Math.fround),
    ]),
  );
  const visibility = nativeAnchorVisibilities(
    input.geometry,
    {
      camera: cameraDefinition,
      parts: reference.frame.parts,
      anchors: projected,
    },
    positions,
  );
  const key = packNativeObservedFrameKey(reference.frameKey);
  let frameKeySha256: string;
  try {
    frameKeySha256 = await hashNativeUsedBytes(key.bytes, () => {});
  } finally {
    key.dispose();
  }
  const appearanceCodeSha256 = "sha256:" + "b".repeat(64);
  const observed = NativeObservedFrameV2Schema.parse({
    version: "native3d-observed-frame-2",
    finalizerVersion: "native3d-used-shape-frame-finalizer-2",
    precisionPolicy: "native3d-quantized-shape-landmarks-1",
    usedStreamVersion: "native3d-used-indexed-streams-1",
    digestPacking: "float32-uint16-little-endian-1",
    sourceVersion: "mechanism-scene-2",
    sourceKey: variant.sourceKey,
    sourceSha256: variant.sourceSha256,
    effectiveSceneSha256: variant.effectiveSceneSha256,
    geometrySha256: variant.geometrySha256,
    appearanceCodeSha256,
    frameKeySha256,
    controller: reference.controller,
    scope: reference.scope,
    scopeFrame: reference.scopeFrame,
    sourceFrame: reference.sourceFrame,
    viewport: [0, 0, 320, 180],
    camera: nativeExpectedObservedCameraV2(cameraDefinition, 320, 180),
    parts: Object.fromEntries(
      input.parts.map((part) => [
        part.id,
        {
          ...(part.parent ? { parent: part.parent } : {}),
          localMatrix: reference.frame.parts[part.id]!.localMatrix,
          worldMatrix: reference.frame.parts[part.id]!.worldMatrix,
          localVisible: reference.localVisibility[part.id],
          inheritedVisible: reference.frame.parts[part.id]!.visible,
        },
      ]),
    ),
    shapes,
    anchors: Object.fromEntries(
      input.anchors.map((anchor) => [
        anchor.id,
        {
          status: "positioned",
          source: anchor.source,
          part: projected[anchor.id]!.part,
          world: projected[anchor.id]!.world,
          pixel: projected[anchor.id]!.pixel,
          depth: projected[anchor.id]!.depth,
          positionMethod:
            anchor.source.kind === "part-local"
              ? "three-part-local-1"
              : "used-position-landmark-1",
          ...visibility[anchor.id],
          visibilityMethod: "three-physical-mesh-segment-with-used-shapes-2",
        },
      ]),
    ),
    pass: {
      completed: true,
      calls: ordinal + 1,
      triangles: input.geometry.meshes.reduce(
        (sum, mesh) => sum + mesh.indices.length / 3,
        0,
      ),
    },
  });
  return { variant, reference, observed, appearanceCodeSha256 };
}
