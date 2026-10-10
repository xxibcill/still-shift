import {
  Native3DLayerVersionsSchema,
  NativeFrameSnapshotV2Schema,
} from "@still-shift/scene-contract";
import type {
  Native3DLayer,
  NativeFrameSnapshotV2,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../mechanism/canonical.ts";
import { evaluateMechanismFrameV2 } from "../mechanism/evaluate-v2.ts";
import { passageError } from "../passage-diagnostics.ts";
import { freezeNativeData } from "./prepare.ts";
import { native3DOverridesKeyV2 } from "./override-keys.ts";
import { nativeSourceFrame } from "./sampling.ts";
import { nativeScreenAnchorsV2 } from "./visibility-v2.ts";
import type { NativeScopeSample } from "./types.ts";
import type { PreparedNative3DSceneV2 } from "./types-v2.ts";

/** Absolute fractional source time. No source IO, hash or mutable pose history. */
export function sampleNativeFrameV2(
  prepared: PreparedNative3DSceneV2,
  input: Native3DLayer,
  sample: NativeScopeSample,
): NativeFrameSnapshotV2 {
  const controller = Native3DLayerVersionsSchema.parse(input);
  const location = {
    node: controller.id,
    path: `${sample.scope}/${controller.id}`,
    frame: sample.scopeFrame,
  };
  if (controller.controls !== undefined)
    passageError(
      "comp-native3d-source",
      "Version 2 sources require rigControls",
      {
        ...location,
        path: location.path + ".controls",
      },
    );
  const sourceFrame = nativeSourceFrame(controller, sample);
  const requestKey = native3DOverridesKeyV2({
    ...(controller.partOverrides
      ? { partOverrides: controller.partOverrides }
      : {}),
    ...(controller.materialOverrides
      ? { materialOverrides: controller.materialOverrides }
      : {}),
  });
  if (!Object.hasOwn(prepared.variantKeysByOverrides, requestKey))
    passageError(
      "comp-native3d-not-ready",
      "Static edit requires a newly prepared native revision",
      location,
    );
  const sourceKey = prepared.variantKeysByOverrides[requestKey]!;
  const variant = prepared.variants[sourceKey]!;
  const request = {
    frame: sourceFrame,
    width: sample.width,
    height: sample.height,
    ...(controller.camera ? { camera: controller.camera } : {}),
    ...(controller.cameraKeys ? { cameraKeys: controller.cameraKeys } : {}),
    ...(controller.rigControls ? { rigControls: controller.rigControls } : {}),
    ...(controller.hiddenParts ? { hiddenParts: controller.hiddenParts } : {}),
    ...(controller.seed === undefined ? {} : { seed: controller.seed }),
  };
  const frame = evaluateMechanismFrameV2(variant.evaluation, request);
  const viewport = { width: sample.width, height: sample.height };
  const hidden = new Set(controller.hiddenParts ?? []);
  const snapshot: NativeFrameSnapshotV2 = {
    version: "native3d-frame-2",
    sourceVersion: "mechanism-scene-2",
    controller: controller.id,
    asset: controller.asset,
    scope: sample.scope,
    sourceKey,
    scopeFrame: sample.scopeFrame,
    sourceFrame,
    viewport,
    sourceSha256: variant.sourceSha256,
    effectiveSceneSha256: variant.effectiveSceneSha256,
    geometrySha256: variant.geometrySha256,
    frameKey: `native3d-frame-key-2:${canonicalMechanismJson({ sourceKey, controller: controller.id, asset: controller.asset, scope: sample.scope, scopeFrame: sample.scopeFrame, sourceFrame, viewport, request })}`,
    frame,
    localVisibility: Object.fromEntries(
      variant.source.parts.map((part) => [
        part.id,
        part.visible && !hidden.has(part.id),
      ]),
    ),
    anchors: nativeScreenAnchorsV2(variant.source, frame),
  };
  NativeFrameSnapshotV2Schema.parse(snapshot);
  return freezeNativeData(snapshot);
}
