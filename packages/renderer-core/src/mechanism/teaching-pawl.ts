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
  for (let ring = 0; ring <= longitudinalSegments; ring++) {
    const fraction = ring / longitudinalSegments;
    const bend = deflection * maxDeflection * fraction ** 3;
    const slope = (3 * deflection * maxDeflection * fraction ** 2) / length;
    const normal = normalize([-slope, 1, 0]);
    for (const [height, side] of signs) {
      positions.push(
        length * fraction + (normal[0] * height * thickness) / 2,
        bend + (normal[1] * height * thickness) / 2,
        (side * width) / 2,
      );
      normals.push(
        ...normalize([normal[0] * height, normal[1] * height, side]),
      );
    }
  }
  for (let cap = 0; cap < 2; cap++) {
    const ring = cap === 0 ? 0 : longitudinalSegments;
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
