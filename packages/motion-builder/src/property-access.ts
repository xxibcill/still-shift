import {
  compositionEffectDefinition,
  effectPointIndex,
  splitEffectCurve,
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
  const emitted = path.replace(
    /^(masks|effects)\[([^\]]+)\]\./,
    (_match, collection: string, id: string) => {
      const values = object[collection] as ObjectValue[];
      const index = values.findIndex((value) => value.id === id);
      return `${collection}[${index}].${collection === "effects" ? "params." : ""}`;
    },
  );
  const effect = effectProperty(object, path);
  return (effect?.descriptor.type === "curve" ||
    effect?.descriptor.type === "points") &&
    effect.point !== undefined
    ? emitted.replace(/\[p\d+\]/, `[${effect.point}]`)
    : emitted;
}

function nativeProperty(object: ObjectValue, path: string) {
  if (!path.startsWith("contents[") || !Array.isArray(object.contents))
    return undefined;
  const parsed = parsePropertyPath(`node.${path}`);
  return isPropertyPathError(parsed)
    ? undefined
    : locateShapeProperty(object.contents as ShapeContent[], parsed.segments);
}
function effectProperty(object: ObjectValue, path: string) {
  const match =
    /^effects\[([^\]]+)\]\.([a-zA-Z][\w-]*)(?:\[(p\d+)\])?(?:\.([xy]))?$/.exec(
      path,
    );
  if (!match) return undefined;
  const entry = (object.effects as ObjectValue[]).find(
    (effect) => effect.id === match[1],
  );
  const descriptor = compositionEffectDefinition(String(entry?.effect))
    ?.properties[match[2]!];
  return entry && descriptor
    ? {
        entry,
        descriptor,
        name: match[2]!,
        point: effectPointIndex(match[3]),
        axis: match[4],
      }
    : undefined;
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
  const effect = effectProperty(object, path);
  if (effect) {
    let fallback: unknown = effect.descriptor.default;
    if (
      (effect.descriptor.type === "curve" ||
        effect.descriptor.type === "points") &&
      effect.point !== undefined
    ) {
      const raw = asObject(effect.entry.params)?.[effect.name];
      fallback = splitEffectCurve(raw, effect.descriptor.default)[effect.point];
    }
    return effect.axis && Array.isArray(fallback)
      ? fallback[effect.axis === "x" ? 0 : 1]
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
  const effect = effectProperty(object, path);
  if (
    (effect?.descriptor.type === "curve" ||
      effect?.descriptor.type === "points") &&
    effect.point !== undefined
  ) {
    const params = asObject(effect.entry.params) ?? {};
    params[effect.name] = splitEffectCurve(
      params[effect.name],
      effect.descriptor.default,
    );
    effect.entry.params = params;
  }
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
      (["masks", "effects", "contents", "stops"].includes(part) ||
        ((effect?.descriptor.type === "curve" ||
          effect?.descriptor.type === "points") &&
          effect.point !== undefined &&
          part === effect.name))
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
