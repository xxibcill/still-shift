import { Matrix4, Vector3 } from "three";
import type {
  MechanismTeachingShape,
  NativeObservedShape,
} from "@still-shift/scene-contract";
import type { NativeCapturedShape } from "./three-shape-draws.ts";
import type { DeepReadonly } from "./types.ts";

/** Numeric landmarks are sealed synchronously from submitted positions and the observed owner. */
export function nativeLandmarksFromUsedPositions(
  entry: NativeCapturedShape,
  shape: DeepReadonly<MechanismTeachingShape>,
) {
  const landmarks: Extract<
    NativeObservedShape,
    { status: "drawn" }
  >["landmarks"] = Object.create(null);
  if (!entry.streams) return landmarks;
  const bytes = entry.streams.position,
    used = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    owner = new Matrix4().fromArray(entry.ownerWorldMatrix);
  for (const landmark of shape.landmarks) {
    const local = new Vector3();
    for (const vertex of landmark.vertexIndices)
      local.add(
        new Vector3(
          used.getFloat32(vertex * 12, true),
          used.getFloat32(vertex * 12 + 4, true),
          used.getFloat32(vertex * 12 + 8, true),
        ),
      );
    local.divideScalar(landmark.vertexIndices.length);
    landmarks[landmark.id] = {
      local: local.toArray() as [number, number, number],
      world: local.clone().applyMatrix4(owner).toArray() as [
        number,
        number,
        number,
      ],
      positionMethod: "used-position-landmark-1",
    };
  }
  return landmarks;
}
