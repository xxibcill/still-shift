import type { MechanismTeachingShape } from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { normalize } from "./shape-math.ts";

type Pawl = Extract<
  DeepReadonly<MechanismTeachingShape>,
  { generator: "fixed-root-pawl-curve-1" }
>;

export function sampleFixedRootPawl(shape: Pawl, deflection: number) {
  const { length, width, thickness, maxDeflection, longitudinalSegments } =
    shape.parameters;
  const positions: number[] = [],
    normals: number[] = [];
  const signs = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const;
  const trigger = shape.parameters.trigger,
    lastRing = longitudinalSegments + (trigger?.segments ?? 0);
  for (let ring = 0; ring <= lastRing; ring++) {
    const fraction = ring / longitudinalSegments;
    const extension =
      ring > longitudinalSegments && trigger
        ? (ring - longitudinalSegments) / trigger.segments
        : 0;
    const bend = extension
      ? deflection * maxDeflection +
        ((3 * deflection * maxDeflection) / length) *
          trigger!.length *
          extension
      : deflection * maxDeflection * fraction ** 3;
    const slope = extension
      ? (3 * deflection * maxDeflection) / length
      : (3 * deflection * maxDeflection * fraction ** 2) / length;
    const x = extension
      ? length + trigger!.length * extension
      : length * fraction;
    const ringWidth = extension
      ? width + (trigger!.width - width) * extension
      : width;
    const widthSlope = extension
      ? (trigger!.width - width) / trigger!.length
      : 0;
    const normal = normalize([-slope, 1, 0]);
    for (const [height, side] of signs) {
      positions.push(
        x + (normal[0] * height * thickness) / 2,
        bend + (normal[1] * height * thickness) / 2,
        (side * ringWidth) / 2,
      );
      if (widthSlope === 0)
        normals.push(
          ...normalize([normal[0] * height, normal[1] * height, side]),
        );
      else {
        const lateral = normalize([
          -widthSlope / (2 * (1 + slope * slope)),
          (-slope * widthSlope) / (2 * (1 + slope * slope)),
          side,
        ]);
        normals.push(
          ...normalize([
            normal[0] * height + lateral[0],
            normal[1] * height + lateral[1],
            lateral[2],
          ]),
        );
      }
    }
  }
  for (let cap = 0; cap < 2; cap++) {
    const ring = cap === 0 ? 0 : lastRing;
    const tangent = normalize([
      1,
      cap === 0 ? 0 : (3 * deflection * maxDeflection) / length,
      0,
    ]);
    for (let side = 0; side < 4; side++) {
      positions.push(
        ...positions.slice(ring * 12 + side * 3, ring * 12 + side * 3 + 3),
      );
      normals.push(...tangent.map((value) => value * (cap === 0 ? -1 : 1)));
    }
  }
  return { positions, normals };
}
