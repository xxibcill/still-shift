import type {
  Composition,
  Native3DSourceVersions,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../renderer-core/src/mechanism/canonical.ts";
/** Walk already schema-validated source data. No geometry copies or JSON text.
 * Use the ingestion slot/header policy, including schema-filled defaults.
 */
export function nativeSourceDataCapacity(
  value: unknown,
  omitted?: object,
): number {
  if (value === omitted && omitted !== undefined) return 0;
  if (typeof value === "string") return 80 + value.length * 2;
  if (value === null || typeof value !== "object") return 16;
  if (Array.isArray(value)) {
    let bytes = 80;
    for (const item of value) bytes += nativeSourceDataCapacity(item, omitted);
    return bytes;
  }
  let bytes = 208;
  for (const key in value)
    if (Object.hasOwn(value, key))
      bytes +=
        144 +
        key.length * 2 +
        nativeSourceDataCapacity(
          (value as Record<string, unknown>)[key],
          omitted,
        );
  return bytes;
}
export function nativePreparationCapacity(
  composition: Composition,
  entries: Readonly<Record<string, { source: Native3DSourceVersions }>>,
) {
  let bytes = 65536;
  for (const [asset, { source }] of Object.entries(entries)) {
    const keys = new Set<string>(["{}"]);
    for (const scope of [composition, ...(composition.precomps ?? [])])
      for (const layer of scope.layers) {
        if (layer.type !== "native3d" || layer.asset !== asset) continue;
        const overrides: Record<string, unknown> = {};
        for (const field of [
          "partOverrides",
          "materialOverrides",
          "pbrMaterialOverrides",
        ] as const) {
          const values = Object.entries(layer[field] ?? {}).filter(
            ([, value]) => Object.keys(value).length > 0,
          );
          if (values.length) overrides[field] = Object.fromEntries(values);
        }
        keys.add(canonicalMechanismJson(overrides));
      }
    const tree = nativeSourceDataCapacity(source);
    // Source2 pose preparation retains its own fully parsed solid geometry.
    // Source1/3 variants share validated static meshes; their pose metadata stays
    // separate. Eight full trees cover transport/catalogue/schema/hash staging.
    const variant = nativeSourceDataCapacity(
      source,
      source.schemaVersion === "mechanism-scene-2"
        ? undefined
        : source.geometry.meshes,
    );
    bytes += tree * 8 + variant * 4 * keys.size;
  }
  return bytes;
}
