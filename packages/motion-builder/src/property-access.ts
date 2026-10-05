import {
  compositionEffectDefinition,
  locateShapeProperty,
  parsePropertyPath,
  isPropertyPathError,
  type ShapeContent,
  isResolvedProperty,
  resolvePropertyPath,
  type Composition,
} from "@still-shift/scene-contract";
import { BuilderError, type SourceLocation } from "./source.ts";

type ObjectValue = Record<string, unknown>;
const asObject = (value: unknown): ObjectValue | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : undefined;

export function canonicalProperty(
  comp: Composition,
  layer: string,
  property: string,
  site: SourceLocation,
): string {
  const resolved = resolvePropertyPath(comp, `${layer}.${property}`);
  if (!isResolvedProperty(resolved))
    throw new BuilderError(resolved.code, resolved.message, site);
  if (/\.(?:color|effects\[[^\]]+\]\.[^.]+)\.[rgba]$/.test(resolved.path))
    throw new BuilderError(
      "comp-builder-color-component",
      "Animate the whole color with keys; use expressions or drivers for color components",
      site,
    );
  return resolved.path.slice(layer.length + 1);
}

/** Translate public selector IDs to emitted array indices, including effect params. */
export function propertyJsonPath(object: ObjectValue, path: string): string {
  const native = nativeProperty(object, path);
  if (native)
    return native.jsonPath
      .map((part, i) =>
        typeof part === "number" ? `[${part}]` : `${i ? "." : ""}${part}`,
      )
      .join("");
  return path.replace(
    /^(masks|effects)\[([^\]]+)\]\./,
    (_match, collection: string, id: string) => {
      const values = object[collection] as ObjectValue[];
      const index = values.findIndex((value) => value.id === id);
      return `${collection}[${index}].${collection === "effects" ? "params." : ""}`;
    },
  );
}

function nativeProperty(object: ObjectValue, path: string) {
  if (!path.startsWith("contents[") || !Array.isArray(object.contents))
    return undefined;
  const parsed = parsePropertyPath(`node.${path}`);
  return isPropertyPathError(parsed)
    ? undefined
    : locateShapeProperty(object.contents as ShapeContent[], parsed.segments);
}
function parts(path: string): string[] {
  return path.replace(/\[(\d+)\]/g, ".$1").split(".");
}
export function readProperty(object: ObjectValue, path: string): unknown {
  const emitted = propertyJsonPath(object, path);
  let value: unknown = object;
  for (const part of parts(emitted)) {
    if (Array.isArray(value))
      value =
        value[
          /^\d+$/.test(part) ? Number(part) : ["x", "y", "z"].indexOf(part)
        ];
    else value = asObject(value)?.[part];
  }
  if (value !== undefined) return value;
  const native = nativeProperty(object, path);
  if (native) {
    const fallback = native.descriptor.default;
    return native.component !== undefined && Array.isArray(fallback)
      ? fallback[native.component]
      : structuredClone(fallback);
  }
  const effect = /^effects\[([^\]]+)\]\.([^.]+)(?:\.([xy]))?$/.exec(path);
  if (effect) {
    const values = object.effects as ObjectValue[];
    const entry = values.find((value) => value.id === effect[1]);
    const fallback = compositionEffectDefinition(String(entry?.effect))
      ?.properties[effect[2]!]?.default;
    return effect[3] && Array.isArray(fallback)
      ? fallback[effect[3] === "x" ? 0 : 1]
      : structuredClone(fallback);
  }
  if (/^masks\[[^\]]+\]\.opacity$/.test(path)) return 1;
  if (/^masks\[[^\]]+\]\.(feather|expansion)$/.test(path)) return 0;
  if (
    /^transform\.(skewX|skewY)$/.test(path) ||
    ["state", "stateFrom", "stateMix"].includes(path)
  )
    return 0;
  if (path === "reveal") return 1;
  return undefined;
}
export function writeProperty(
  object: ObjectValue,
  path: string,
  value: unknown,
): void {
  const names = parts(propertyJsonPath(object, path));
  const native = nativeProperty(object, path);
  const effectPoint = /^effects\[[^\]]+\]\.[^.]+\.[xy]$/.test(path)
    ? readProperty(object, path.slice(0, -2))
    : undefined;
  let parent: ObjectValue = object;
  for (const [index, part] of names.slice(0, -1).entries()) {
    let old = parent[part];
    if (
      old === undefined &&
      index === names.length - 2 &&
      native?.component !== undefined &&
      Array.isArray(native.descriptor.default)
    )
      old = structuredClone(native.descriptor.default);
    if (
      old === undefined &&
      index === names.length - 2 &&
      Array.isArray(effectPoint)
    )
      old = structuredClone(effectPoint);
    if (
      Array.isArray(old) &&
      ["masks", "effects", "contents", "stops"].includes(part)
    ) {
      parent = old as unknown as ObjectValue;
      continue;
    }
    if (Array.isArray(old))
      parent[part] = {
        x: old[0],
        y: old[1],
        ...(old.length === 3 ? { z: old[2] } : {}),
      };
    else if (old === undefined) parent[part] = {};
    else if (!asObject(old) || "keys" in (old as ObjectValue))
      throw new BuilderError(
        "comp-builder-property",
        `Cannot split animated property ${part}`,
      );
    parent = parent[part] as ObjectValue;
  }
  parent[names.at(-1)!] = value;
}
