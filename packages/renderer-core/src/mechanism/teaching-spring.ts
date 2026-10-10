import type { MechanismTeachingShape } from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import {
  add,
  cross,
  normalize,
  perpendicular,
  scale,
  subtract,
  transportNormal,
} from "./shape-math.ts";
import type { Vector } from "./shape-math.ts";

type Spring = Extract<
  DeepReadonly<MechanismTeachingShape>,
  { generator: "seated-torsion-spring-1" }
>;
interface CurvePoint {
  readonly position: Vector;
  readonly tangent: Vector;
}

function hermite(
  start: Vector,
  end: Vector,
  startTangent: Vector,
  endTangent: Vector,
  fraction: number,
): CurvePoint {
  const distance = Math.hypot(...subtract(end, start));
  const u = fraction,
    square = u * u,
    cube = square * u;
  const position = add(
    add(
      scale(start, 2 * cube - 3 * square + 1),
      scale(end, -2 * cube + 3 * square),
    ),
    add(
      scale(startTangent, distance * (cube - 2 * square + u)),
      scale(endTangent, distance * (cube - square)),
    ),
  );
  const tangent = normalize(
    add(
      add(scale(start, 6 * square - 6 * u), scale(end, -6 * square + 6 * u)),
      add(
        scale(startTangent, distance * (3 * square - 4 * u + 1)),
        scale(endTangent, distance * (3 * square - 2 * u)),
      ),
    ),
  );
  return { position, tangent };
}

function springCenterline(
  shape: Spring,
  seats: readonly [Vector, Vector],
  tangents: readonly [Vector, Vector],
): CurvePoint[] {
  const {
    axis,
    coilCenter,
    coilRadius,
    turns,
    pitch,
    coilSamples,
    legSamples,
  } = shape.parameters;
  const u = perpendicular(axis),
    v = cross(axis, u);
  const coil: CurvePoint[] = [];
  for (let index = 0; index < coilSamples; index++) {
    const fraction = index / (coilSamples - 1),
      angle = fraction * turns * 2 * Math.PI;
    const radial = add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle)));
    const position = add(
      add(coilCenter, scale(axis, (fraction - 0.5) * turns * pitch)),
      scale(radial, coilRadius),
    );
    const tangent = normalize(
      add(
        scale(axis, pitch / (2 * Math.PI)),
        add(
          scale(u, -coilRadius * Math.sin(angle)),
          scale(v, coilRadius * Math.cos(angle)),
        ),
      ),
    );
    coil.push({ position, tangent });
  }
  const first = coil[0]!,
    last = coil[coil.length - 1]!;
  return [
    ...Array.from({ length: legSamples }, (_, index) =>
      hermite(
        seats[0],
        first.position,
        tangents[0],
        first.tangent,
        index / legSamples,
      ),
    ),
    ...coil,
    ...Array.from({ length: legSamples }, (_, index) =>
      hermite(
        last.position,
        seats[1],
        last.tangent,
        tangents[1],
        (index + 1) / legSamples,
      ),
    ),
  ];
}

export function sampleSeatedTorsionSpring(
  shape: Spring,
  seats: readonly [Vector, Vector],
  tangents: readonly [Vector, Vector],
) {
  const curve = springCenterline(shape, seats, tangents);
  const { tubeSides, wireRadius } = shape.parameters;
  const positions: number[] = [],
    normals: number[] = [];
  let normal = perpendicular(curve[0]!.tangent);
  for (let ring = 0; ring < curve.length; ring++) {
    const point = curve[ring]!;
    if (ring)
      normal = transportNormal(curve[ring - 1]!.tangent, point.tangent, normal);
    const binormal = cross(point.tangent, normal);
    for (let side = 0; side < tubeSides; side++) {
      const angle = (2 * Math.PI * side) / tubeSides;
      const radial = normalize(
        add(scale(normal, Math.cos(angle)), scale(binormal, Math.sin(angle))),
      );
      positions.push(...add(point.position, scale(radial, wireRadius)));
      normals.push(...radial);
    }
  }
  for (let cap = 0; cap < 2; cap++) {
    const ring = cap === 0 ? 0 : curve.length - 1;
    for (let side = 0; side < tubeSides; side++) {
      const offset = (ring * tubeSides + side) * 3;
      positions.push(...positions.slice(offset, offset + 3));
      normals.push(...scale(curve[ring]!.tangent, cap === 0 ? -1 : 1));
    }
  }
  return { positions, normals };
}
