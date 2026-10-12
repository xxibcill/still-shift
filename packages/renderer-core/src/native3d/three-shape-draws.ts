import {
  Box3,
  Frustum,
  Matrix4,
  PerspectiveCamera,
  Sphere,
  Vector3,
} from "three";
import type { Material, Mesh, WebGLRenderer } from "three";
import type {
  NativeFrameSnapshotV2,
  NativeShapeAssociation,
} from "@still-shift/scene-contract";
import { inheritedThreeVisibility } from "./three-world.ts";
import type { NativeThreeWorldV2 } from "./three-world.ts";
import type { DeepReadonly } from "./types.ts";
import type { PreparedNative3DVariantV2 } from "./types-v2.ts";
import { captureNativeUsedIndexedStreams } from "./used-indexed-streams.ts";
import { nativeUsedBytesEqual } from "./used-stream-bytes.ts";
import { observeNativeShapeMaterial } from "./three-shape-material.ts";

type Captured = ReturnType<typeof captureNativeUsedIndexedStreams>;
type Group = DeepReadonly<NativeShapeAssociation["groups"][number]>;
export interface NativeCapturedShape {
  readonly association: DeepReadonly<NativeShapeAssociation>;
  readonly driverStateKey: string;
  readonly ownerWorldMatrix: number[];
  readonly submissions: (Group & {
    drawOrdinal: number;
    readbackOrdinal: number;
    streamSet: 0;
    mode: 4;
    type: 5123;
    byteOffset: number;
  })[];
  readonly materials: ReturnType<typeof observeNativeShapeMaterial>[];
  streams?: Captured;
  reason?: "authored-hidden" | "outside-frustum";
}

export function assertNativeShapeMatrix(
  actual: readonly number[],
  expected: readonly number[],
): void {
  if (
    actual.length !== 16 ||
    expected.length !== 16 ||
    actual.some(
      (value, index) =>
        !Number.isFinite(value) || Math.abs(value - expected[index]!) > 1e-8,
    )
  )
    throw Error(
      "comp-native3d-observation: actual changing owner/camera matrix differs from the expected pose",
    );
}

function expectedCamera(snapshot: DeepReadonly<NativeFrameSnapshotV2>) {
  const definition = snapshot.frame.camera;
  const camera = new PerspectiveCamera(
    definition.fovDegrees,
    snapshot.viewport.width / snapshot.viewport.height,
    definition.near,
    definition.far,
  );
  camera.position.set(...definition.position);
  camera.up.set(...definition.up);
  camera.lookAt(...definition.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function checkFrame(
  world: NativeThreeWorldV2,
  variant: PreparedNative3DVariantV2,
  snapshot: DeepReadonly<NativeFrameSnapshotV2>,
  camera: PerspectiveCamera,
) {
  if (
    world.source !== variant.source ||
    world.parts.size !== variant.source.parts.length
  )
    throw Error(
      "comp-native3d-observation: world/source owner differs from the prepared variant",
    );
  for (const definition of variant.source.parts) {
    const part = world.parts.get(definition.id),
      expected = snapshot.frame.parts[definition.id]!;
    if (
      !part ||
      part.visible !== snapshot.localVisibility[definition.id] ||
      inheritedThreeVisibility(part) !== expected.visible ||
      (definition.parent
        ? part.parent !== world.parts.get(definition.parent)
        : part.parent !== world.world)
    )
      throw Error(
        "comp-native3d-observation: actual changing part hierarchy/visibility differs from expected",
      );
    assertNativeShapeMatrix(part.matrix.elements, expected.localMatrix);
    assertNativeShapeMatrix(part.matrixWorld.elements, expected.worldMatrix);
  }
  assertNativeShapeMatrix(
    world.camera.matrixWorld.elements,
    camera.matrixWorld.elements,
  );
  assertNativeShapeMatrix(
    world.camera.matrixWorldInverse.elements,
    camera.matrixWorldInverse.elements,
  );
  assertNativeShapeMatrix(
    world.camera.projectionMatrix.elements,
    camera.projectionMatrix.elements,
  );
}

function outsideFrustum(
  mesh: Mesh,
  positions: readonly number[],
  ownerMatrix: readonly number[],
  camera: PerspectiveCamera,
): boolean {
  if (!mesh.frustumCulled || !mesh.geometry.boundingSphere) return false;
  const box = new Box3();
  for (let index = 0; index < positions.length; index += 3)
    box.expandByPoint(
      new Vector3(
        Math.fround(positions[index]!),
        Math.fround(positions[index + 1]!),
        Math.fround(positions[index + 2]!),
      ),
    );
  const sphere = new Sphere(box.getCenter(new Vector3()), 0);
  for (let index = 0; index < positions.length; index += 3)
    sphere.radius = Math.max(
      sphere.radius,
      sphere.center.distanceTo(
        new Vector3(
          Math.fround(positions[index]!),
          Math.fround(positions[index + 1]!),
          Math.fround(positions[index + 2]!),
        ),
      ),
    );
  const actual = mesh.geometry.boundingSphere;
  if (
    actual.center.distanceTo(sphere.center) > 1e-8 ||
    Math.abs(actual.radius - sphere.radius) > 1e-8
  )
    throw Error(
      "comp-native3d-observation: actual culling bound differs from the intended current shape",
    );
  const expectedFrustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
  );
  const actualFrustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
  );
  return (
    !expectedFrustum.intersectsSphere(
      sphere.applyMatrix4(new Matrix4().fromArray(ownerMatrix)),
    ) && !actualFrustum.intersectsObject(mesh)
  );
}

/** Scoped color-draw recorder. Hook errors are latched until Three completes its render cleanup. */
export function captureNativeShapeDraws(
  renderer: WebGLRenderer,
  world: NativeThreeWorldV2,
  variant: PreparedNative3DVariantV2,
  snapshot: DeepReadonly<NativeFrameSnapshotV2>,
  assertLive: () => void,
) {
  const gl = renderer.getContext();
  if (
    !(gl instanceof WebGL2RenderingContext) ||
    gl.drawElements !== WebGL2RenderingContext.prototype.drawElements
  )
    throw Error(
      "comp-native3d-observation: used-stream recording requires an unwrapped WebGL2 draw entry",
    );
  const camera = expectedCamera(snapshot);
  checkFrame(world, variant, snapshot, camera);
  const entries = variant.source.teachingShapes.map((shape) => {
    const matches = world.meshes.filter((mesh) => mesh.name === shape.mesh);
    const mesh = matches[0];
    if (
      matches.length !== 1 ||
      !mesh ||
      mesh.parent !== world.parts.get(shape.ownerPart) ||
      Reflect.get(mesh, "isInstancedMesh") === true ||
      Reflect.get(mesh, "isSkinnedMesh") === true ||
      Object.keys(mesh.geometry.morphAttributes).length ||
      mesh.customDepthMaterial !== undefined ||
      mesh.customDistanceMaterial !== undefined ||
      !mesh.layers.test(world.camera.layers)
    )
      throw Error(
        "comp-native3d-observation: changing color mesh is outside the closed owner profile",
      );
    assertNativeShapeMatrix(mesh.matrix.elements, new Matrix4().elements);
    assertNativeShapeMatrix(
      mesh.matrixWorld.elements,
      snapshot.frame.parts[shape.ownerPart]!.worldMatrix,
    );
    const entry: NativeCapturedShape = {
      association: variant.shapeAssociations[shape.id]!,
      driverStateKey: snapshot.frame.shapeStates[shape.id]!.stateKey,
      ownerWorldMatrix: mesh.matrixWorld.toArray(),
      submissions: [],
      materials: [],
    };
    return { shape, mesh, entry };
  });
  let active:
    | { entry: NativeCapturedShape; group: Group; material: Material }
    | undefined;
  let failed = false,
    reason: unknown,
    ordinal = 0;
  const latch = (error: unknown) => {
    if (!failed) {
      failed = true;
      reason = error;
    }
  };
  const savedDraw = Object.getOwnPropertyDescriptor(gl, "drawElements");
  const originalDraw = gl.drawElements;
  const savedHooks = entries.map(({ mesh }) => ({
    mesh,
    before: mesh.onBeforeRender,
    after: mesh.onAfterRender,
  }));
  function dispose() {
    for (const { entry } of entries) entry.streams?.dispose();
  }
  try {
    for (const { shape, mesh, entry } of entries) {
      const saved = savedHooks.find((hook) => hook.mesh === mesh)!;
      mesh.onBeforeRender = function (...args) {
        active = undefined;
        try {
          assertLive();
          saved.before.apply(this, args);
          if (
            args[1] !== world.world ||
            args[2] !== world.camera ||
            args[3] !== mesh.geometry
          )
            throw Error(
              "comp-native3d-observation: changing hook is not the owned color pass",
            );
          checkFrame(world, variant, snapshot, camera);
          assertNativeShapeMatrix(
            mesh.matrixWorld.elements,
            snapshot.frame.parts[shape.ownerPart]!.worldMatrix,
          );
          const rawGroup: unknown = args[5];
          const usedGroup =
            rawGroup && typeof rawGroup === "object"
              ? {
                  start: Reflect.get(rawGroup, "start"),
                  count: Reflect.get(rawGroup, "count"),
                }
              : undefined;
          const group = entry.association.groups.find((candidate) =>
            usedGroup
              ? candidate.start === usedGroup.start &&
                candidate.count === usedGroup.count
              : entry.association.groups.length === 1,
          );
          if (
            !group ||
            entry.submissions.some(
              (submission) => submission.groupIndex === group.groupIndex,
            )
          )
            throw Error(
              "comp-native3d-observation: missing/duplicate/unsealed changing draw group",
            );
          const definition = variant.source.geometry.materials.find(
            (material) => material.id === group.materialId,
          )!;
          observeNativeShapeMaterial(args[4], definition);
          active = { entry, group, material: args[4] };
        } catch (error) {
          latch(error);
        }
      };
      mesh.onAfterRender = function (...args) {
        active = undefined;
        try {
          saved.after.apply(this, args);
        } catch (error) {
          latch(error);
        }
      };
    }
    Object.defineProperty(gl, "drawElements", {
      configurable: true,
      writable: true,
      value(mode: number, count: number, type: number, byteOffset: number) {
        const used = active;
        let submission:
          | Parameters<typeof captureNativeUsedIndexedStreams>[1]
          | undefined;
        if (used && !failed)
          submission = {
            mode,
            count,
            type,
            byteOffset,
            program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram,
            vao: gl.getParameter(
              gl.VERTEX_ARRAY_BINDING,
            ) as WebGLVertexArrayObject,
            indexBuffer: gl.getParameter(
              gl.ELEMENT_ARRAY_BUFFER_BINDING,
            ) as WebGLBuffer,
          };
        originalDraw.call(gl, mode, count, type, byteOffset);
        if (!used || !submission || failed) return;
        let captured: Captured | undefined;
        try {
          assertLive();
          if (
            count <= 0 ||
            count % 3 !== 0 ||
            mode !== gl.TRIANGLES ||
            type !== gl.UNSIGNED_SHORT
          )
            throw Error(
              "comp-native3d-observation: used submission is not a bounded nonzero indexed triangle draw",
            );
          const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
          if (
            viewport[2] !== snapshot.viewport.width ||
            viewport[3] !== snapshot.viewport.height ||
            count !== used.group.count ||
            byteOffset !== used.group.start * 2
          )
            throw Error(
              "comp-native3d-observation: submitted group/viewport differs from the sealed color pass",
            );
          captured = captureNativeUsedIndexedStreams(
            gl,
            submission,
            used.entry.association,
          );
          const first = used.entry.streams;
          if (
            first &&
            (first.positionLayout.buffer !== captured.positionLayout.buffer ||
              first.normalLayout.buffer !== captured.normalLayout.buffer ||
              first.indexBuffer !== captured.indexBuffer ||
              first.positionLayout.location !==
                captured.positionLayout.location ||
              first.normalLayout.location !== captured.normalLayout.location ||
              !nativeUsedBytesEqual(first.position, captured.position) ||
              !nativeUsedBytesEqual(first.normal, captured.normal) ||
              !nativeUsedBytesEqual(first.indices, captured.indices))
          )
            throw Error(
              "comp-native3d-observation: group used a different changing stream set",
            );
          if (!first) {
            used.entry.streams = captured;
            captured = undefined;
          }
          const definition = variant.source.geometry.materials.find(
            (material) => material.id === used.group.materialId,
          )!;
          used.entry.materials.push(
            observeNativeShapeMaterial(used.material, definition),
          );
          used.entry.submissions.push({
            ...used.group,
            drawOrdinal: ordinal,
            readbackOrdinal: ordinal++,
            streamSet: 0,
            mode: 4,
            type: 5123,
            byteOffset,
          });
        } catch (error) {
          latch(error);
        } finally {
          try {
            captured?.dispose();
          } catch (error) {
            latch(error);
          }
        }
      },
    });
    assertLive();
    renderer.render(world.world, world.camera);
    checkFrame(world, variant, snapshot, camera);
    for (const { shape, mesh, entry } of entries) {
      if (entry.streams) {
        if (entry.submissions.length !== entry.association.groups.length)
          throw Error(
            "comp-native3d-observation: changing draw coverage is incomplete",
          );
        continue;
      }
      const policy = shape.drawEvidence;
      const required =
        !policy ||
        policy.requiredIntervals.some(
          (interval) =>
            snapshot.sourceFrame >= interval.startFrame &&
            snapshot.sourceFrame < interval.endFrameExclusive,
        );
      if (required)
        throw Error(
          `comp-native3d-observation: required changing shape was not submitted: ${shape.id}`,
        );
      if (
        policy.allowedOutsideProof.includes("authored-hidden") &&
        !snapshot.frame.parts[shape.ownerPart]!.visible &&
        !inheritedThreeVisibility(mesh.parent!)
      )
        entry.reason = "authored-hidden";
      else if (
        policy.allowedOutsideProof.includes("outside-frustum") &&
        inheritedThreeVisibility(mesh) &&
        outsideFrustum(
          mesh,
          snapshot.frame.shapeStates[shape.id]!.positions,
          entry.ownerWorldMatrix,
          camera,
        )
      )
        entry.reason = "outside-frustum";
      else
        throw Error(
          `comp-native3d-observation: missing changing draw has no verified allowance: ${shape.id}`,
        );
    }
  } catch (error) {
    latch(error);
  } finally {
    active = undefined;
    try {
      if (savedDraw) Object.defineProperty(gl, "drawElements", savedDraw);
      else Reflect.deleteProperty(gl, "drawElements");
    } catch (error) {
      latch(error);
    }
    for (const hook of savedHooks) {
      hook.mesh.onBeforeRender = hook.before;
      hook.mesh.onAfterRender = hook.after;
    }
  }
  if (failed) {
    try {
      dispose();
    } catch {
      /* Preserve the original submitted-pass failure. */
    }
    throw reason;
  }
  try {
    assertLive();
  } catch (error) {
    try {
      dispose();
    } catch {
      /* Preserve the original abort. */
    }
    throw error;
  }
  return { shapes: entries.map(({ entry }) => entry), dispose };
}
