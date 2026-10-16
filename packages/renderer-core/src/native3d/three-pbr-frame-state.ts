import { Mesh, Raycaster, Vector2, Vector3 } from "three";
import type { MeshStandardMaterial } from "three";
import type {
  NativeFrameSnapshotV3,
  NativeObservedAnchor,
} from "@still-shift/scene-contract";
import {
  inheritedThreeVisibility,
  type NativeThreeWorldV3,
} from "./three-world.ts";

import type { DeepReadonly } from "./types.ts";

/** Fresh Three queries run synchronously after owned color streams, topology and transforms were verified. */
export function sealNativePbrWorldState(
  shared: NativeThreeWorldV3,
  reference: DeepReadonly<NativeFrameSnapshotV3>,
  drawnMeshes: ReadonlySet<string>,
  pass: { calls: number; triangles: number },
) {
  const { camera, parts, meshes, source } = shared;
  const width = reference.viewport.width,
    height = reference.viewport.height;
  const raycaster = new Raycaster();
  const anchors: Record<
    string,
    Omit<NativeObservedAnchor, "visibilityMethod"> & {
      visibilityMethod: "three-physical-used-pbr-mesh-segment-3";
    }
  > = Object.create(null);
  for (const definition of source.anchors) {
    if (definition.source.kind !== "part-local")
      throw Error(
        "comp-native3d-observation: source3 requires rigid part anchors",
      );
    const part = parts.get(definition.source.part)!;
    const world = part.localToWorld(new Vector3(...definition.source.position));
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
        .intersectObjects(
          meshes.filter((mesh) => drawnMeshes.has(mesh.name)),
          false,
        )
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
      part: definition.source.part,
      world: [world.x, world.y, world.z],
      pixel,
      depth,
      visibility,
      visibilityMethod: "three-physical-used-pbr-mesh-segment-3" as const,
      ...(occluderMesh === undefined ? {} : { occluderMesh }),
    };
  }
  return {
    viewport: [0, 0, width, height] as [number, number, number, number],
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
    pass: {
      completed: true as const,
      calls: pass.calls,
      triangles: pass.triangles,
    },
  };
}
