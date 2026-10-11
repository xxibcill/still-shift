import type { NativeFrameSnapshotV3 } from "@still-shift/scene-contract";
import {
  MechanismSceneV3Schema,
  MechanismHashSchema,
  Native3DSourceOverridesV3Schema,
  type Native3DSourceOverridesV3,
} from "@still-shift/scene-contract";
import { prepareMechanismPoseV2 } from "../mechanism/prepare-v2.ts";
import { hashNativeData } from "./canonical-hash.ts";
import { freezeNativeData } from "./prepare.ts";
import { preflightNativePbrResources } from "./pbr-allocations.ts";
import { passageError } from "../passage-diagnostics.ts";
import { native3DOverridesKeyV3 } from "./override-keys.ts";
import { nativePreparationVariantLimit } from "./preparation-limits.ts";
import type {
  PreparedNative3DSceneV3,
  PreparedNative3DVariantV3,
} from "./types-v3.ts";
export async function prepareNative3DSceneV3(
  input: unknown,
  sourceSha256: string,
  options: {
    variants?: readonly Native3DSourceOverridesV3[];
    variantLimit?: number;
  } = {},
): Promise<PreparedNative3DSceneV3> {
  MechanismHashSchema.parse(sourceSha256);
  const source = MechanismSceneV3Schema.parse(input),
    originalGeometrySha256 = await hashNativeData(source.geometry),
    variantLimit = nativePreparationVariantLimit(options.variantLimit);
  if (originalGeometrySha256 !== source.geometrySha256)
    passageError(
      "comp-native3d-checksum",
      "PBR source geometry differs from its declared identity",
      { path: "geometrySha256" },
    );
  const meshDataSha256 = await hashNativeData({
      meshes: source.geometry.meshes,
    }),
    variants: Record<string, PreparedNative3DVariantV3> = Object.create(null),
    variantKeysByOverrides: Record<string, string> = Object.create(null),
    keys = [
      ...new Set([
        "{}",
        ...(options.variants ?? []).map(native3DOverridesKeyV3),
      ]),
    ].sort();
  if (keys.length > 64)
    passageError(
      "comp-native3d-limit",
      "Native PBR requests exceed64 including the base",
      { path: "variants" },
    );
  for (const [index, key] of keys.entries()) {
    const overrides = Native3DSourceOverridesV3Schema.parse(JSON.parse(key));
    for (const [field, entries, inventory] of [
      ["partOverrides", overrides.partOverrides, source.parts],
      [
        "pbrMaterialOverrides",
        overrides.pbrMaterialOverrides,
        source.geometry.materials,
      ],
    ] as const)
      for (const id of Object.keys(entries ?? {}))
        if (!inventory.some((item) => item.id === id))
          passageError(
            "comp-native3d-source",
            `Unknown PBR static override ${id}`,
            { path: `${field}.${id}` },
          );
    const derived = MechanismSceneV3Schema.parse({
      ...source,
      parts: source.parts.map((part) => ({
        ...part,
        ...overrides.partOverrides?.[part.id],
      })),
      geometry: {
        ...source.geometry,
        materials: source.geometry.materials.map((material) => ({
          ...material,
          ...overrides.pbrMaterialOverrides?.[material.id],
        })),
      },
    });
    derived.geometry.meshes = source.geometry.meshes;
    derived.geometrySha256 = await hashNativeData(derived.geometry);
    const effectiveSceneSha256 = await hashNativeData(derived),
      sourceKey = `native3d-source-3:${sourceSha256.slice(7)}:${effectiveSceneSha256.slice(7)}`;
    variantKeysByOverrides[key] = sourceKey;
    if (Object.hasOwn(variants, sourceKey)) continue;
    if (Object.keys(variants).length >= variantLimit)
      passageError(
        "comp-native3d-limit",
        "Native PBR variants exceed their shared catalogue admission",
        { path: `variants.${index}` },
      );
    variants[sourceKey] = freezeNativeData({
      version: "prepared-native3d-variant-3",
      source: derived,
      sourceSha256,
      sourceKey,
      effectiveSceneSha256,
      geometrySha256: derived.geometrySha256,
      originalGeometrySha256,
      meshDataSha256,
      allocation: preflightNativePbrResources(derived.geometry).receipt,
      evaluation: prepareMechanismPoseV2(derived),
    });
  }
  const baseSourceKey = variantKeysByOverrides["{}"]!,
    base = variants[baseSourceKey]!;
  return freezeNativeData({
    ...base,
    version: "prepared-native3d-scene-3",
    source,
    baseSourceKey,
    variants,
    variantKeysByOverrides,
  });
}
export function resolveNative3DVariantV3(
  preparedByAsset:
    | Readonly<Record<string, PreparedNative3DSceneV3>>
    | undefined,
  reference: Pick<
    NativeFrameSnapshotV3,
    | "asset"
    | "controller"
    | "scope"
    | "sourceKey"
    | "sourceSha256"
    | "effectiveSceneSha256"
    | "geometrySha256"
  >,
): PreparedNative3DVariantV3 {
  const location = {
    node: reference.controller,
    path: `${reference.scope}/${reference.controller}.asset`,
  };
  if (!preparedByAsset || !Object.hasOwn(preparedByAsset, reference.asset))
    passageError(
      "comp-native3d-not-ready",
      `Missing prepared native asset ${reference.asset}`,
      location,
    );
  const prepared = preparedByAsset[reference.asset]!;
  if (!Object.hasOwn(prepared.variants, reference.sourceKey))
    passageError(
      "comp-native3d-source",
      "Native effective variant is absent from the prepared revision",
      location,
    );
  const variant = prepared.variants[reference.sourceKey]!;
  if (
    variant.sourceKey !== reference.sourceKey ||
    prepared.sourceSha256 !== reference.sourceSha256 ||
    variant.sourceSha256 !== reference.sourceSha256 ||
    variant.effectiveSceneSha256 !== reference.effectiveSceneSha256 ||
    variant.geometrySha256 !== reference.geometrySha256
  )
    passageError(
      "comp-native3d-checksum",
      "Native prepared identity differs from the frame reference",
      location,
    );
  return variant;
}
