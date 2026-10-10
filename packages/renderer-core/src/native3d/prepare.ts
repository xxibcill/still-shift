import {
  Native3DSourceSchema,
  Native3DSourceOverridesSchema,
  MechanismHashSchema,
  NATIVE3D_VARIANT_LIMIT,
  CompositionPreparedNative3DSchema,
} from "@still-shift/scene-contract";
import type {
  Native3DSource,
  Native3DSourceOverrides,
  Composition,
  CompositionPreparedNative3D,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../mechanism/canonical.ts";
import { matrixFromTransform } from "../mechanism/matrix.ts";
import { passageError, PassageError } from "../passage-diagnostics.ts";
import type {
  Native3DPreparationOptions,
  Native3DVariantReference,
  PreparedNative3DScene,
  PreparedNative3DVariant,
} from "./types.ts";

export function freezeNativeData<T>(root: T): T {
  const pending: object[] =
    root !== null && typeof root === "object" ? [root] : [];
  const visited = new WeakSet<object>();
  while (pending.length) {
    const value = pending.pop()!;
    if (visited.has(value)) continue;
    visited.add(value);
    for (const child of Object.values(value))
      if (child !== null && typeof child === "object") pending.push(child);
    Object.freeze(value);
  }
  return root;
}

/** Canonical static requests; frame camera/seed/control state is deliberately absent. */
export function native3DOverridesKey(
  input: Native3DSourceOverrides = {},
): string {
  const parsed = Native3DSourceOverridesSchema.parse(input);
  const normalized: Native3DSourceOverrides = {};
  for (const field of ["partOverrides", "materialOverrides"] as const) {
    const entries = Object.entries(parsed[field] ?? {})
      .filter(([, value]) => Object.keys(value).length > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (entries.length)
      Object.assign(normalized, { [field]: Object.fromEntries(entries) });
  }
  return canonicalMechanismJson(normalized);
}

async function hashData(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalMechanismJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function prepareValidated(source: Native3DSource) {
  const parts = new Map(source.parts.map((part) => [part.id, part]));
  const orderedPartIds: string[] = [],
    visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    const part = parts.get(id)!;
    if (part.parent !== undefined) visit(part.parent);
    visited.add(id);
    orderedPartIds.push(id);
  };
  source.parts.forEach((part) => visit(part.id));
  const fields = {
    scene: source,
    orderedPartIds,
    baseLocalMatrices: Object.fromEntries(
      source.parts.map((part) => [
        part.id,
        matrixFromTransform(part.transform),
      ]),
    ),
  };
  return source.schemaVersion === "mechanism-scene-1"
    ? {
        ...fields,
        scene: source,
        version: "prepared-mechanism-scene-1" as const,
      }
    : { ...fields, scene: source, version: "prepared-solid-scene-1" as const };
}

/** All variants are validated and hashed before publishing one immutable catalogue. */
export async function prepareNative3DScene(
  input: Native3DSource,
  sourceSha256: string,
  options: Native3DPreparationOptions = {},
): Promise<PreparedNative3DScene> {
  MechanismHashSchema.parse(sourceSha256);
  const source = Native3DSourceSchema.parse(input);
  const originalGeometrySha256 = await hashData(source.geometry);
  if (originalGeometrySha256 !== source.geometrySha256)
    passageError(
      "comp-native3d-checksum",
      "Source geometry differs from its declared canonical hash",
      { path: "geometrySha256" },
    );
  const meshDataSha256 = await hashData({ meshes: source.geometry.meshes });
  const requestKeys = [
    ...new Set(["{}", ...(options.variants ?? []).map(native3DOverridesKey)]),
  ].sort();
  const variants: Record<string, PreparedNative3DVariant> = Object.create(null);
  const variantKeysByOverrides: Record<string, string> = Object.create(null);
  for (const requestKey of requestKeys) {
    const overrides = Native3DSourceOverridesSchema.parse(
      JSON.parse(requestKey),
    );
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
    const derived = Native3DSourceSchema.parse({
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
    // Validation already inspected the full derived data; mesh topology is immutable.
    derived.geometry.meshes = source.geometry.meshes;
    derived.geometrySha256 = await hashData(derived.geometry);
    const effectiveSceneSha256 = await hashData(derived);
    const sourceKey = `native3d-source-1:${sourceSha256.slice(7)}:${effectiveSceneSha256.slice(7)}`;
    variantKeysByOverrides[requestKey] = sourceKey;
    if (Object.hasOwn(variants, sourceKey)) continue;
    if (Object.keys(variants).length >= NATIVE3D_VARIANT_LIMIT)
      passageError(
        "comp-native3d-limit",
        "Prepared native variants exceed 64 including the base",
        { path: `variants.${requestKeys.indexOf(requestKey)}` },
      );
    variants[sourceKey] = freezeNativeData({
      version: "prepared-native3d-variant-1",
      sourceKey,
      sourceSha256,
      originalGeometrySha256,
      effectiveSceneSha256,
      geometrySha256: derived.geometrySha256,
      meshDataSha256,
      source: derived,
      evaluation: prepareValidated(derived),
    });
  }
  return freezeNativeData({
    version: "prepared-native3d-scene-1",
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

/** O(1) pure lookup; never falls back to base data or hashes geometry while sampling. */
export function resolveNative3DVariant(
  preparedByAsset: Readonly<Record<string, PreparedNative3DScene>> | undefined,
  reference: Native3DVariantReference,
): PreparedNative3DVariant {
  const location = {
    node: reference.controller,
    path: `${reference.scope}/${reference.controller}.asset`,
  };
  if (!preparedByAsset)
    passageError(
      "comp-native3d-not-ready",
      "Native source preparation is required",
      location,
    );
  if (!Object.hasOwn(preparedByAsset, reference.asset))
    passageError(
      "comp-native3d-source",
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

/** Data-only preparation after the caller has verified each original file's raw bytes. */
export async function prepareCompositionNative3D(
  composition: Composition,
  input: CompositionPreparedNative3D,
): Promise<Readonly<Record<string, PreparedNative3DScene>>> {
  const transport = CompositionPreparedNative3DSchema.parse(input);
  const assets = composition.assets.filter(
    (asset) => asset.type === "native3d",
  );
  for (const id of Object.keys(transport.assets))
    if (!assets.some((asset) => asset.id === id))
      passageError(
        "comp-native3d-source",
        `Undeclared native transport asset ${id}`,
        { path: `preparedNative3D.assets.${id}` },
      );
  const result: Record<string, PreparedNative3DScene> = Object.create(null);
  let count = 0;
  for (const asset of assets) {
    const assetPath = `assets.${composition.assets.indexOf(asset)}`;
    if (!Object.hasOwn(transport.assets, asset.id))
      passageError(
        "comp-native3d-not-ready",
        `Missing prepared native source ${asset.id}`,
        { path: assetPath },
      );
    const data = transport.assets[asset.id]!;
    if (data.sourceSha256 !== asset.sha256)
      passageError(
        "comp-native3d-checksum",
        "Native transport raw hash differs from its authored asset",
        { path: assetPath + ".sha256" },
      );
    if (data.source.schemaVersion !== asset.format)
      passageError(
        "comp-native3d-source",
        "Native source format differs from its authored asset",
        { path: assetPath + ".format" },
      );
    if (
      data.source.geometry.materials.some(
        (material) => material.texture?.kind === "tape-graduations",
      ) &&
      composition.assets.find((font) => font.id === asset.textureFont)?.type !==
        "font"
    )
      passageError(
        "comp-native3d-source",
        "Tape graduations require the native asset's pinned texture font",
        { path: assetPath + ".textureFont" },
      );
    const requests = [composition, ...(composition.precomps ?? [])].flatMap(
      (scope) =>
        scope.layers.flatMap((layer, index) => {
          if (layer.type !== "native3d" || layer.asset !== asset.id) return [];
          const prefix =
            scope === composition
              ? ""
              : `precomps.${composition.precomps!.indexOf(scope)}.`;
          return [
            {
              overrides: {
                ...(layer.partOverrides
                  ? { partOverrides: layer.partOverrides }
                  : {}),
                ...(layer.materialOverrides
                  ? { materialOverrides: layer.materialOverrides }
                  : {}),
              },
              path: `${prefix}layers.${index}`,
              controller: layer.id,
            },
          ];
        }),
    );
    for (const scope of [composition, ...(composition.precomps ?? [])]) {
      const prefix =
        scope === composition
          ? ""
          : `precomps.${composition.precomps!.indexOf(scope)}.`;
      scope.layers.forEach((layer, index) => {
        const path = `${prefix}layers.${index}`;
        if (layer.type === "native3d" && layer.asset === asset.id) {
          for (const id of layer.hiddenParts ?? [])
            if (!data.source.parts.some((part) => part.id === id))
              passageError(
                "comp-native3d-source",
                `Unknown hidden physical part ${id}`,
                { node: layer.id, path: path + ".hiddenParts" },
              );
          const rigIds =
            data.source.schemaVersion === "mechanism-scene-1"
              ? new Set(data.source.rigs.map((rig) => rig.id))
              : new Set<string>();
          for (const id of Object.keys(layer.controls ?? {}))
            if (!rigIds.has(id))
              passageError(
                "comp-native3d-source",
                `Unknown physical rig control ${id}`,
                { node: layer.id, path: path + ".controls." + id },
              );
        }
        const binding = layer.native3D;
        if (!binding) return;
        const controller = scope.layers.find(
          (candidate) => candidate.id === binding.sceneLayer,
        );
        if (controller?.type !== "native3d" || controller.asset !== asset.id)
          return;
        if (
          binding.role === "screen-anchor" &&
          !data.source.anchors.some((anchor) => anchor.id === binding.anchor)
        )
          passageError(
            "comp-native3d-binding",
            `Unknown physical anchor ${binding.anchor}`,
            { node: layer.id, path: path + ".native3D.anchor" },
          );
        if (
          binding.role === "world-graphic" &&
          binding.part !== undefined &&
          !data.source.parts.some((part) => part.id === binding.part)
        )
          passageError(
            "comp-native3d-binding",
            `Unknown physical world part ${binding.part}`,
            { node: layer.id, path: path + ".native3D.part" },
          );
      });
    }
    let prepared: PreparedNative3DScene;
    try {
      prepared = await prepareNative3DScene(data.source, data.sourceSha256, {
        variants: requests.map((request) => request.overrides),
      });
    } catch (error) {
      if (error instanceof PassageError) {
        const introducing = requests.find((request) =>
          error.diagnostics.some((diagnostic) =>
            diagnostic.path?.startsWith("partOverrides.")
              ? Object.hasOwn(
                  request.overrides.partOverrides ?? {},
                  diagnostic.path.split(".")[1]!,
                )
              : diagnostic.path?.startsWith("materialOverrides.")
                ? Object.hasOwn(
                    request.overrides.materialOverrides ?? {},
                    diagnostic.path.split(".")[1]!,
                  )
                : false,
          ),
        );
        throw new PassageError(
          error.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            ...(introducing ? { node: introducing.controller } : {}),
            path: `${introducing?.path ?? assetPath}.${diagnostic.path ?? "source"}`,
          })),
        );
      }
      throw error;
    }
    const seen = new Set([prepared.baseSourceKey]);
    if (++count > NATIVE3D_VARIANT_LIMIT)
      passageError(
        "comp-native3d-limit",
        "Composition-wide native variant budget exceeds 64 including asset bases",
        { path: assetPath },
      );
    for (const request of requests) {
      const key =
        prepared.variantKeysByOverrides[
          native3DOverridesKey(request.overrides)
        ]!;
      if (seen.has(key)) continue;
      seen.add(key);
      if (++count > NATIVE3D_VARIANT_LIMIT)
        passageError(
          "comp-native3d-limit",
          "Composition-wide native variant budget exceeds 64 including asset bases",
          { node: request.controller, path: request.path + ".partOverrides" },
        );
    }
    result[asset.id] = prepared;
  }
  return freezeNativeData(
    Object.fromEntries(
      Object.entries(result).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  );
}
