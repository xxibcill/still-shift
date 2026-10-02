import type { PropertyPathSegment } from "@still-shift/scene-contract";
import type { EvaluatedLayer, PropertyValue } from "./types.ts";

const vectorAxis = { x: 0, y: 1 } as const;
const colorAxis = { r: 0, g: 1, b: 2, a: 3 } as const;

function container(state: EvaluatedLayer, segments: PropertyPathSegment[]) {
  const [head, next, component] = segments;
  if (head!.name === "transform") {
    const key = next!.name as keyof EvaluatedLayer["transform"];
    if (component)
      return {
        object: state.transform[key] as number[],
        key: vectorAxis[component.name as keyof typeof vectorAxis],
      };
    return { object: state.transform, key };
  }
  if (head!.name === "effects")
    return {
      object: state.effects.find((e) => e.id === head!.index)!.params,
      key: next!.name,
    };
  if (head!.name === "masks")
    return {
      object: state.masks.find((m) => m.id === head!.index)!,
      key: next!.name,
    };
  if (head!.name === "constraintReference" && next)
    return {
      object: state.constraintReference,
      key: vectorAxis[next.name as keyof typeof vectorAxis],
    };
  if (head!.name === "color" && next)
    return {
      object: state.color!,
      key: colorAxis[next.name as keyof typeof colorAxis],
    };
  return { object: state, key: head!.name };
}

export function readProperty(
  state: EvaluatedLayer,
  segments: PropertyPathSegment[],
): PropertyValue {
  const { object, key } = container(state, segments);
  return (object as unknown as Record<string | number, PropertyValue>)[key]!;
}

export function writeProperty(
  state: EvaluatedLayer,
  segments: PropertyPathSegment[],
  value: number,
) {
  const { object, key } = container(state, segments);
  (object as unknown as Record<string | number, number>)[key] = value;
}
