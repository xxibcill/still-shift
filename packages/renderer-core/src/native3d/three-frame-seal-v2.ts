import { MechanismAnchorSourceV2Schema } from "@still-shift/scene-contract";
import { Mesh, Raycaster, Vector2, Vector3 } from "three";
import type { MeshStandardMaterial } from "three";
import type {
  NativeFrameSnapshotV2,
  NativeObservedAnchorV2,
  NativeObservedShape,
} from "@still-shift/scene-contract";
import { inheritedThreeVisibility } from "./three-world.ts";
import type { NativeThreeWorldV2 } from "./three-world.ts";
import type { NativeCapturedShape } from "./three-shape-draws.ts";
import type { PreparedNative3DVariantV2 } from "./types-v2.ts";
import type { DeepReadonly } from "./types.ts";
import { nativeUsedBytesEqual } from "./used-stream-bytes.ts";

type Landmarks = Extract<NativeObservedShape, { status: "drawn" }>["landmarks"];
type Positioned = Extract<NativeObservedAnchorV2, { status: "positioned" }>;
function observedPoint(
  world: Vector3,
  part: Mesh["parent"],
  shared: NativeThreeWorldV2,
  width: number,
  height: number,
  meshes: readonly Mesh[],
  raycaster: Raycaster,
) {
  const camera = shared.camera,
    view = world.clone().applyMatrix4(camera.matrixWorldInverse),
    depth = -view.z,
    projected = world.clone().project(camera);
  const pixel: [number, number] | null =
    depth > 0
      ? [((projected.x + 1) * width) / 2, ((1 - projected.y) * height) / 2]
      : null;
  let visibility: Positioned["visibility"] = !inheritedThreeVisibility(part!)
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
    const distance = camera.position.distanceTo(world);
    const hit = raycaster
      .intersectObjects([...meshes], false)
      .find((candidate) => {
        if (
          !(candidate.object instanceof Mesh) ||
          !inheritedThreeVisibility(candidate.object) ||
          candidate.distance >= distance - 0.0001
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
  return {
    world: world.toArray() as [number, number, number],
    pixel,
    depth,
    visibility,
    visibilityMethod: "three-physical-mesh-segment-with-used-shapes-2" as const,
    ...(occluderMesh === undefined ? {} : { occluderMesh }),
  };
}

/** CPU ray queries are allowed only after all used changing positions/indices match. */
export function sealNativeThreeFrameV2(
  shared: NativeThreeWorldV2,
  variant: PreparedNative3DVariantV2,
  reference: DeepReadonly<NativeFrameSnapshotV2>,
  shapes: readonly NativeCapturedShape[],
  landmarks: Readonly<Record<string, Landmarks>>,
  pass: { calls: number; triangles: number },
) {
  const drawn = new Map(
    shapes
      .filter((shape) => shape.streams)
      .map((shape) => [shape.association.mesh, shape]),
  );
  const changing = new Set(shapes.map((shape) => shape.association.mesh));
  for (const [id, shape] of drawn) {
    const mesh = shared.meshes.find((mesh) => mesh.name === id)!;
    for (const field of ["position", "indices"] as const) {
      const attribute =
        field === "position"
          ? mesh.geometry.getAttribute("position")
          : mesh.geometry.getIndex();
      if (
        !attribute ||
        !ArrayBuffer.isView(attribute.array) ||
        !nativeUsedBytesEqual(
          new Uint8Array(
            attribute.array.buffer,
            attribute.array.byteOffset,
            attribute.array.byteLength,
          ),
          shape.streams![field],
        )
      )
        throw Error(
          `comp-native3d-observation: CPU raycast ${field} stream differs from the used GPU buffer: ${id}`,
        );
    }
  }
  const physical = shared.meshes.filter(
    (mesh) => !changing.has(mesh.name) || drawn.has(mesh.name),
  );
  const anchors: Record<string, NativeObservedAnchorV2> = Object.create(null),
    raycaster = new Raycaster();
  for (const definition of variant.source.anchors) {
    const source = MechanismAnchorSourceV2Schema.parse(definition.source);
    if (source.kind === "part-local") {
      const part = shared.parts.get(source.part)!;
      anchors[definition.id] = {
        status: "positioned",
        source,
        part: source.part,
        positionMethod: "three-part-local-1",
        ...observedPoint(
          part.localToWorld(new Vector3(...source.position)),
          part,
          shared,
          reference.viewport.width,
          reference.viewport.height,
          physical,
          raycaster,
        ),
      };
      continue;
    }
    const shape = shapes.find(
      (shape) => shape.association.shape === source.shape,
    )!;
    if (!shape.streams) {
      anchors[definition.id] = {
        status: "not-drawn",
        source,
        part: shape.association.ownerPart,
        reason: shape.reason!,
      };
      continue;
    }
    const part = shared.parts.get(shape.association.ownerPart)!;
    anchors[definition.id] = {
      status: "positioned",
      source,
      part: shape.association.ownerPart,
      positionMethod: "used-position-landmark-1",
      ...observedPoint(
        new Vector3(...landmarks[source.shape]![source.landmark]!.world),
        part,
        shared,
        reference.viewport.width,
        reference.viewport.height,
        physical,
        raycaster,
      ),
    };
  }
  return {
    viewport: [0, 0, reference.viewport.width, reference.viewport.height] as [
      number,
      number,
      number,
      number,
    ],
    camera: {
      worldMatrix: shared.camera.matrixWorld.toArray(),
      viewMatrix: shared.camera.matrixWorldInverse.toArray(),
      projectionMatrix: shared.camera.projectionMatrix.toArray(),
      near: shared.camera.near,
      far: shared.camera.far,
      aspect: shared.camera.aspect,
      fovDegrees: shared.camera.fov,
    },
    parts: Object.fromEntries(
      [...shared.parts].map(([id, part]) => [
        id,
        {
          ...(part.parent && shared.parts.has(part.parent.name)
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
