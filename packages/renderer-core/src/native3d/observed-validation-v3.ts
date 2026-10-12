import {
  NativeObservedFrameV3Schema,
  NativeFrameSnapshotV3Schema,
  NATIVE3D_OBSERVATION_LIMITS,
} from "@still-shift/scene-contract";
import type {
  NativeFrameSnapshotV3,
  NativeObservedFrameV3,
} from "@still-shift/scene-contract";
import {
  allocateRenderPixels,
  renderMemory,
} from "../managed-memory-context.ts";
import { passageError } from "../passage-diagnostics.ts";
import {
  hashNativeUsedBytes,
  packNativeObservedFrameKey,
} from "./used-stream-bytes.ts";
import {
  nativeExpectedObservedCameraV2,
  nativeExpectedShapeOutsideFrustumV2,
} from "./observed-precision-v2.ts";
import { nativeExpectedPbrMatrices } from "./pbr-frame-matrices.ts";
import { hashNativeData } from "./canonical-hash.ts";
import { nativeAnchorVisibilities } from "./physical-visibility.ts";
import type { PreparedNative3DVariantV3 } from "./types-v3.ts";
import type { DeepReadonly } from "./types.ts";

/** Pure intended state and private prepared source; never Three objects, expected renderer output or incoming receipt geometry. */
export async function assertNativeObservedFrameV3(
  variant: PreparedNative3DVariantV3,
  reference: DeepReadonly<NativeFrameSnapshotV3>,
  input: unknown,
  appearanceCodeSha256: string,
  signal?: AbortSignal,
): Promise<NativeObservedFrameV3> {
  const location = {
      node: reference.controller,
      frame: reference.sourceFrame,
      path: `${reference.scope}/${reference.controller}.observation`,
    },
    fail: (message: string) => never = (message) =>
      passageError("comp-native3d-observation", message, location),
    memory = renderMemory(),
    lease = memory?.reserve(
      "metadata",
      NATIVE3D_OBSERVATION_LIMITS.packetBytes * 8 +
        262144 +
        variant.source.geometry.meshes.reduce(
          (sum, mesh) => sum + (mesh.positions.length / 3) * 256,
          0,
        ),
      undefined,
      true,
    );
  const assertLive = () => {
    if (signal?.aborted || (lease && !lease.active))
      fail("Independent PBR observation checker was aborted or disposed");
  };
  const numeric = (
    actual: readonly number[],
    expected: readonly number[],
    epsilon = 1e-8,
  ) => {
    if (
      actual.length !== expected.length ||
      actual.some(
        (value, index) => Math.abs(value - expected[index]!) > epsilon,
      )
    )
      fail("PBR observed numeric state differs from intended source/pose");
  };
  const inventory = (
    actual: Record<string, unknown>,
    expected: readonly string[],
  ) => {
    if (
      Object.keys(actual).length !== expected.length ||
      expected.some((id) => !Object.hasOwn(actual, id))
    )
      fail("PBR observation inventory differs from intended source");
  };
  try {
    assertLive();
    const snapshot = NativeFrameSnapshotV3Schema.parse(reference);
    if (
      reference.sourceKey !== variant.sourceKey ||
      reference.sourceSha256 !== variant.sourceSha256 ||
      reference.effectiveSceneSha256 !== variant.effectiveSceneSha256 ||
      reference.geometrySha256 !== variant.geometrySha256
    )
      fail("Assigned PBR frame differs from trusted prepared variant");
    const parsed = NativeObservedFrameV3Schema.safeParse(input);
    if (!parsed.success) fail("Invalid source3 observed frame");
    const observed = parsed.data;
    if (
      new TextEncoder().encode(JSON.stringify(observed)).byteLength >
      NATIVE3D_OBSERVATION_LIMITS.packetBytes
    )
      fail("PBR observation packet exceeds admission");
    for (const field of [
      "sourceKey",
      "sourceSha256",
      "effectiveSceneSha256",
      "geometrySha256",
      "controller",
      "scope",
      "sourceFrame",
      "scopeFrame",
    ] as const)
      if (observed[field] !== reference[field])
        fail("PBR observed identity differs: " + field);
    if (observed.appearanceCodeSha256 !== appearanceCodeSha256)
      fail("PBR observed appearance identity differs");
    const key = packNativeObservedFrameKey(reference.frameKey);
    try {
      if (
        observed.frameKeySha256 !==
        (await hashNativeUsedBytes(key.bytes, assertLive))
      )
        fail("PBR observed assigned frame key differs");
    } finally {
      key.dispose();
    }
    numeric(
      observed.viewport,
      [0, 0, reference.viewport.width, reference.viewport.height],
      0,
    );
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
      numeric(observed.camera[field], camera[field]);
    for (const field of ["near", "far", "aspect", "fovDegrees"] as const)
      numeric([observed.camera[field]], [camera[field]], 1e-12);
    inventory(
      observed.parts,
      variant.source.parts.map((part) => part.id),
    );
    for (const part of variant.source.parts) {
      const actual = observed.parts[part.id]!,
        intended = reference.frame.parts[part.id]!;
      if (
        actual.parent !== part.parent ||
        actual.localVisible !== reference.localVisibility[part.id] ||
        actual.inheritedVisible !== intended.visible
      )
        fail("PBR observed hierarchy or visibility differs");
      numeric(actual.localMatrix, intended.localMatrix);
      numeric(actual.worldMatrix, intended.worldMatrix);
    }
    inventory(
      observed.meshes,
      variant.source.geometry.meshes.map((mesh) => mesh.id),
    );
    const packedPositions: Record<string, number[]> = Object.create(null);
    for (const mesh of variant.source.geometry.meshes) {
      const actual = observed.meshes[mesh.id]!,
        part = reference.frame.parts[mesh.partId]!;
      packedPositions[mesh.id] = mesh.positions.map(Math.fround);
      if (actual.part !== mesh.partId) fail("PBR observed mesh owner differs");
      numeric(actual.ownerWorldMatrix, part.worldMatrix);
      if (actual.status === "not-drawn") {
        if (
          actual.reason === "authored-hidden"
            ? part.visible
            : !part.visible ||
              !nativeExpectedShapeOutsideFrustumV2(
                mesh.positions,
                part.worldMatrix,
                camera,
              )
        )
          fail("PBR missing draw has no independently verified allowance");
        continue;
      }
      if (!part.visible) fail("Authored hidden PBR mesh was drawn");
      const groups = mesh.groups?.length
        ? mesh.groups.map((group, groupIndex) => ({
            ...group,
            groupIndex,
            material: variant.source.geometry.materials[group.materialIndex]!,
          }))
        : [
            {
              groupIndex: 0,
              start: 0,
              count: mesh.indices.length,
              material: variant.source.geometry.materials.find(
                (material) => material.id === mesh.materialId,
              )!,
            },
          ];
      if (actual.submissions.length !== groups.length)
        fail("PBR observed mesh has incomplete draw groups");
      const expectedHashes: Record<string, string> = Object.create(null),
        indexBytes = mesh.indices.some((index) => index >= 65535) ? 4 : 2;
      for (const [name, values] of [
        ["position", mesh.positions],
        ["normal", mesh.normals],
        ["uv", mesh.uvs],
        ["tangent", mesh.tangents],
        ["indices", mesh.indices],
      ] as const) {
        if (!values) continue;
        const width = name === "indices" ? indexBytes : 4,
          bytes = allocateRenderPixels(
            values.length * width,
            () => new Uint8Array(values.length * width),
            true,
          ),
          view = new DataView(bytes.buffer);
        try {
          values.forEach((value, index) => {
            if (name !== "indices") view.setFloat32(index * width, value, true);
            else if (width === 4) view.setUint32(index * width, value, true);
            else view.setUint16(index * width, value, true);
          });
          expectedHashes[name] = await hashNativeUsedBytes(bytes, assertLive);
        } finally {
          memory?.release(bytes.buffer);
        }
      }
      const matrices = nativeExpectedPbrMatrices(
        reference,
        mesh.partId,
        camera,
      );
      for (const draw of actual.submissions) {
        const group = groups.find(
          (group) => group.groupIndex === draw.groupIndex,
        );
        if (
          !group ||
          draw.start !== group.start ||
          draw.count !== group.count ||
          draw.material !== group.material.id ||
          draw.materialSha256 !== (await hashNativeData(group.material)) ||
          draw.type !== (indexBytes === 4 ? 5125 : 5123)
        )
          fail("PBR observed indexed material range differs");
        for (const field of [
          "modelViewMatrix",
          "projectionMatrix",
          "normalMatrix",
        ] as const)
          numeric(draw[field], matrices[field], 0);
        for (const [name, digest] of Object.entries(draw.vertexHashes))
          if (digest !== expectedHashes[name])
            fail("PBR used GPU attribute digest differs: " + name);
        const bindings = [
          group.material.baseColorTexture,
          group.material.metallicRoughnessTexture,
          group.material.normalTexture,
        ].filter((binding) => binding !== undefined);
        if (
          draw.textures.length !== bindings.length ||
          (bindings.length && !draw.vertexHashes.uv) ||
          (group.material.normalTexture && !draw.vertexHashes.tangent)
        )
          fail("PBR used texture/attribute role coverage differs");
        for (const [index, binding] of bindings.entries()) {
          const texture = draw.textures[index]!,
            image = variant.source.geometry.images.find(
              (image) => image.id === binding.image,
            )!;
          if (
            texture.image !== image.id ||
            texture.pixelSha256 !== image.pixelSha256 ||
            texture.colorSpace !== binding.colorSpace
          )
            fail("PBR observed used texture identity differs");
          let width = image.width,
            height = image.height,
            levels = 1;
          if (binding.sampler.minFilter >= 9984)
            while (width > 1 || height > 1) {
              width = Math.max(1, Math.floor(width / 2));
              height = Math.max(1, Math.floor(height / 2));
              levels++;
            }
          if (
            texture.levels.length !== levels ||
            texture.levels[0]!.width !== image.width ||
            texture.levels[0]!.height !== image.height
          )
            fail("PBR observation omitted a used mip level");
        }
      }
    }
    inventory(
      observed.anchors,
      variant.source.anchors.map((anchor) => anchor.id),
    );
    const visibility = nativeAnchorVisibilities(
      variant.source.geometry,
      snapshot.frame,
      packedPositions,
    );
    for (const definition of variant.source.anchors) {
      if (definition.source.kind !== "part-local")
        fail("PBR checker requires rigid part anchors");
      const actual = observed.anchors[definition.id]!,
        intended = reference.frame.anchors[definition.id]!,
        physical = visibility[definition.id]!;
      if (
        actual.part !== definition.source.part ||
        actual.visibility !== physical.visibility ||
        actual.occluderMesh !== physical.occluderMesh ||
        (actual.pixel === null) !== (intended.pixel === null)
      )
        fail("PBR observed anchor association/projection/occlusion differs");
      numeric(actual.world, intended.world);
      numeric([actual.depth], [intended.depth]);
      if (actual.pixel && intended.pixel)
        numeric(actual.pixel, intended.pixel, 0.5);
    }
    assertLive();
    return observed;
  } finally {
    lease?.release();
  }
}
