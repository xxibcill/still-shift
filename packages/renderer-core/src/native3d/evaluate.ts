import {
  MechanismCameraSchema,
  MechanismCameraKeysSchema,
  NativeFrameSnapshotSchema,
} from "@still-shift/scene-contract";
import type {
  Native3DLayer,
  NativeFrameSnapshot,
  SolidFrameResult,
  MechanismPartFrame,
  MechanismCamera,
  MechanismVector,
} from "@still-shift/scene-contract";
import { evaluateMechanismFrame } from "../mechanism/evaluate.ts";
import { multiplyMatrices, transformPoint } from "../mechanism/matrix.ts";
import { projectMechanismAnchor } from "../mechanism/projection.ts";
import { canonicalMechanismJson } from "../mechanism/canonical.ts";
import { passageError } from "../passage-diagnostics.ts";
import { native3DOverridesKey, freezeNativeData } from "./prepare.ts";
import { nativeScreenAnchors } from "./visibility.ts";
import type {
  NativeScopeSample,
  PreparedNative3DScene,
  PreparedSolidScene,
} from "./types.ts";

function solidCamera(
  prepared: PreparedSolidScene,
  controller: Native3DLayer,
  sourceFrame: number,
): MechanismCamera {
  const camera = MechanismCameraSchema.parse(
    controller.camera ?? prepared.scene.camera,
  );
  if (!controller.cameraKeys) return camera;
  const keys = MechanismCameraKeysSchema.parse(controller.cameraKeys);
  let left = keys[0]!,
    right = left;
  for (const key of keys) {
    if (key.frame <= sourceFrame) left = key;
    if (key.frame >= sourceFrame) {
      right = key;
      break;
    }
    right = key;
  }
  let fraction =
    left.frame === right.frame
      ? 0
      : (sourceFrame - left.frame) / (right.frame - left.frame);
  fraction = Math.min(1, Math.max(0, fraction));
  if (left.easing === "hold") fraction = 0;
  else if (left.easing === "smoothstep")
    fraction = fraction * fraction * (3 - 2 * fraction);
  const vector = (a: MechanismVector, b: MechanismVector): MechanismVector =>
    a.map(
      (value, axis) => value + (b[axis]! - value) * fraction,
    ) as MechanismVector;
  return MechanismCameraSchema.parse({
    ...camera,
    position: vector(left.position, right.position),
    target: vector(left.target, right.target),
    fovDegrees:
      (left.fovDegrees ?? camera.fovDegrees) +
      ((right.fovDegrees ?? camera.fovDegrees) -
        (left.fovDegrees ?? camera.fovDegrees)) *
        fraction,
  });
}

export function evaluateSolidFrame(
  prepared: PreparedSolidScene,
  controller: Native3DLayer,
  sourceFrame: number,
  width: number,
  height: number,
): SolidFrameResult {
  if (Object.keys(controller.controls ?? {}).length)
    passageError(
      "comp-native3d-source",
      "Solid sources have no mechanism rig control writers",
      {
        node: controller.id,
        path: `${controller.id}.controls`,
        frame: sourceFrame,
      },
    );
  const hidden = new Set(controller.hiddenParts ?? []);
  for (const id of hidden)
    if (!Object.hasOwn(prepared.baseLocalMatrices, id))
      passageError("comp-native3d-source", `Unknown hidden part ${id}`, {
        node: controller.id,
        path: `${controller.id}.hiddenParts`,
        frame: sourceFrame,
      });
  const camera = solidCamera(prepared, controller, sourceFrame);
  const definitions = new Map(
    prepared.scene.parts.map((part) => [part.id, part]),
  );
  const parts: Record<string, MechanismPartFrame> = Object.create(null);
  for (const id of prepared.orderedPartIds) {
    const definition = definitions.get(id)!,
      parent =
        definition.parent === undefined ? undefined : parts[definition.parent]!;
    const localMatrix = prepared.baseLocalMatrices[id]!;
    parts[id] = {
      id,
      ...(definition.parent === undefined ? {} : { parent: definition.parent }),
      localMatrix,
      worldMatrix: parent
        ? multiplyMatrices(parent.worldMatrix, localMatrix)
        : localMatrix,
      visible:
        definition.visible && !hidden.has(id) && (parent?.visible ?? true),
    };
  }
  const anchors = Object.fromEntries(
    prepared.scene.anchors.map((anchor) => {
      const part = parts[anchor.part]!;
      return [
        anchor.id,
        projectMechanismAnchor(
          anchor.id,
          anchor.part,
          transformPoint(part.worldMatrix, anchor.position),
          part.visible,
          camera,
          width,
          height,
        ),
      ];
    }),
  );
  return {
    version: "solid-evaluator-1",
    frame: sourceFrame,
    seed: controller.seed ?? prepared.scene.seed,
    camera,
    parts,
    anchors,
  };
}

/** Fractional random access. Preparation is the only stage that hashes geometry. */
export function sampleNativeFrame(
  prepared: PreparedNative3DScene,
  controller: Native3DLayer,
  sample: NativeScopeSample,
): NativeFrameSnapshot {
  const location = {
    node: controller.id,
    path: `${sample.scope}/${controller.id}`,
    frame: sample.scopeFrame,
  };
  if (
    ![sample.scopeFrame, sample.layerTime, sample.owningScopeFps].every(
      Number.isFinite,
    ) ||
    sample.owningScopeFps <= 0
  )
    passageError(
      "comp-native3d-clock",
      "Native sampling requires a finite resolved owning clock",
      location,
    );
  const sourceFrame =
    controller.sourceStartFrame +
    (sample.layerTime * controller.sourceFps) / sample.owningScopeFps;
  if (!Number.isFinite(sourceFrame) || sourceFrame < 0 || sourceFrame > 108_000)
    passageError(
      "comp-native3d-clock",
      "Native source time is outside its bounded source interval",
      { ...location, path: location.path + ".sourceStartFrame" },
    );
  if (
    !Number.isInteger(sample.width) ||
    !Number.isInteger(sample.height) ||
    sample.width < 16 ||
    sample.height < 16 ||
    sample.width > 8192 ||
    sample.height > 8192 ||
    sample.width * sample.height > 8_388_608
  )
    passageError(
      "comp-native3d-limit",
      "Native viewport exceeds the admitted pixel/axis bounds",
      location,
    );
  const requestKey = native3DOverridesKey({
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
  const sourceKey = prepared.variantKeysByOverrides[requestKey]!,
    variant = prepared.variants[sourceKey]!;
  const request = {
    frame: sourceFrame,
    width: sample.width,
    height: sample.height,
    ...(controller.camera ? { camera: controller.camera } : {}),
    ...(controller.cameraKeys ? { cameraKeys: controller.cameraKeys } : {}),
    ...(controller.controls ? { controls: controller.controls } : {}),
    ...(controller.hiddenParts ? { hiddenParts: controller.hiddenParts } : {}),
    ...(controller.seed === undefined ? {} : { seed: controller.seed }),
  };
  const frame =
    variant.evaluation.version === "prepared-mechanism-scene-1"
      ? evaluateMechanismFrame(variant.evaluation, request)
      : evaluateSolidFrame(
          variant.evaluation,
          controller,
          sourceFrame,
          sample.width,
          sample.height,
        );
  const viewport = { width: sample.width, height: sample.height };
  const hidden = new Set(controller.hiddenParts ?? []);
  const localVisibility = Object.fromEntries(
    variant.source.parts.map((part) => [
      part.id,
      part.visible && !hidden.has(part.id),
    ]),
  );
  const frameKey = `native3d-frame-key-1:${canonicalMechanismJson({ sourceKey, controller: controller.id, asset: controller.asset, scope: sample.scope, scopeFrame: sample.scopeFrame, sourceFrame, viewport, request })}`;
  const snapshot: NativeFrameSnapshot = {
    version: "native3d-frame-1",
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
    frameKey,
    frame,
    localVisibility,
    anchors: nativeScreenAnchors(variant.source, frame),
  };
  // Validate scalar/frame transport without parsing and recloning the catalogue.
  NativeFrameSnapshotSchema.parse(snapshot);
  return freezeNativeData(snapshot);
}
