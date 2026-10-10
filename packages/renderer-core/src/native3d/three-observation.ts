import { Mesh, Raycaster, Vector2, Vector3 } from "three";
import type { MeshStandardMaterial } from "three";
import type {
  NativeFrameSnapshot,
  NativeObservedFrame,
  NativeObservedAnchor,
} from "@still-shift/scene-contract";
import {
  inheritedThreeVisibility,
  type NativeThreeWorld,
} from "./three-world.ts";

/** Fresh Three state and physical ray queries; expected snapshot geometry is not consulted. */
export function observeNativeThreeWorld(
  shared: NativeThreeWorld,
  reference: NativeFrameSnapshot,
  appearanceCodeSha256: string,
  pass: { calls: number; triangles: number },
): NativeObservedFrame {
  const { camera, parts, meshes, source } = shared;
  const width = reference.viewport.width,
    height = reference.viewport.height;
  const raycaster = new Raycaster();
  const anchors: Record<string, NativeObservedAnchor> = Object.create(null);
  for (const definition of source.anchors) {
    const part = parts.get(definition.part)!;
    const world = part.localToWorld(new Vector3(...definition.position));
    const view = world.clone().applyMatrix4(camera.matrixWorldInverse);
    const depth = -view.z;
    const projected = world.clone().project(camera);
    const pixel: [number, number] | null =
      depth > 0
        ? [((projected.x + 1) * width) / 2, ((1 - projected.y) * height) / 2]
        : null;
    let visibility: NativeObservedAnchor["visibility"] =
      !inheritedThreeVisibility(part)
        ? "hidden-part"
        : depth <= 0
          ? "behind-camera"
          : depth < camera.near || depth > camera.far
            ? "clipped"
            : projected.x < -1 ||
                projected.x > 1 ||
                projected.y < -1 ||
                projected.y > 1
              ? "outside-frame"
              : "visible";
    let occluderMesh: string | undefined;
    if (visibility === "visible") {
      raycaster.setFromCamera(new Vector2(projected.x, projected.y), camera);
      const targetDistance = camera.position.distanceTo(world);
      const hit = raycaster
        .intersectObjects(meshes, false)
        .find((candidate) => {
          if (
            !(candidate.object instanceof Mesh) ||
            !inheritedThreeVisibility(candidate.object) ||
            candidate.distance >= targetDistance - 0.0001
          )
            return false;
          const material = (
            Array.isArray(candidate.object.material)
              ? candidate.object.material[candidate.face?.materialIndex ?? 0]
              : candidate.object.material
          ) as MeshStandardMaterial;
          if (material.alphaTest > 0 && material.opacity < material.alphaTest)
            return false;
          const hitDepth = -candidate.point
            .clone()
            .applyMatrix4(camera.matrixWorldInverse).z;
          return hitDepth >= camera.near && hitDepth <= camera.far;
        });
      if (hit) {
        visibility = "occluded";
        occluderMesh = hit.object.name;
      }
    }
    anchors[definition.id] = {
      part: definition.part,
      world: [world.x, world.y, world.z],
      pixel,
      depth,
      visibility,
      visibilityMethod: "three-physical-mesh-segment",
      ...(occluderMesh === undefined ? {} : { occluderMesh }),
    };
  }
  return {
    version: "native3d-observed-frame-1",
    frameKey: reference.frameKey,
    controller: reference.controller,
    scope: reference.scope,
    scopeFrame: reference.scopeFrame,
    sourceFrame: reference.sourceFrame,
    sourceSha256: reference.sourceSha256,
    effectiveSceneSha256: reference.effectiveSceneSha256,
    geometrySha256: reference.geometrySha256,
    appearanceCodeSha256,
    viewport: [0, 0, width, height],
    camera: {
      worldMatrix: camera.matrixWorld.toArray(),
      viewMatrix: camera.matrixWorldInverse.toArray(),
      projectionMatrix: camera.projectionMatrix.toArray(),
      near: camera.near,
      far: camera.far,
      aspect: camera.aspect,
      fovDegrees: camera.fov,
    },
    parts: Object.fromEntries(
      [...parts].map(([id, part]) => [
        id,
        {
          ...(part.parent && parts.has(part.parent.name)
            ? { parent: part.parent.name }
            : {}),
          localMatrix: part.matrix.toArray(),
          worldMatrix: part.matrixWorld.toArray(),
          localVisible: part.visible,
          inheritedVisible: inheritedThreeVisibility(part),
        },
      ]),
    ),
    anchors,
    pass: { completed: true, calls: pass.calls, triangles: pass.triangles },
  };
}
