import {
  locateShapeProperty,
  effectCurvePointIndex,
  type PropertyPathSegment,
} from "@still-shift/scene-contract";
import type { EvaluatedLayer, PropertyValue } from "./types.ts";

const vectorAxis = { x: 0, y: 1, z: 2 } as const;
const colorAxis = { r: 0, g: 1, b: 2, a: 3 } as const;

function container(state: EvaluatedLayer, segments: PropertyPathSegment[]) {
  const [head, next, component] = segments;
  if (head!.name === "plane" && state.imagePlane) {
    const field = next!.name === "reveal" ? "revealProgress" : component!.name;
    return field === "offset" && segments[3]
      ? {
          object: state.imagePlane.offset,
          key: vectorAxis[segments[3].name as "x" | "y"],
        }
      : { object: state.imagePlane, key: field };
  }
  if (head!.name === "motion" && state.depthMotion)
    return next!.name === "offset" && component
      ? {
          object: state.depthMotion.offset,
          key: vectorAxis[component.name as "x" | "y"],
        }
      : { object: state.depthMotion, key: next!.name };
  if (head!.name === "contents") {
    const location = locateShapeProperty(state.contents!, segments)!;
    if (location.component !== undefined)
      return {
        object: location.owner[location.key] as number[],
        key: location.component,
      };
    return { object: location.owner, key: location.key };
  }
  if (head!.name === "transform") {
    const key = next!.name as keyof EvaluatedLayer["transform"];
    if (component)
      return {
        object: state.transform[key] as number[],
        key: vectorAxis[component.name as keyof typeof vectorAxis],
      };
    return { object: state.transform, key };
  }
  if (head!.name === "effects") {
    const params = state.effects.find((e) => e.id === head!.index)!.params;
    if (next!.index !== undefined) {
      const points = params[next!.name] as number[][];
      const index = effectCurvePointIndex(next!.index)!;
      return component
        ? {
            object: points[index]!,
            key: vectorAxis[component.name as keyof typeof vectorAxis],
          }
        : { object: points, key: index };
    }
    if (component)
      return {
        object: params[next!.name] as number[],
        key:
          component.name in colorAxis
            ? colorAxis[component.name as keyof typeof colorAxis]
            : vectorAxis[component.name as keyof typeof vectorAxis],
      };
    return { object: params, key: next!.name };
  }
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
  if (
    state.camera &&
    [
      "pointOfInterest",
      "viewOffset",
      "zoom",
      "focalLength",
      "filmSize",
      "focusDistance",
      "aperture",
      "blurLevel",
    ].includes(head!.name)
  )
    return ["pointOfInterest", "viewOffset"].includes(head!.name) && next
      ? {
          object: state.camera[head!.name as "pointOfInterest" | "viewOffset"],
          key: vectorAxis[next.name as keyof typeof vectorAxis],
        }
      : { object: state.camera, key: head!.name };
  if (
    state.light &&
    ["intensity", "range", "falloffStart", "innerCone", "outerCone"].includes(
      head!.name,
    )
  )
    return { object: state.light, key: head!.name };
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
  if (state.camera && ["zoom", "focalLength"].includes(segments[0]!.name))
    state.camera.opticalMode =
      segments[0]!.name === "zoom" ? "zoom" : "focal-length";
  (object as unknown as Record<string | number, number>)[key] = value;
}

/** Write an expression result: a number, or a vector/colour copied into place. */
export function writeValue(
  state: EvaluatedLayer,
  segments: PropertyPathSegment[],
  value: number | readonly number[],
) {
  const { object, key } = container(state, segments);
  if (state.camera && ["zoom", "focalLength"].includes(segments[0]!.name))
    state.camera.opticalMode =
      segments[0]!.name === "zoom" ? "zoom" : "focal-length";
  (object as unknown as Record<string | number, number | number[]>)[key] =
    typeof value === "number" ? value : [...value];
}
