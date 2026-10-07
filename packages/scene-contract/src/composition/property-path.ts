import { z } from "zod";
import { COMPOSITION_LIMITS } from "./primitives.ts";

/**
 * Property paths address anything animatable:
 *
 *   path    := [ precompLayerId "/" ]* layerId "." segment ( "." segment )*
 *   segment := name | name "[" index "]"
 *
 * `intro/hero.transform.opacity` is layer `hero` inside precomp layer `intro`;
 * `comp.camera.zoom` addresses the composition itself. Legacy targets such as
 * `title.x` are aliases (see LEGACY_PROPERTY_ALIASES).
 */
export type PropertyPathSegment = { name: string; index?: string };
export type PropertyPath = {
  scope: string[];
  layer: string;
  segments: PropertyPathSegment[];
};
export type PropertyPathError = { code: string; message: string };

/** First segment that addresses the composition rather than a layer. */
export const COMPOSITION_PATH_ROOT = "comp";

const identifier = /^[a-zA-Z][\w-]*$/;
const segmentPattern = /^([a-zA-Z][\w-]*)(?:\[([a-zA-Z][\w-]*)\])?$/;

export const PropertyPathSchema = z
  .string()
  .min(3)
  .max(COMPOSITION_LIMITS.maxPropertyPathLength);

export function parsePropertyPath(
  text: string,
): PropertyPath | PropertyPathError {
  const syntax = (message: string) => ({
    code: "comp-path-syntax",
    message: `${message} in property path "${text}"`,
  });
  if (text.length > COMPOSITION_LIMITS.maxPropertyPathLength)
    return syntax("too long");
  const parts = text.split("/");
  const tail = parts.pop()!;
  for (const scope of parts)
    if (!identifier.test(scope))
      return syntax(`invalid precomp layer id "${scope}"`);
  const [layer, ...rest] = tail.split(".");
  if (!layer || !identifier.test(layer))
    return syntax(`invalid layer id "${layer ?? ""}"`);
  if (!rest.length) return syntax("missing property");
  const segments: PropertyPathSegment[] = [];
  for (const part of rest) {
    const match = segmentPattern.exec(part);
    if (!match) return syntax(`invalid segment "${part}"`);
    segments.push(
      match[2] === undefined
        ? { name: match[1]! }
        : { name: match[1]!, index: match[2] },
    );
  }
  if (parts.length && layer === COMPOSITION_PATH_ROOT)
    return syntax(`"${COMPOSITION_PATH_ROOT}" cannot be inside a precomp`);
  return { scope: parts, layer, segments };
}

export const isPropertyPathError = (
  value: PropertyPath | PropertyPathError,
): value is PropertyPathError => "code" in value;

export function formatPropertyPath(path: PropertyPath) {
  return [
    ...path.scope,
    [
      path.layer,
      ...path.segments.map((s) =>
        s.index === undefined ? s.name : `${s.name}[${s.index}]`,
      ),
    ].join("."),
  ].join("/");
}

/**
 * Legacy `node.property` targets used by story and commerce motion craft, mapped to
 * composition property paths. Shape modifiers require an explicit native contents
 * path; their historical milestone labels are retained for existing consumers.
 */
export const LEGACY_PROPERTY_ALIASES: Record<string, string> = {
  x: "transform.position.x",
  y: "transform.position.y",
  scaleX: "transform.scale.x",
  scaleY: "transform.scale.y",
  rotation: "transform.rotation",
  opacity: "transform.opacity",
  anchorX: "transform.anchor.x",
  anchorY: "transform.anchor.y",
  skewX: "transform.skewX",
  skewY: "transform.skewY",
  reveal: "reveal",
};
export const LEGACY_UNAVAILABLE_PROPERTIES: Record<string, string> = {
  gap: "CE5",
  pulse: "CE5",
  pinch: "CE5",
  strokeWidth: "CE5",
  trimStart: "CE5",
  trimEnd: "CE5",
  trimOffset: "CE5",
};
