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
  | "path";

export type ResolvedProperty = {
  /** Canonical form: aliases expanded. */
  path: string;
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

/** Scopes reachable from the root, keyed by precomp id. */
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
    case "constraintReference":
      return component("vec2", COMPONENTS.vec2, segments.slice(1));
    case "transform": {
      if (!next || indexed(next)) return missing(text, "a transform property");
      if (TRANSFORM_SCALARS.has(next.name))
        return component("scalar", [], rest);
      if (TRANSFORM_VECTORS.has(next.name)) {
        const type = layer.threeD ? "vec3" : "vec2";
        return component(type, COMPONENTS[type], rest);
      }
      if (["rotationX", "rotationY", "orientation"].includes(next.name))
        return unavailable(text, "CE8");
      return missing(text, "a transform property");
    }
    case "color":
      if (layer.type !== "solid" && layer.type !== "text")
        return missing(text, `a property of a ${layer.type} layer`);
      return component("color", COLOR_COMPONENTS, segments.slice(1));
    case "state":
      if (layer.type !== "image" && layer.type !== "text")
        return missing(text, `a property of a ${layer.type} layer`);
      return component("discrete", [], segments.slice(1));
    case "stateFrom":
    case "stateMix":
      if (layer.type !== "image")
        return missing(text, `a property of a ${layer.type} layer`);
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
    case "effects":
      if (!layer.effects?.some((e) => e.id === head.index))
        return missing(text, "an effect on this layer");
      return unavailable(text, "CE6");
    case "contents":
      return unavailable(text, "CE5");
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
    const next = precomps.get(id);
    if (
      !next ||
      !scope.layers.some((l) => l.type === "precomp" && l.comp === id)
    )
      return {
        code: "comp-path-scope",
        message: `"${text}": precomp "${id}" is not used by ${scope === comp ? "the composition" : `precomp "${scope.id}"`}`,
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
      return unavailable(text, LEGACY_UNAVAILABLE_PROPERTIES[name]!);
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
