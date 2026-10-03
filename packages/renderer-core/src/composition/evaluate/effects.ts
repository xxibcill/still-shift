import {
  compositionEffectDefinition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { scalar, color, unit } from "./sample.ts";
import type { Bounds, Rgba } from "./types.ts";

export type EvaluatedEffect = {
  id: string;
  effect: string;
  enabled: boolean;
  space?: string;
  params: Record<string, number | Rgba>;
};

export function sampleEffects(
  layer: CompositionLayer,
  time: number,
  fps: number,
  keyTime = time,
): EvaluatedEffect[] {
  return (layer.effects ?? []).map((effect) => {
    const definition = compositionEffectDefinition(effect.effect)!;
    return {
      id: effect.id,
      effect: effect.effect,
      ...(effect.space ? { space: effect.space } : {}),
      enabled:
        effect.enabled !== false &&
        time >= (effect.inPoint ?? -Infinity) &&
        time < (effect.outPoint ?? Infinity),
      params: Object.fromEntries(
        Object.entries(definition.properties).map(([name, property]) => [
          name,
          property.type === "color"
            ? color(effect.params?.[name] ?? property.default, keyTime, fps)
            : scalar(effect.params?.[name], keyTime, fps, property.default),
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
    )) {
      if (property.type === "color")
        effect.params[name] = (effect.params[name] as Rgba).map(unit) as Rgba;
      else {
        const value = effect.params[name] as number;
        effect.params[name] = Math.max(
          property.min,
          Math.min(property.max, property.integer ? Math.round(value) : value),
        );
      }
    }
}

/** Kernels operate in the current composition surface's pixel space. */
export function effectBounds(
  bounds: Bounds,
  effects: EvaluatedEffect[],
): Bounds | null {
  let margin = 0;
  for (const effect of effects)
    if (effect.enabled) {
      if (compositionEffectDefinition(effect.effect)!.generatesContent)
        return null;
      const params = effect.params as Record<string, number>;
      if (
        effect.effect === "blur.gaussian" ||
        effect.effect === "blur.primitive" ||
        effect.effect === "light.glow"
      )
        margin += params.radius! > 0 ? 3 * params.radius! + 2 : 0;
      else if (effect.effect === "blur.directional")
        margin += params.length! / 2 + 1;
      else if (effect.effect === "distort.sine")
        margin += Math.abs(params.amount!) + 1;
    }
  return margin
    ? {
        left: bounds.left - margin,
        top: bounds.top - margin,
        right: bounds.right + margin,
        bottom: bounds.bottom + margin,
      }
    : bounds;
}
