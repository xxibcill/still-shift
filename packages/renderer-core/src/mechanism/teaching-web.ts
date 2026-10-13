import type { MechanismTeachingShape } from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { MechanismEvaluationErrorV2 } from "./types-v2.ts";
import { add, cross, dot, normalize, scale, subtract } from "./shape-math.ts";
import type { Vector } from "./shape-math.ts";

type Web = Extract<
  DeepReadonly<MechanismTeachingShape>,
  { generator: "seated-flexible-web-1" }
>;
/** A closed planar strip interpolates both attached ends and their posed tangents.
 * This is illustrative deformation, without stress, strain or material simulation. */
export function sampleSeatedFlexibleWeb(
  shape: Web,
  seats: readonly [Vector, Vector],
  tangents: readonly [Vector, Vector],
) {
  const { width, thickness, minSpan, maxSpan, longitudinalSegments } =
    shape.parameters;
  const widthAxis = normalize(shape.parameters.widthAxis);
  const delta = subtract(seats[1], seats[0]),
    span = Math.hypot(...delta);
  const fail = (message: string, code: string): never => {
    throw new MechanismEvaluationErrorV2(message, {
      code,
      path: ["teachingShapes", shape.id, "seats"],
    });
  };
  if (span < minSpan || span > maxSpan)
    fail(
      "Web seat distance exceeds its declared span envelope",
      "mechanism-web-span",
    );
  const chord = normalize(delta),
    directions = tangents.map(normalize);
  if (
    Math.abs(dot(delta, widthAxis)) > 1e-8 * Math.max(1, span) ||
    directions.some((v) => Math.abs(dot(v, widthAxis)) > 1e-8)
  )
    fail(
      "Web seats and terminal tangents must retain their declared plane",
      "mechanism-web-plane",
    );
  // All three Bezier derivative controls have positive chord projection, so the
  // cubic centerline cannot reverse. Unsupported folded clamps reject explicitly.
  if (directions.some((v) => dot(v, chord) <= 1e-6))
    fail(
      "Web terminal tangents must advance toward the opposite seat",
      "mechanism-web-tangent",
    );
  const positions: number[] = [],
    normals: number[] = [],
    terminalDirections: Vector[] = [];
  const signs = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const;
  for (let ring = 0; ring <= longitudinalSegments; ring++) {
    const u = ring / longitudinalSegments,
      u2 = u * u,
      u3 = u2 * u;
    const center = add(
      add(
        scale(seats[0], 2 * u3 - 3 * u2 + 1),
        scale(seats[1], -2 * u3 + 3 * u2),
      ),
      add(
        scale(directions[0]!, span * (u3 - 2 * u2 + u)),
        scale(directions[1]!, span * (u3 - u2)),
      ),
    );
    const velocity = add(
      add(scale(seats[0], 6 * u2 - 6 * u), scale(seats[1], -6 * u2 + 6 * u)),
      add(
        scale(directions[0]!, span * (3 * u2 - 4 * u + 1)),
        scale(directions[1]!, span * (3 * u2 - 2 * u)),
      ),
    );
    const acceleration = add(
      add(scale(seats[0], 12 * u - 6), scale(seats[1], -12 * u + 6)),
      add(
        scale(directions[0]!, span * (6 * u - 4)),
        scale(directions[1]!, span * (6 * u - 2)),
      ),
    );
    const curvature =
      Math.hypot(...cross(velocity, acceleration)) /
      Math.hypot(...velocity) ** 3;
    if ((curvature * thickness) / 2 >= 0.8)
      fail(
        "Web thickness exceeds the sampled bend-radius envelope",
        "mechanism-web-curvature",
      );
    const tangent = normalize(velocity),
      normal = normalize(cross(widthAxis, tangent));
    terminalDirections.push(tangent);
    for (const [height, side] of signs) {
      positions.push(
        ...add(
          center,
          add(
            scale(normal, (height * thickness) / 2),
            scale(widthAxis, (side * width) / 2),
          ),
        ),
      );
      normals.push(
        ...normalize(add(scale(normal, height), scale(widthAxis, side))),
      );
    }
  }
  for (let cap = 0; cap < 2; cap++) {
    const ring = cap === 0 ? 0 : longitudinalSegments;
    for (let side = 0; side < 4; side++) {
      const offset = ring * 12 + side * 3;
      positions.push(...positions.slice(offset, offset + 3));
      normals.push(...scale(terminalDirections[ring]!, cap === 0 ? -1 : 1));
    }
  }
  return { positions, normals };
}
