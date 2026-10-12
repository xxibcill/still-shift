import { renderMemory } from "../managed-memory-context.ts";
import {
  NativeObservedFrameV2Schema,
  MechanismCameraSchema,
} from "@still-shift/scene-contract";
import type {
  NativeFrameSnapshotV2,
  NativeObservedFrameV2,
  MechanismProjectedAnchor,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import type { PreparedNative3DVariantV2 } from "./types-v2.ts";
import { canonicalMechanismJson } from "../mechanism/canonical.ts";
import { projectMechanismAnchor } from "../mechanism/projection.ts";
import { nativeAnchorVisibilities } from "./physical-visibility.ts";
import { passageError } from "../passage-diagnostics.ts";
import {
  hashNativeUsedBytes,
  packNativeExpectedStream,
  packNativeObservedFrameKey,
} from "./used-stream-bytes.ts";
import {
  nativeExpectedObservedCameraV2,
  nativeExpectedShapeLandmarkV2,
  nativeExpectedShapeOutsideFrustumV2,
} from "./observed-precision-v2.ts";

export const NATIVE_OBSERVED_MATRIX_EPSILON = 1e-8;
export const NATIVE_OBSERVED_PIXEL_EPSILON = 0.5;

/** Validate against a trusted, freshly sampled prepared source; observed values never choose the expected pose. */
async function checkNativeObservedFrameV2(
  variant: PreparedNative3DVariantV2,
  reference: DeepReadonly<NativeFrameSnapshotV2>,
  input: unknown,
  appearanceCodeSha256: string,
  signal?: AbortSignal,
): Promise<NativeObservedFrameV2> {
  const fail: (message: string, path: string) => never = (message, path) =>
    passageError("comp-native3d-observation", message, {
      node: reference.controller,
      frame: reference.sourceFrame,
      path: `${reference.scope}/${reference.controller}.${path}`,
    });
  const assertLive = () => {
    if (signal?.aborted)
      fail("Independent native2 observation check was aborted", "observation");
  };
  assertLive();
  if (
    reference.sourceKey !== variant.sourceKey ||
    reference.sourceSha256 !== variant.sourceSha256 ||
    reference.effectiveSceneSha256 !== variant.effectiveSceneSha256 ||
    reference.geometrySha256 !== variant.geometrySha256
  )
    fail(
      "Assigned snapshot differs from the selected prepared native2 variant",
      "sourceKey",
    );
  const parsed = NativeObservedFrameV2Schema.safeParse(input);
  if (!parsed.success)
    fail(
      "Native2 completed pass has an invalid observed-frame contract",
      "observation",
    );
  const observed = parsed.data;
  for (const [name, expected] of Object.entries({
    sourceKey: variant.sourceKey,
    sourceSha256: variant.sourceSha256,
    effectiveSceneSha256: variant.effectiveSceneSha256,
    geometrySha256: variant.geometrySha256,
    appearanceCodeSha256,
    controller: reference.controller,
    scope: reference.scope,
    scopeFrame: reference.scopeFrame,
    sourceFrame: reference.sourceFrame,
  }))
    if (Reflect.get(observed, name) !== expected)
      fail(
        "Observed native2 identity differs from the assigned current pass",
        name,
      );
  const key = packNativeObservedFrameKey(reference.frameKey);
  try {
    if (
      observed.frameKeySha256 !==
      (await hashNativeUsedBytes(key.bytes, assertLive))
    )
      fail(
        "Observed native2 frame key differs from the assigned sample",
        "frameKeySha256",
      );
  } finally {
    key.dispose();
  }
  if (
    canonicalMechanismJson(observed.viewport) !==
    canonicalMechanismJson([
      0,
      0,
      reference.viewport.width,
      reference.viewport.height,
    ])
  )
    fail("Observed native2 viewport differs from its owning scope", "viewport");
  const same = (
    actual: readonly number[],
    expected: readonly number[],
    path: string,
    epsilon = NATIVE_OBSERVED_MATRIX_EPSILON,
  ) => {
    if (
      actual.length !== expected.length ||
      actual.some(
        (value, index) => Math.abs(value - expected[index]!) > epsilon,
      )
    )
      fail(
        "Observed native2 numeric state differs from independent current expectation",
        path,
      );
  };
  const inventory = (
    actual: object,
    expected: readonly string[],
    path: string,
  ) => {
    if (
      Object.keys(actual).length !== expected.length ||
      expected.some((id) => !Object.hasOwn(actual, id))
    )
      fail("Observed native2 inventory differs from its prepared source", path);
  };
  const cameraDefinition = MechanismCameraSchema.parse(reference.frame.camera);
  const camera = nativeExpectedObservedCameraV2(
    reference.frame.camera,
    reference.viewport.width,
    reference.viewport.height,
  );
  for (const field of [
    "worldMatrix",
    "viewMatrix",
    "projectionMatrix",
  ] as const)
    same(observed.camera[field], camera[field], `camera.${field}`);
  for (const field of ["near", "far", "fovDegrees", "aspect"] as const)
    if (Math.abs(observed.camera[field] - camera[field]) > 1e-12)
      fail(
        "Observed native2 lens differs from current expectation",
        `camera.${field}`,
      );
  inventory(
    observed.parts,
    variant.source.parts.map((part) => part.id),
    "parts",
  );
  for (const part of variant.source.parts) {
    const actual = observed.parts[part.id]!,
      expected = reference.frame.parts[part.id]!;
    if (
      actual.parent !== part.parent ||
      actual.localVisible !== reference.localVisibility[part.id] ||
      actual.inheritedVisible !== expected.visible
    )
      fail(
        "Observed native2 hierarchy/visibility differs from current expectation",
        `parts.${part.id}`,
      );
    same(
      actual.localMatrix,
      expected.localMatrix,
      `parts.${part.id}.localMatrix`,
    );
    same(
      actual.worldMatrix,
      expected.worldMatrix,
      `parts.${part.id}.worldMatrix`,
    );
  }
  inventory(
    observed.shapes,
    variant.source.teachingShapes.map((shape) => shape.id),
    "shapes",
  );
  const projected: Record<string, MechanismProjectedAnchor> =
      Object.create(null),
    notDrawn = new Set<string>();
  const worlds: Record<
    string,
    Record<string, ReturnType<typeof nativeExpectedShapeLandmarkV2>>
  > = Object.create(null);
  for (const definition of variant.source.teachingShapes) {
    assertLive();
    const actual = observed.shapes[definition.id]!,
      expected = reference.frame.shapeStates[definition.id]!,
      association = variant.shapeAssociations[definition.id]!;
    if (
      canonicalMechanismJson(actual.association) !==
        canonicalMechanismJson(association) ||
      actual.driverStateKey !== expected.stateKey
    )
      fail(
        "Observed shape is associated with a different recipe/driver/topology/material",
        `shapes.${definition.id}`,
      );
    if (actual.status === "not-drawn") {
      const policy = definition.drawEvidence;
      if (
        !policy ||
        policy.requiredIntervals.some(
          (interval) =>
            reference.sourceFrame >= interval.startFrame &&
            reference.sourceFrame < interval.endFrameExclusive,
        ) ||
        !policy.allowedOutsideProof.includes(actual.reason)
      )
        fail(
          "Observed missing draw violates its source-clock proof policy",
          `shapes.${definition.id}`,
        );
      if (
        actual.reason === "authored-hidden"
          ? reference.frame.parts[definition.ownerPart]!.visible
          : !nativeExpectedShapeOutsideFrustumV2(
              expected.positions,
              reference.frame.parts[definition.ownerPart]!.worldMatrix,
              camera,
            )
      )
        fail(
          "Observed not-drawn reason is not independently supported",
          `shapes.${definition.id}`,
        );
      notDrawn.add(definition.mesh);
      continue;
    }
    const mesh = variant.source.geometry.meshes.find(
      (mesh) => mesh.id === definition.mesh,
    )!;
    for (const [field, values, type] of [
      ["positionSha256", expected.positions, "float32"],
      ["normalSha256", expected.normals, "float32"],
      ["indexSha256", mesh.indices, "uint16"],
    ] as const) {
      const owner = packNativeExpectedStream(values, type);
      try {
        if (
          actual[field] !== (await hashNativeUsedBytes(owner.bytes, assertLive))
        )
          fail(
            "Observed used-GPU digest differs from independently packed current state",
            `shapes.${definition.id}.${field}`,
          );
      } finally {
        owner.dispose();
      }
    }
    same(
      actual.ownerWorldMatrix,
      reference.frame.parts[definition.ownerPart]!.worldMatrix,
      `shapes.${definition.id}.ownerWorldMatrix`,
    );
    worlds[definition.id] = Object.create(null);
    for (const landmark of definition.landmarks) {
      const intended = nativeExpectedShapeLandmarkV2(
          expected.positions,
          landmark,
          reference.frame.parts[definition.ownerPart]!.worldMatrix,
        ),
        used = actual.landmarks[landmark.id]!;
      same(
        used.local,
        intended.local,
        `shapes.${definition.id}.landmarks.${landmark.id}.local`,
        0,
      );
      same(
        used.world,
        intended.world,
        `shapes.${definition.id}.landmarks.${landmark.id}.world`,
      );
      intended.world.forEach((value, axis) => {
        if (
          Math.abs(value - intended.analyticWorld[axis]!) >
          intended.quantizationBound[axis]! + 1e-8
        )
          fail(
            "GPU quantization exceeds its separately derived Float32 bound",
            `shapes.${definition.id}.landmarks.${landmark.id}`,
          );
      });
      worlds[definition.id]![landmark.id] = intended;
    }
  }
  inventory(
    observed.anchors,
    variant.source.anchors.map((anchor) => anchor.id),
    "anchors",
  );
  for (const definition of variant.source.anchors) {
    const actual = observed.anchors[definition.id]!,
      source = definition.source,
      expected = reference.frame.anchors[definition.id]!;
    if (
      canonicalMechanismJson(actual.source) !==
        canonicalMechanismJson(source) ||
      actual.part !== expected.part
    )
      fail(
        "Observed anchor source/owner differs from the prepared declaration",
        `anchors.${definition.id}`,
      );
    if (
      source.kind === "shape-landmark" &&
      notDrawn.has(variant.shapeAssociations[source.shape]!.mesh)
    ) {
      if (actual.status !== "not-drawn")
        fail(
          "Not-drawn shape published physical anchor success",
          `anchors.${definition.id}`,
        );
      continue;
    }
    if (actual.status !== "positioned")
      fail(
        "Drawn/part-local anchor is missing its current position",
        `anchors.${definition.id}`,
      );
    const world =
      source.kind === "shape-landmark"
        ? worlds[source.shape]![source.landmark]!.world
        : expected.world;
    same(actual.world, world, `anchors.${definition.id}.world`);
    projected[definition.id] = projectMechanismAnchor(
      definition.id,
      expected.part,
      [...world],
      reference.frame.parts[expected.part]!.visible,
      cameraDefinition,
      reference.viewport.width,
      reference.viewport.height,
    );
    const projection = projected[definition.id]!;
    if (actual.pixel === null || projection.pixel === null) {
      if (actual.pixel !== projection.pixel)
        fail(
          "Observed anchor pixel availability differs from its current projection",
          `anchors.${definition.id}.pixel`,
        );
    } else if (
      Math.hypot(
        actual.pixel[0] - projection.pixel[0],
        actual.pixel[1] - projection.pixel[1],
      ) > NATIVE_OBSERVED_PIXEL_EPSILON
    )
      fail(
        "Observed anchor pixel differs by more than the unchanged projection tolerance",
        `anchors.${definition.id}.pixel`,
      );
    if (Math.abs(actual.depth - projection.depth) > 1e-8)
      fail(
        "Observed anchor depth differs from current quantized expectation",
        `anchors.${definition.id}.depth`,
      );
  }
  const geometry = {
    ...variant.source.geometry,
    meshes: variant.source.geometry.meshes.filter(
      (mesh) => !notDrawn.has(mesh.id),
    ),
  };
  const positions = Object.fromEntries(
    geometry.meshes.map((mesh) => [
      mesh.id,
      (
        Object.values(reference.frame.shapeStates).find(
          (shape) => shape.mesh === mesh.id,
        )?.positions ?? mesh.positions
      ).map(Math.fround),
    ]),
  );
  const visibility = nativeAnchorVisibilities(
    geometry,
    {
      camera: cameraDefinition,
      parts: reference.frame.parts,
      anchors: projected,
    },
    positions,
  );
  for (const [id, expected] of Object.entries(visibility)) {
    const actual = observed.anchors[id]!;
    if (
      actual.status !== "positioned" ||
      actual.visibility !== expected.visibility ||
      actual.occluderMesh !== expected.occluderMesh
    )
      fail(
        "Observed physical projection/occlusion differs from independent packed-geometry expectation",
        `anchors.${id}.visibility`,
      );
  }
  assertLive();
  return observed;
}

/** Admit current packet, packed geometry and ray-cache ownership before independent checking. */
export async function assertNativeObservedFrameV2(
  variant: PreparedNative3DVariantV2,
  reference: DeepReadonly<NativeFrameSnapshotV2>,
  input: unknown,
  appearanceCodeSha256: string,
  signal?: AbortSignal,
): Promise<NativeObservedFrameV2> {
  const bytes =
    131072 +
    variant.source.parts.length * 1024 +
    variant.source.anchors.length * 2048 +
    reference.frameKey.length * 4 +
    variant.source.geometry.meshes.reduce(
      (sum, mesh) => sum + (mesh.positions.length / 3) * 256,
      0,
    ) +
    Object.values(variant.shapeAssociations).reduce(
      (sum, shape) => sum + shape.groups.length * 4096,
      0,
    );
  const lease = renderMemory()?.reserve("metadata", bytes, undefined, true);
  try {
    const result = await checkNativeObservedFrameV2(
      variant,
      reference,
      input,
      appearanceCodeSha256,
      signal,
    );
    if (lease && !lease.active)
      passageError(
        "comp-native3d-observation",
        "Independent native2 checker memory owner was disposed",
        {
          node: reference.controller,
          frame: reference.sourceFrame,
          path: `${reference.scope}/${reference.controller}.observation`,
        },
      );
    return result;
  } finally {
    lease?.release();
  }
}
