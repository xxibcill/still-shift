import {
  compositionEffectDefinition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { scalar, vector, color, unit } from "./sample.ts";
import type { Bounds, Rgba } from "./types.ts";
import type { Point } from "../../node-transform.ts";
import {
  passageError,
  type PassageDiagnostic,
} from "../../passage-diagnostics.ts";

export type EvaluatedEffect = {
  id: string;
  effect: string;
  /** Evaluated stacks carry versions; standalone backend probes may omit them. */
  version?: string;
  enabled: boolean;
  space?: string;
  params: Record<string, number | Rgba | Point>;
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
      version: definition.version,
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
            : property.type === "vec2"
              ? vector(effect.params?.[name], keyTime, fps, [
                  ...property.default,
                ])
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
      else if (property.type === "vec2")
        effect.params[name] = (effect.params[name] as Point).map((value) =>
          Math.max(property.min, Math.min(property.max, value)),
        ) as Point;
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
  location: Pick<PassageDiagnostic, "node" | "path" | "frame"> = {},
): Bounds | null {
  let margin = 0;
  let current = bounds;
  for (const effect of effects)
    if (effect.enabled) {
      if (compositionEffectDefinition(effect.effect)!.generatesContent)
        return null;
      const definition = compositionEffectDefinition(effect.effect)!;
      if (definition.expandBounds) {
        if (margin) {
          current = expanded(current, margin);
          margin = 0;
        }
        let next: Bounds | null;
        try {
          next = definition.expandBounds({ ...current }, effect.params);
        } catch {
          passageError("comp-effect-bounds", "Effect bounds callback failed", {
            ...location,
            path: `${location.path ?? "layer"}.effects[${effect.id}]`,
          });
        }
        if (next === null) return null;
        if (
          !next ||
          ![next.left, next.top, next.right, next.bottom].every(
            Number.isFinite,
          ) ||
          next.left > next.right ||
          next.top > next.bottom
        )
          passageError(
            "comp-effect-bounds",
            "Effect bounds must be finite and ordered",
            {
              ...location,
              path: `${location.path ?? "layer"}.effects[${effect.id}]`,
            },
          );
        current = next;
        continue;
      }
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
  return margin ? expanded(current, margin) : current;
}
function expanded(bounds: Bounds, margin: number): Bounds {
  return {
    left: bounds.left - margin,
    top: bounds.top - margin,
    right: bounds.right + margin,
    bottom: bounds.bottom + margin,
  };
}
