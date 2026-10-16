import { MechanismCameraSchema } from "@still-shift/scene-contract";
import type {
  MechanismCamera,
  MechanismCameraKeys,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";

export function sampleMechanismCameraV2(
  base: DeepReadonly<MechanismCamera>,
  keys: DeepReadonly<MechanismCameraKeys> | undefined,
  frame: number,
): MechanismCamera {
  if (!keys) return MechanismCameraSchema.parse(base);
  let index = 0,
    upper = keys.length;
  while (upper - index > 1) {
    const middle = Math.floor((index + upper) / 2);
    if (keys[middle]!.frame <= frame) index = middle;
    else upper = middle;
  }
  const left = keys[index]!,
    right = keys[index + 1] ?? left;
  const fraction =
    right.frame === left.frame
      ? 0
      : Math.max(0, (frame - left.frame) / (right.frame - left.frame));
  const eased =
    left.easing === "hold"
      ? 0
      : left.easing === "smoothstep"
        ? fraction * fraction * (3 - 2 * fraction)
        : fraction;
  const interpolate = (a: number, b: number) => a + (b - a) * eased;
  return MechanismCameraSchema.parse({
    ...base,
    position: left.position.map((value, axis) =>
      interpolate(value, right.position[axis]!),
    ),
    target: left.target.map((value, axis) =>
      interpolate(value, right.target[axis]!),
    ),
    fovDegrees: interpolate(
      left.fovDegrees ?? base.fovDegrees,
      right.fovDegrees ?? base.fovDegrees,
    ),
  });
}
