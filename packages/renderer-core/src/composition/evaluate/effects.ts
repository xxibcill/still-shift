import {
  compositionEffectDefinition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { scalar } from "./sample.ts";
import type { Bounds } from "./types.ts";

export type EvaluatedEffect = {
  id: string;
  effect: string;
  enabled: boolean;
  params: Record<string, number>;
};

export function sampleEffects(
  layer: CompositionLayer,
  time: number,
  fps: number,
): EvaluatedEffect[] {
  return (layer.effects ?? []).map((effect) => {
    const definition = compositionEffectDefinition(effect.effect)!;
    return {
      id: effect.id,
      effect: effect.effect,
      enabled:
        effect.enabled !== false &&
        time >= (effect.inPoint ?? -Infinity) &&
        time < (effect.outPoint ?? Infinity),
      params: Object.fromEntries(
        Object.entries(definition.properties).map(([name, property]) => [
          name,
          scalar(effect.params?.[name], time, fps, property.default),
        ]),
      ),
    };
  });
}

/** Drivers can overshoot; clamp the final value using the same bounds as authored keys. */
export function clampEffects(effects: EvaluatedEffect[]) {
  for (const effect of effects)
    for (const [name, property] of Object.entries(
      compositionEffectDefinition(effect.effect)!.properties,
    ))
      effect.params[name] = Math.max(
        property.min,
        Math.min(property.max, effect.params[name]!),
      );
}

/** Kernels operate in the current composition surface's pixel space. */
export function effectBounds(
  bounds: Bounds,
  effects: EvaluatedEffect[],
): Bounds {
  let margin = 0;
  for (const effect of effects)
    if (effect.enabled && effect.effect === "blur.gaussian")
      margin += effect.params.radius! > 0 ? 3 * effect.params.radius! + 2 : 0;
  return margin
    ? {
        left: bounds.left - margin,
        top: bounds.top - margin,
        right: bounds.right + margin,
        bottom: bounds.bottom + margin,
      }
    : bounds;
}
