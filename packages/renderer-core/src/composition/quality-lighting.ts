import {
  FLAT_LIGHTING_VERSION,
  decodeLightColor,
  planeNormal,
} from "./evaluate/lighting.ts";
import { worldPoint } from "./evaluate/spatial-geometry.ts";
import type { EvaluatedLayer, EvaluatedLayerTree } from "./evaluate/types.ts";

/** Match the receiver's render scope, excluding controls the diffuse shader never uses. */
export function receiverLightingState(
  state: EvaluatedLayer,
  scope: EvaluatedLayerTree,
) {
  const lights = (state.exposure?.tree ?? scope).lights;
  if (!state.layer.receivesLight || !lights?.length) return undefined;
  const world = state.worldMatrix3d!;
  const origin = worldPoint(world, [0, 0, 0]);
  return [
    FLAT_LIGHTING_VERSION,
    lights
      .filter(
        (light) =>
          light.intensity * light.color[3] > 0 &&
          light.color.slice(0, 3).some((v) => v > 0),
      )
      .map((light) => {
        const rgb = light.color
          .slice(0, 3)
          .map((v) => decodeLightColor(v) * light.intensity * light.color[3]);
        if (light.type === "ambient") return [light.type, rgb];
        return [
          light.type,
          rgb,
          [world[0], world[1], world[2]],
          [world[4], world[5], world[6]],
          planeNormal(world),
          light.position.map((v, axis) => v - origin[axis]!),
          light.range,
          light.falloffStart,
          ...(light.type === "spot"
            ? [light.direction, light.innerCone, light.outerCone]
            : []),
        ];
      }),
  ];
}
