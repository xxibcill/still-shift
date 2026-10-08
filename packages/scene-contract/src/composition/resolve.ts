import { effectPointIndex } from "./effect-points.ts";
import { locateShapeProperty } from "./shape-properties.ts";
import {
  effectCurvePointIndex,
  effectCurvePointCount,
} from "./effect-curves.ts";
import { compositionEffectDefinition } from "./effects.ts";
import type { Composition, CompositionScope } from "./composition.ts";
import type { CompositionLayer } from "./layers.ts";
import {
  COMPOSITION_PATH_ROOT,
  formatPropertyPath,
  isPropertyPathError,
  LEGACY_PROPERTY_ALIASES,
  LEGACY_UNAVAILABLE_PROPERTIES,
  parsePropertyPath,
  type PropertyPathError,
  type PropertyPathSegment,
} from "./property-path.ts";

export type PropertyValueType =
  | "scalar"
  | "vec2"
  | "vec3"
  | "color"
  | "discrete"
  | "path"
  | "curve"
  | "points";

export type ResolvedProperty = {
  /** Canonical form: aliases expanded. */
  path: string;
  /** Precomp layer instance ids, from the root to the containing scope. */
  scope: string[];
  layer?: CompositionLayer;
  type: PropertyValueType;
  /** Readable by drivers and expressions but not a valid target. */
  readOnly: boolean;
};

type Result = ResolvedProperty | PropertyPathError;

export const isResolvedProperty = (value: Result): value is ResolvedProperty =>
  !("code" in value);

const unavailable = (path: string, milestone: string): PropertyPathError => ({
  code: "comp-feature-unavailable",
  message: `"${path}" is not available until ${milestone}`,
});
const missing = (path: string, what: string): PropertyPathError => ({
  code: "comp-path-property",
  message: `"${path}" does not name ${what}`,
});

const TRANSFORM_SCALARS = new Set(["rotation", "skewX", "skewY", "opacity"]);
const TRANSFORM_VECTORS = new Set(["anchor", "position", "scale"]);
const COMPONENTS = { vec2: ["x", "y"], vec3: ["x", "y", "z"] } as const;
const COLOR_COMPONENTS = ["r", "g", "b", "a"];

/** Precomp source definitions, including unused ones, keyed by definition id. */
export function precompsById(comp: Composition) {
  return new Map((comp.precomps ?? []).map((p) => [p.id, p]));
}

function resolveSegments(
  layer: CompositionLayer,
  segments: PropertyPathSegment[],
  text: string,
): { type: PropertyValueType } | PropertyPathError {
  const [head, next, ...rest] = segments;
  if (!head) return missing(text, "a property");
  const component = (
    type: PropertyValueType,
    names: readonly string[],
    after: PropertyPathSegment[],
  ) => {
    if (!after.length) return { type };
    if (after.length > 1 || after[0]!.index !== undefined)
      return missing(text, "a property");
    return names.includes(after[0]!.name)
      ? { type: "scalar" as const }
      : missing(text, `a component of a ${type} property`);
  };
  const indexed = (segment: PropertyPathSegment | undefined) =>
    segment?.index !== undefined;
  if (
    head.index !== undefined &&
    !["masks", "effects", "contents"].includes(head.name)
  )
    return missing(text, "an indexed property");

  switch (head.name) {
    case "plane":
      if (
        layer.type !== "image" ||
        layer.sampling !== "linear-srgb" ||
        !next ||
        indexed(next)
      )
        return missing(text, "an image-plane property");
      if (next.name === "motion" && rest[0] && rest[0].index === undefined) {
        if (rest[0].name === "offset")
          return component("vec2", COMPONENTS.vec2, rest.slice(1));
        if (["scale", "roll"].includes(rest[0].name))
          return component("scalar", [], rest.slice(1));
      }
      if (
        next.name === "reveal" &&
        layer.plane?.reveal &&
        rest[0]?.name === "progress" &&
        rest.length === 1 &&
        rest[0].index === undefined
      )
        return { type: "scalar" };
      return missing(text, "an image-plane motion/reveal property");
    case "motion":
      if (layer.type !== "depth-image" || !next || indexed(next))
        return missing(text, "a depth-image motion property");
      if (next.name === "offset")
        return component("vec2", COMPONENTS.vec2, rest);
      if (["scale", "strength", "roll"].includes(next.name))
        return component("scalar", [], rest);
      return missing(text, "a depth-image motion property");
    case "constraintReference":
      return layer.threeD || layer.type === "camera" || layer.type === "light"
        ? component("vec3", COMPONENTS.vec3, segments.slice(1))
        : component("vec2", COMPONENTS.vec2, segments.slice(1));
    case "transform": {
      if (!next || indexed(next)) return missing(text, "a transform property");
      if (TRANSFORM_SCALARS.has(next.name))
        return component("scalar", [], rest);
      if (TRANSFORM_VECTORS.has(next.name)) {
        const type =
          layer.threeD || layer.type === "camera" || layer.type === "light"
            ? "vec3"
            : "vec2";
        return component(type, COMPONENTS[type], rest);
      }
      if (["rotationX", "rotationY", "orientation"].includes(next.name)) {
        if (!layer.threeD && layer.type !== "camera" && layer.type !== "light")
          return unavailable(text, "CE8");
        return next.name === "orientation"
          ? component("vec3", COMPONENTS.vec3, rest)
          : component("scalar", [], rest);
      }
      return missing(text, "a transform property");
    }
    case "viewOffset":
      return layer.type === "camera"
        ? component("vec2", COMPONENTS.vec2, segments.slice(1))
        : missing(text, "a camera property");
    case "pointOfInterest":
      return layer.type === "camera"
        ? component("vec3", COMPONENTS.vec3, segments.slice(1))
        : missing(text, "a camera property");
    case "zoom":
    case "focalLength":
    case "filmSize":
    case "focusDistance":
    case "aperture":
    case "blurLevel":
      return layer.type === "camera"
        ? component("scalar", [], segments.slice(1))
        : missing(text, "a camera property");
    case "color":
      if (
        layer.type !== "solid" &&
        layer.type !== "text" &&
        layer.type !== "light"
      )
        return missing(text, `a property of a ${layer.type} layer`);
      return component("color", COLOR_COMPONENTS, segments.slice(1));
    case "intensity":
    case "range":
    case "falloffStart":
    case "innerCone":
    case "outerCone":
      if (
        layer.type !== "light" ||
        (head.name !== "intensity" && layer.lightType === "ambient") ||
        (["innerCone", "outerCone"].includes(head.name) &&
          layer.lightType !== "spot")
      )
        return missing(text, "a property of this light type");
      return component("scalar", [], segments.slice(1));
    case "state":
      if (
        layer.type !== "image" &&
        layer.type !== "text" &&
        layer.type !== "provider"
      )
        return missing(text, `a property of a ${layer.type} layer`);
      if (
        layer.type === "provider" &&
        layer.state === undefined &&
        layer.stateFrom === undefined
      )
        return missing(text, "a declared provider content state");
      return component("discrete", [], segments.slice(1));
    case "stateFrom":
    case "stateMix":
      if (
        layer.type !== "image" &&
        layer.type !== "text" &&
        layer.type !== "provider"
      )
        return missing(text, `a property of a ${layer.type} layer`);
      if (
        layer.type === "provider" &&
        layer.state === undefined &&
        layer.stateFrom === undefined
      )
        return missing(text, "a declared provider content state");
      return component(
        head.name === "stateFrom" ? "discrete" : "scalar",
        [],
        segments.slice(1),
      );
    case "reveal":
      if (layer.type !== "text")
        return missing(text, `a property of a ${layer.type} layer`);
      return component("scalar", [], segments.slice(1));
    case "timeRemap":
      if (!["precomp", "video", "sequence", "audio"].includes(layer.type))
        return missing(text, `a property of a ${layer.type} layer`);
      return component("scalar", [], segments.slice(1));
    case "gainDb":
    case "pan":
      return layer.type === "audio"
        ? component("scalar", [], segments.slice(1))
        : missing(text, "an audio control");
    case "masks": {
      const mask = layer.masks?.find((m) => m.id === head.index);
      if (!mask) return missing(text, "a mask on this layer");
      if (!next || indexed(next) || rest.length)
        return missing(text, "a mask property");
      if (next.name === "path") return { type: "path" };
      if (["feather", "expansion", "opacity"].includes(next.name))
        return { type: "scalar" };
      return missing(text, "a mask property");
    }
    case "effects": {
      const effect = layer.effects?.find((e) => e.id === head.index);
      if (!effect) return missing(text, "an effect on this layer");
      const definition = compositionEffectDefinition(effect.effect);
      if (!definition) return missing(text, "a registered effect");
      if (!next || !Object.hasOwn(definition.properties, next.name))
        return missing(text, "an effect parameter");
      const descriptor = definition.properties[next.name]!;
      const type = descriptor.type;
      if ((type === "curve" || type === "points") && next.index !== undefined) {
        const index =
          type === "curve"
            ? effectCurvePointIndex(next.index)
            : effectPointIndex(next.index);
        if (
          index === undefined ||
          index >=
            effectCurvePointCount(
              effect.params?.[next.name],
              descriptor.default,
            )
        )
          return missing(text, "an effect control point");
        return component("vec2", COMPONENTS.vec2, rest);
      }
      if (next.index !== undefined) return missing(text, "an effect parameter");
      return component(
        type,
        type === "color"
          ? COLOR_COMPONENTS
          : type === "vec2"
            ? COMPONENTS.vec2
            : [],
        rest,
      );
    }
    case "contents": {
      const property =
        layer.type === "shape"
          ? locateShapeProperty(layer.contents, segments)
          : undefined;
      return property
        ? { type: property.type }
        : missing(text, "a native shape property");
    }
    default:
      return missing(text, "a property");
  }
}

/**
 * Resolve a property path against a composition and report its value type. Only the
 * existence of masks and effects is checked; other properties exist with their
 * default value whether or not they are authored.
 */
export function resolvePropertyPath(comp: Composition, text: string): Result {
  const parsed = parsePropertyPath(text);
  if (isPropertyPathError(parsed)) return parsed;

  if (parsed.layer === COMPOSITION_PATH_ROOT) {
    const [camera, axis, ...rest] = parsed.segments;
    if (
      camera?.name !== "camera" ||
      camera.index !== undefined ||
      !axis ||
      axis.index !== undefined ||
      !["x", "y", "zoom"].includes(axis.name) ||
      rest.length
    )
      return missing(text, "a composition property (comp.camera.x|y|zoom)");
    if (!comp.camera2d) return missing(text, "a camera; camera2d is not set");
    return { path: text, scope: [], type: "scalar", readOnly: true };
  }

  const precomps = precompsById(comp);
  let scope: CompositionScope = comp;
  for (const id of parsed.scope) {
    const instance = scope.layers.find((layer) => layer.id === id);
    const next =
      instance?.type === "precomp" ? precomps.get(instance.comp) : undefined;
    if (!next)
      return {
        code: "comp-path-scope",
        message: `"${text}": no precomp layer instance "${id}" in ${scope === comp ? "the composition" : `precomp "${scope.id}"`}`,
      };
    scope = next;
  }
  const layer = scope.layers.find((l) => l.id === parsed.layer);
  if (!layer)
    return {
      code: "comp-path-layer",
      message: `"${text}": no layer "${parsed.layer}"${parsed.scope.length ? ` in precomp "${scope.id}"` : ""}`,
    };

  let segments = parsed.segments;
  if (segments.length === 1 && segments[0]!.index === undefined) {
    const name = segments[0]!.name;
    if (Object.hasOwn(LEGACY_UNAVAILABLE_PROPERTIES, name))
      return missing(
        text,
        "an explicit native shape property; use contents[...].<field>",
      );
    if (name === "blur") {
      const paint =
        layer.effects?.filter((effect) => effect.effect === "blur.primitive") ??
        [];
      if (paint.length !== 1)
        return missing(
          text,
          "one declared primitive blur; use effects[id].radius",
        );
      segments = [{ name: "effects", index: paint[0]!.id }, { name: "radius" }];
    }
    const alias = Object.hasOwn(LEGACY_PROPERTY_ALIASES, name)
      ? LEGACY_PROPERTY_ALIASES[name]
      : undefined;
    if (alias) segments = alias.split(".").map((name) => ({ name }));
  }
  const resolved = resolveSegments(layer, segments, text);
  if ("code" in resolved) return resolved;
  return {
    path: formatPropertyPath({ ...parsed, segments }),
    scope: parsed.scope,
    layer,
    type: resolved.type,
    readOnly: false,
  };
}
