import {
  MechanismHashSchema,
  Native3DSourceOverridesSchema,
  Native3DSourceV2Schema,
  NATIVE3D_VARIANT_LIMIT,
} from "@still-shift/scene-contract";
import type {
  Native3DSourceOverrides,
  Native3DSourceV2,
} from "@still-shift/scene-contract";
import { prepareMechanismSceneV2 } from "../mechanism/prepare-v2.ts";
import { mechanismTeachingTopologyDocument } from "../mechanism/teaching-topology.ts";
import { passageError } from "../passage-diagnostics.ts";
import { hashNativeData } from "./canonical-hash.ts";
import { prepareNativeShapeAssociations } from "./shape-associations.ts";
import { freezeNativeData, native3DOverridesKey } from "./prepare.ts";
import type { Native3DPreparationOptions } from "./types.ts";
import type {
  Native3DVariantReferenceV2,
  PreparedNative3DSceneV2,
  PreparedNative3DVariantV2,
} from "./types-v2.ts";

/** The caller verifies original file bytes; this verifies canonical derived data. */
export async function prepareNative3DSceneV2(
  input: Native3DSourceV2,
  sourceSha256: string,
  options: Native3DPreparationOptions = {},
): Promise<PreparedNative3DSceneV2> {
  MechanismHashSchema.parse(sourceSha256);
  const source = Native3DSourceV2Schema.parse(input);
  const originalGeometrySha256 = await hashNativeData(source.geometry);
  if (originalGeometrySha256 !== source.geometrySha256)
    passageError(
      "comp-native3d-checksum",
      "Source geometry differs from its declared canonical hash",
      {
        path: "geometrySha256",
      },
    );
  await verifyTopology(source);
  const meshDataSha256 = await hashNativeData({
    meshes: source.geometry.meshes,
  });
  const requestKeys = [
    ...new Set(["{}", ...(options.variants ?? []).map(native3DOverridesKey)]),
  ].sort();
  if (requestKeys.length > NATIVE3D_VARIANT_LIMIT)
    passageError(
      "comp-native3d-limit",
      "Prepared native requests exceed 64 including the base",
      {
        path: "variants",
      },
    );
  const variants: Record<string, PreparedNative3DVariantV2> =
    Object.create(null);
  const variantKeysByOverrides: Record<string, string> = Object.create(null);
  for (const requestKey of requestKeys) {
    const overrides = Native3DSourceOverridesSchema.parse(
      JSON.parse(requestKey),
    );
    validateOverrideIds(source, overrides);
    const derived = Native3DSourceV2Schema.parse({
      ...source,
      parts: source.parts.map((part) => ({
        ...part,
        ...(overrides.partOverrides?.[part.id] ?? {}),
      })),
      geometry: {
        ...source.geometry,
        materials: source.geometry.materials.map((material) => ({
          ...material,
          ...(overrides.materialOverrides?.[material.id] ?? {}),
        })),
      },
    });
    derived.geometry.meshes = source.geometry.meshes;
    derived.geometrySha256 = await hashNativeData(derived.geometry);
    const effectiveSceneSha256 = await hashNativeData(derived);
    const sourceKey = `native3d-source-1:${sourceSha256.slice(7)}:${effectiveSceneSha256.slice(7)}`;
    variantKeysByOverrides[requestKey] = sourceKey;
    if (Object.hasOwn(variants, sourceKey)) continue;
    // Static edits must still match the declared neutral shape and rigid seats.
    const evaluation = prepareMechanismSceneV2(derived);
    variants[sourceKey] = freezeNativeData({
      version: "prepared-native3d-variant-2",
      sourceKey,
      sourceSha256,
      originalGeometrySha256,
      effectiveSceneSha256,
      geometrySha256: derived.geometrySha256,
      meshDataSha256,
      source: derived,
      evaluation,
      shapeAssociations: await prepareNativeShapeAssociations(derived),
    });
  }
  return freezeNativeData({
    version: "prepared-native3d-scene-2",
    sourceSha256,
    source,
    baseSourceKey: variantKeysByOverrides["{}"]!,
    variants: Object.fromEntries(
      Object.entries(variants).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
    variantKeysByOverrides: Object.fromEntries(
      Object.entries(variantKeysByOverrides).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    ),
  });
}

async function verifyTopology(source: Native3DSourceV2): Promise<void> {
  for (const [index, shape] of source.teachingShapes.entries()) {
    const mesh = source.geometry.meshes.find(
      (candidate) => candidate.id === shape.mesh,
    )!;
    const actual = await hashNativeData(
      mechanismTeachingTopologyDocument(shape, mesh),
    );
    if (actual !== shape.topologySha256)
      passageError(
        "comp-native3d-checksum",
        `Teaching topology differs from its declared hash: ${shape.id}`,
        {
          path: `teachingShapes.${index}.topologySha256`,
        },
      );
  }
}

function validateOverrideIds(
  source: Native3DSourceV2,
  overrides: Native3DSourceOverrides,
): void {
  for (const id of Object.keys(overrides.partOverrides ?? {}))
    if (!source.parts.some((part) => part.id === id))
      passageError("comp-native3d-source", `Unknown part override ${id}`, {
        path: `partOverrides.${id}`,
      });
  for (const id of Object.keys(overrides.materialOverrides ?? {}))
    if (!source.geometry.materials.some((material) => material.id === id))
      passageError(
        "comp-native3d-material",
        `Unknown material override ${id}`,
        { path: `materialOverrides.${id}` },
      );
}

/** Exact prepared association. No base fallback, hashing or preparation at sample time. */
export function resolveNative3DVariantV2(
  preparedByAsset:
    | Readonly<Record<string, PreparedNative3DSceneV2>>
    | undefined,
  reference: Native3DVariantReferenceV2,
): PreparedNative3DVariantV2 {
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
