import {
  compositionEffectDefinition,
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
  return path.replace(
    /^(masks|effects)\[([^\]]+)\]\./,
    (_match, collection: string, id: string) => {
      const values = object[collection] as ObjectValue[];
      const index = values.findIndex((value) => value.id === id);
      return `${collection}[${index}].${collection === "effects" ? "params." : ""}`;
    },
  );
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
  const effect = /^effects\[([^\]]+)\]\.([^.]+)$/.exec(path);
  if (effect) {
    const values = object.effects as ObjectValue[];
    const entry = values.find((value) => value.id === effect[1]);
    return compositionEffectDefinition(String(entry?.effect))?.properties[
      effect[2]!
    ]?.default;
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
  let parent: ObjectValue = object;
  for (const part of names.slice(0, -1)) {
    const old = parent[part];
    if (Array.isArray(old) && ["masks", "effects"].includes(part)) {
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
