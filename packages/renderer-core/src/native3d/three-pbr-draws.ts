import { Matrix4, Mesh } from "three";
import type { Material, WebGLRenderer } from "three";
import type { NativeFrameSnapshotV3 } from "@still-shift/scene-contract";
import { verifyNativePbrMaterialProfile } from "./three-pbr-material.ts";
import { captureNativePbrGpuDraw } from "./pbr-gpu-draw.ts";
import { nativeExpectedPbrMatrices } from "./pbr-frame-matrices.ts";
import { assertNativeShapeMatrix } from "./three-shape-draws.ts";
import {
  nativeExpectedObservedCameraV2,
  nativeExpectedShapeOutsideFrustumV2,
} from "./observed-precision-v2.ts";
import {
  inheritedThreeVisibility,
  verifyNativeThreeGeometry,
} from "./three-world.ts";
import type { NativeThreeWorldV3 } from "./three-world.ts";
import type { PreparedNative3DVariantV3 } from "./types-v3.ts";
import type { DeepReadonly } from "./types.ts";
import { renderMemory } from "../managed-memory-context.ts";

type Capture = ReturnType<typeof captureNativePbrGpuDraw>;
export interface NativeCapturedPbrMesh {
  mesh: string;
  part: string;
  ownerWorldMatrix: number[];
  reason?: "authored-hidden" | "outside-frustum";
  submissions: {
    groupIndex: number;
    drawOrdinal: number;
    start: number;
    count: number;
    material: string;
    matrices: ReturnType<typeof nativeExpectedPbrMatrices>;
    captured: Capture;
  }[];
}
function mismatch(message: string): never {
  throw Error("comp-native3d-observation: " + message);
}
/** Synchronously seal actual color submissions before asynchronous digest work. */
export function captureNativePbrFrameDraws(
  renderer: WebGLRenderer,
  world: NativeThreeWorldV3,
  variant: PreparedNative3DVariantV3,
  reference: DeepReadonly<NativeFrameSnapshotV3>,
  assertLive: () => void,
) {
  const gl = renderer.getContext();
  if (
    !(gl instanceof WebGL2RenderingContext) ||
    gl.drawElements !== WebGL2RenderingContext.prototype.drawElements ||
    gl.drawArrays !== WebGL2RenderingContext.prototype.drawArrays
  )
    mismatch("PBR capture requires unwrapped WebGL2 draw entries");
  const camera = nativeExpectedObservedCameraV2(
    reference.frame.camera,
    reference.viewport.width,
    reference.viewport.height,
  );
  function checkWorld() {
    assertLive();
    if (
      world.source !== variant.source ||
      world.parts.size !== variant.source.parts.length ||
      world.meshes.length !== variant.source.geometry.meshes.length ||
      world.world.overrideMaterial !== null ||
      !world.world.visible
    )
      mismatch("PBR world inventory or source owner differs");
    world.world.traverse((object) => {
      if (object instanceof Mesh && !world.meshes.includes(object))
        mismatch("Foreign mesh in owned PBR world");
    });
    for (const definition of variant.source.parts) {
      const part = world.parts.get(definition.id)!,
        intended = reference.frame.parts[definition.id]!;
      if (
        !part ||
        part.visible !== reference.localVisibility[definition.id] ||
        inheritedThreeVisibility(part) !== intended.visible ||
        part.parent !==
          (definition.parent ? world.parts.get(definition.parent) : world.world)
      )
        mismatch("PBR part hierarchy or visibility differs");
      assertNativeShapeMatrix(part.matrix.elements, intended.localMatrix);
      assertNativeShapeMatrix(part.matrixWorld.elements, intended.worldMatrix);
    }
    for (const [actual, expected] of [
      [world.camera.matrixWorld.elements, camera.worldMatrix],
      [world.camera.matrixWorldInverse.elements, camera.viewMatrix],
      [world.camera.projectionMatrix.elements, camera.projectionMatrix],
    ] as const)
      assertNativeShapeMatrix(actual, expected);
    if (
      world.camera.near !== camera.near ||
      world.camera.far !== camera.far ||
      world.camera.aspect !== camera.aspect ||
      world.camera.fov !== camera.fovDegrees
    )
      mismatch("PBR camera lens differs");
    for (const [
      index,
      definition,
    ] of variant.source.geometry.materials.entries())
      verifyNativePbrMaterialProfile(
        world.pbrResources.materials[index]!,
        definition,
        world.pbrResources,
      );
    verifyNativeThreeGeometry(variant.source, {
      geometries: world.pbrResources.geometries,
      dispose() {},
    });
  }
  checkWorld();
  const entries = variant.source.geometry.meshes.map((definition) => {
    const matches = world.meshes.filter((mesh) => mesh.name === definition.id),
      mesh = matches[0]!;
    if (
      matches.length !== 1 ||
      mesh.parent !== world.parts.get(definition.partId) ||
      !mesh.visible ||
      !mesh.layers.test(world.camera.layers) ||
      Reflect.get(mesh, "isInstancedMesh") ||
      Reflect.get(mesh, "isSkinnedMesh") ||
      Object.keys(mesh.geometry.morphAttributes).length ||
      mesh.customDepthMaterial ||
      mesh.customDistanceMaterial
    )
      mismatch("PBR mesh is outside the closed rigid profile");
    assertNativeShapeMatrix(mesh.matrix.elements, new Matrix4().elements);
    assertNativeShapeMatrix(
      mesh.matrixWorld.elements,
      reference.frame.parts[definition.partId]!.worldMatrix,
    );
    const groups = definition.groups?.length
      ? definition.groups.map((group, groupIndex) => ({
          ...group,
          groupIndex,
          material: variant.source.geometry.materials[group.materialIndex]!.id,
        }))
      : [
          {
            start: 0,
            count: definition.indices.length,
            material: definition.materialId,
            groupIndex: 0,
            materialIndex: variant.source.geometry.materials.findIndex(
              (material) => material.id === definition.materialId,
            ),
          },
        ];
    return {
      definition,
      mesh,
      groups,
      entry: {
        mesh: definition.id,
        part: definition.partId,
        ownerWorldMatrix: mesh.matrixWorld.toArray(),
        submissions: [],
      } as NativeCapturedPbrMesh,
    };
  });
  const leases: { release(): void }[] = [];
  let disposed = false,
    verifyingTexture = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const { entry } of entries)
      for (const submission of entry.submissions) {
        for (const bytes of Object.values(submission.captured.vertexBytes))
          bytes.fill(0);
        submission.captured.shaderBytes.fill(0);
      }
    for (const lease of leases) lease.release();
  }
  let active:
    | {
        owned: (typeof entries)[number];
        group: (typeof entries)[number]["groups"][number];
        material: Material;
      }
    | undefined;
  let failure: unknown;
  let failed = false;
  let ordinal = 0;
  const latch = (error: unknown) => {
    if (!failed) {
      failed = true;
      failure = error;
    }
  };
  const savedDraw = Object.getOwnPropertyDescriptor(gl, "drawElements"),
    originalDraw = gl.drawElements,
    savedArrays = Object.getOwnPropertyDescriptor(gl, "drawArrays"),
    originalArrays = gl.drawArrays,
    hooks = entries.map(({ mesh }) => ({
      mesh,
      before: mesh.onBeforeRender,
      after: mesh.onAfterRender,
    }));
  try {
    for (const owned of entries) {
      const hook = hooks.find((hook) => hook.mesh === owned.mesh)!;
      owned.mesh.onBeforeRender = function (...args) {
        active = undefined;
        try {
          hook.before.apply(this, args);
          if (
            args[1] !== world.world ||
            args[2] !== world.camera ||
            args[3] !== owned.mesh.geometry
          )
            mismatch("PBR hook is not the owned color pass");
          checkWorld();
          assertNativeShapeMatrix(
            owned.mesh.matrixWorld.elements,
            reference.frame.parts[owned.definition.partId]!.worldMatrix,
          );
          const usedGroup = args[5] as unknown as
              | { start: number; count: number; materialIndex: number }
              | undefined,
            group = owned.groups.find((group) =>
              usedGroup
                ? group.start === usedGroup.start &&
                  group.count === usedGroup.count &&
                  group.materialIndex === usedGroup.materialIndex
                : owned.groups.length === 1,
            );
          if (
            !group ||
            owned.entry.submissions.some(
              (entry) => entry.groupIndex === group.groupIndex,
            ) ||
            args[4] !== world.pbrResources.materials[group.materialIndex]
          )
            mismatch("Missing, foreign or duplicate PBR material group");
          verifyNativePbrMaterialProfile(
            args[4],
            variant.source.geometry.materials[group.materialIndex]!,
            world.pbrResources,
          );
          active = { owned, group, material: args[4] };
        } catch (error) {
          latch(error);
        }
      };
      owned.mesh.onAfterRender = function (...args) {
        active = undefined;
        try {
          hook.after.apply(this, args);
        } catch (error) {
          latch(error);
        }
      };
    }
    Object.defineProperty(gl, "drawArrays", {
      configurable: true,
      writable: true,
      value(mode: number, first: number, count: number) {
        if (active && !verifyingTexture)
          latch(Error("comp-native3d-observation: nonindexed PBR submission"));
        originalArrays.call(gl, mode, first, count);
      },
    });
    Object.defineProperty(gl, "drawElements", {
      configurable: true,
      writable: true,
      value(mode: number, count: number, type: number, offset: number) {
        const used = active;
        originalDraw.call(gl, mode, count, type, offset);
        if (!used || failed) return;
        try {
          assertLive();
          if (
            used.owned.entry.submissions.some(
              (entry) => entry.groupIndex === used.group.groupIndex,
            )
          )
            mismatch("Duplicate indexed PBR submission");
          if (
            gl.isEnabled(gl.RASTERIZER_DISCARD) ||
            gl.isEnabled(gl.SAMPLE_ALPHA_TO_COVERAGE) ||
            gl.isEnabled(gl.STENCIL_TEST) ||
            !gl.isEnabled(gl.DEPTH_TEST) ||
            !gl.getParameter(gl.DEPTH_WRITEMASK) ||
            gl.getParameter(gl.DEPTH_FUNC) !== gl.LEQUAL ||
            (gl.getParameter(gl.COLOR_WRITEMASK) as boolean[]).some(
              (value) => !value,
            )
          )
            mismatch(
              "PBR draw used an unsupported discard, depth or write state",
            );
          const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
          if (gl.isEnabled(gl.SCISSOR_TEST)) {
            const scissor = gl.getParameter(gl.SCISSOR_BOX) as Int32Array;
            if (
              scissor[0] !== 0 ||
              scissor[1] !== 0 ||
              scissor[2] !== reference.viewport.width ||
              scissor[3] !== reference.viewport.height
            )
              mismatch("PBR draw used a clipped scissor");
          }
          if (
            viewport[0] !== 0 ||
            viewport[1] !== 0 ||
            viewport[2] !== reference.viewport.width ||
            viewport[3] !== reference.viewport.height ||
            count !== used.group.count ||
            offset !== used.group.start * (type === gl.UNSIGNED_INT ? 4 : 2)
          )
            mismatch("PBR submitted viewport or group range differs");
          const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram,
            expected = nativeExpectedPbrMatrices(
              reference,
              used.owned.definition.partId,
              camera,
            ),
            matrices = {} as ReturnType<typeof nativeExpectedPbrMatrices>;
          for (const name of [
            "modelViewMatrix",
            "projectionMatrix",
            "normalMatrix",
          ] as const) {
            const location = gl.getUniformLocation(program, name);
            if (!location) mismatch("PBR shader has no active " + name);
            const actual = Array.from(
              gl.getUniform(program, location) as Float32Array,
            );
            if (
              actual.length !== expected[name].length ||
              actual.some((value, index) => value !== expected[name][index])
            )
              mismatch(
                "Actual PBR " + name + " differs from independent pose/camera",
              );
            matrices[name] = actual;
          }
          for (const [name, values] of [
            [
              "modelMatrix",
              reference.frame.parts[used.owned.definition.partId]!.worldMatrix,
            ],
            ["viewMatrix", camera.viewMatrix],
            ["cameraPosition", reference.frame.camera.position],
          ] as const) {
            const location = gl.getUniformLocation(program, name);
            if (!location) continue;
            const actual = Array.from(
              gl.getUniform(program, location) as Float32Array,
            );
            if (
              actual.length !== values.length ||
              actual.some(
                (value, index) => value !== Math.fround(values[index]!),
              )
            )
              mismatch("Actual PBR " + name + " differs");
          }
          const mesh = used.owned.definition,
            vertexBytes =
              4 *
                (mesh.positions.length +
                  mesh.normals.length +
                  (mesh.uvs?.length ?? 0) +
                  (mesh.tangents?.length ?? 0)) +
              mesh.indices.length * (type === gl.UNSIGNED_INT ? 4 : 2);
          // Admit readback, shader text/UTF8 and seal metadata before the capture allocates them.
          const pixelLease = renderMemory()?.reserve(
            "pixels",
            vertexBytes + 1_048_576,
            undefined,
            true,
          );
          if (pixelLease) leases.push(pixelLease);
          const metadataLease = renderMemory()?.reserve(
            "metadata",
            3_145_728,
            undefined,
            true,
          );
          if (metadataLease) leases.push(metadataLease);
          let captured: Capture;
          verifyingTexture = true;
          try {
            captured = captureNativePbrGpuDraw(
              renderer,
              world.pbrResources,
              mesh.id,
              used.group.material,
              { mode, count, type, offset },
            );
          } finally {
            verifyingTexture = false;
          }
          used.owned.entry.submissions.push({
            groupIndex: used.group.groupIndex,
            drawOrdinal: ordinal++,
            start: used.group.start,
            count,
            material: used.group.material,
            matrices,
            captured,
          });
          if (captured.shaderBytes.byteLength > 1_048_576)
            mismatch("PBR compiled shader exceeds bounded capture");
        } catch (error) {
          latch(error);
        }
      },
    });
    renderer.render(world.world, world.camera);
    checkWorld();
    for (const { definition, mesh, groups, entry } of entries) {
      if (entry.submissions.length) {
        if (entry.submissions.length !== groups.length)
          mismatch("PBR draw coverage is incomplete");
      } else if (
        !reference.frame.parts[definition.partId]!.visible &&
        !inheritedThreeVisibility(mesh)
      )
        entry.reason = "authored-hidden";
      else if (
        mesh.frustumCulled &&
        nativeExpectedShapeOutsideFrustumV2(
          definition.positions,
          reference.frame.parts[definition.partId]!.worldMatrix,
          camera,
        )
      )
        entry.reason = "outside-frustum";
      else mismatch("Visible PBR mesh was not submitted: " + definition.id);
    }
  } catch (error) {
    latch(error);
  } finally {
    active = undefined;
    if (savedDraw) Object.defineProperty(gl, "drawElements", savedDraw);
    else Reflect.deleteProperty(gl, "drawElements");
    if (savedArrays) Object.defineProperty(gl, "drawArrays", savedArrays);
    else Reflect.deleteProperty(gl, "drawArrays");
    for (const hook of hooks) {
      hook.mesh.onBeforeRender = hook.before;
      hook.mesh.onAfterRender = hook.after;
    }
  }
  if (failed) {
    dispose();
    throw failure;
  }
  return { meshes: entries.map(({ entry }) => entry), dispose };
}
