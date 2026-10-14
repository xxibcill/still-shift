import type {
  MechanismCamera,
  MechanismProjectedAnchor,
  MechanismVector,
} from "@still-shift/scene-contract";

function subtract(
  left: readonly number[],
  right: readonly number[],
): MechanismVector {
  return [left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!];
}
function normalize(vector: readonly number[]): MechanismVector {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length) as MechanismVector;
}
function cross(
  left: readonly number[],
  right: readonly number[],
): MechanismVector {
  return [
    left[1]! * right[2]! - left[2]! * right[1]!,
    left[2]! * right[0]! - left[0]! * right[2]!,
    left[0]! * right[1]! - left[1]! * right[0]!,
  ];
}
function dot(left: readonly number[], right: readonly number[]): number {
  return left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;
}

/** Geometric camera projection only. Scene-raycast occlusion belongs to the renderer. */
export function projectMechanismAnchor(
  anchor: string,
  part: string,
  world: MechanismVector,
  visible: boolean,
  camera: MechanismCamera,
  width: number,
  height: number,
): MechanismProjectedAnchor {
  const forward = normalize(subtract(camera.target, camera.position));
  const right = normalize(cross(forward, camera.up));
  const up = cross(right, forward);
  const relative = subtract(world, camera.position);
  const depth = dot(relative, forward);
  const focal = height / (2 * Math.tan((camera.fovDegrees * Math.PI) / 360));
  const pixel: [number, number] | null =
    depth > 0
      ? [
          width / 2 + (dot(relative, right) * focal) / depth,
          height / 2 - (dot(relative, up) * focal) / depth,
        ]
      : null;
  let projectionVisibility: MechanismProjectedAnchor["projectionVisibility"];
  if (!visible) projectionVisibility = "hidden-part";
  else if (depth <= 0) projectionVisibility = "behind-camera";
  else if (depth < camera.near || depth > camera.far)
    projectionVisibility = "clipped";
  else if (
    pixel![0] < 0 ||
    pixel![0] > width ||
    pixel![1] < 0 ||
    pixel![1] > height
  )
    projectionVisibility = "outside-frame";
  else projectionVisibility = "in-frame";
  return { anchor, part, world, pixel, depth, projectionVisibility };
}
