import {
  compositionEffectDefinition,
  effectCurveIssue,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { scalar, vector, color, unit, effectCurve } from "./sample.ts";
import type { Bounds, EvaluatedLayer, Rgba } from "./types.ts";
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
  inputs?: Readonly<Record<string, string>>;
  params: Record<string, number | Rgba | Point | Point[]>;
};

/** A positive local radius overrides group paint; zero retains the nearest positive group radius. */
export function primitiveBlurEffect(
  state: EvaluatedLayer,
  byId: ReadonlyMap<string, EvaluatedLayer>,
): EvaluatedEffect | undefined {
  for (
    let current: EvaluatedLayer | undefined = state;
    current;
    current = current.layer.parent ? byId.get(current.layer.parent) : undefined
  ) {
    if (current !== state && current.layer.type !== "group") continue;
    const blur = current.effects.find(
      (effect) => effect.enabled && effect.effect === "blur.primitive",
    );
    if (blur && (blur.params.radius as number) > 0) return blur;
  }
  return undefined;
}

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
      ...(effect.inputs ? { inputs: { ...effect.inputs } } : {}),
      enabled:
        effect.enabled !== false &&
        time >= (effect.inPoint ?? -Infinity) &&
        time < (effect.outPoint ?? Infinity),
      params: Object.fromEntries(
        Object.entries(definition.properties).map(([name, property]) => [
          name,
          property.type === "curve"
            ? effectCurve(effect.params?.[name], keyTime, fps, property.default)
            : property.type === "color"
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
      if (property.type === "curve") {
        const points = (effect.params[name] as Point[]).map(
          (point) => point.map(unit) as Point,
        );
        effect.params[name] = points;
      } else if (property.type === "color")
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

function validationParameters(
  params: EvaluatedEffect["params"],
): EvaluatedEffect["params"] {
  const snapshot = structuredClone(params);
  for (const value of Object.values(snapshot))
    if (Array.isArray(value)) {
      for (const point of value) if (Array.isArray(point)) Object.freeze(point);
      Object.freeze(value);
    }
  return Object.freeze(snapshot);
}
/** Validate final cross-parameter invariants without allowing callbacks to mutate the result. */
export function validateEffectParameters(
  effects: EvaluatedEffect[],
  location: Pick<PassageDiagnostic, "node" | "path" | "frame">,
) {
  for (const effect of effects) {
    const definition = compositionEffectDefinition(effect.effect)!;
    try {
      if (effect.enabled && definition.validateParams) {
        const result = definition.validateParams(
          validationParameters(effect.params),
        ) as unknown;
        if (result !== undefined)
          throw Error(
            "Effect parameter validation must be synchronous and return no value",
          );
      }
    } catch (error) {
      passageError(
        "comp-effect-params",
        error instanceof Error
          ? error.message
          : "Invalid evaluated effect parameters",
        {
          ...location,
          path: `${location.path ?? "layer"}.effects[${effect.id}]`,
        },
      );
    }
    for (const [name, property] of Object.entries(definition.properties)) {
      if (property.type !== "curve") continue;
      const issue = effectCurveIssue(effect.params[name] as Point[]);
      if (issue)
        passageError("comp-effect-curve", issue, {
          ...location,
          path: `${location.path ?? "layer"}.effects[${effect.id}].${name}`,
        });
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
