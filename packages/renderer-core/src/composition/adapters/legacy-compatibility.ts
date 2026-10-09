import {
  COMPOSITION_LIMITS,
  type Composition,
  type CompositionLayer,
  type CompositionScope,
} from "@still-shift/scene-contract";
import { params } from "./prepared.ts";
import { passageError } from "../../passage-diagnostics.ts";
import type { TextProbe } from "../render/text.ts";

/** Public legacy identifiers were never length-limited; native identifiers remain bounded. */
function nativeIdentifiers(composition: Composition) {
  const ids = new Set([
    ...composition.layers.map((layer) => layer.id),
    ...composition.assets.map((asset) => asset.id),
    ...(composition.signals ?? []).map((signal) => signal.id),
  ]);
  const aliases = new Map<string, string>();
  let index = 0;
  for (const id of ids) {
    if (id.length <= 128) continue;
    let native: string;
    do native = `legacy-identifier-${index++}`;
    while (ids.has(native));
    ids.add(native);
    aliases.set(id, native);
  }
  return aliases;
}

function remapIdentifiers(
  composition: Composition,
  assetIndices: ReadonlyMap<string, number>,
  nodeIndices: ReadonlyMap<string, number>,
) {
  const aliases = nativeIdentifiers(composition);
  if (!aliases.size) return;
  const id = (value: string) => aliases.get(value) ?? value;
  const assetAliases: Record<string, number> = {};
  const layerAliases: Record<string, number> = {};
  for (const layer of composition.layers) {
    const original = layer.id;
    layer.id = id(original);
    const nodeIndex = nodeIndices.get(original);
    if (layer.id !== original && nodeIndex !== undefined)
      layerAliases[layer.id] = nodeIndex;
    if (layer.parent) layer.parent = id(layer.parent);
    if (layer.source && layer.source.id.length > 200)
      layer.source.id = layer.id;
    if (layer.type === "image") {
      layer.sources = structuredClone(layer.sources);
      for (const source of layer.sources) source.asset = id(source.asset);
    }
    if (layer.type === "provider") {
      if (layer.assets) layer.assets = layer.assets.map(id);
      const node = layer.params.node as
        | { id: string; fontAsset?: string }
        | undefined;
      if (node) node.id = layer.id;
      if (node?.fontAsset) node.fontAsset = layer.assets![0]!;
    }
  }
  for (const asset of composition.assets) {
    const original = asset.id;
    asset.id = id(original);
    if (asset.id !== original)
      assetAliases[asset.id] = assetIndices.get(original)!;
  }
  for (const signal of composition.signals ?? []) signal.id = id(signal.id);
  for (const constraint of composition.constraints ?? []) {
    constraint.target = id(constraint.target);
    if (constraint.type === "follow-path") {
      constraint.path = id(constraint.path);
      constraint.progress = id(constraint.progress);
    }
  }
  composition.metadata = params(
    {
      ...composition.metadata,
      legacyAssetAliases: assetAliases,
      legacyLayerAliases: layerAliases,
    },
    "metadata",
  );
}

/** Root source ordinals also identify providers moved into nested legacy scopes. */
export function legacyTextProbe(
  composition: Composition,
  sourceNodes: readonly { id: string }[],
  probe: TextProbe,
): TextProbe {
  const ordinal = sourceNodes.findIndex((node) => node.id === probe.node);
  const aliases = composition.metadata?.legacyLayerAliases;
  const bindings =
    aliases && typeof aliases === "object" && !Array.isArray(aliases)
      ? Object.entries(aliases)
      : [];
  // An unknown authoring target cannot acquire a match through native renaming.
  const native =
    ordinal >= 0
      ? bindings.find(([, index]) => index === ordinal)?.[0]
      : bindings.some(([id]) => id === probe.node)
        ? ""
        : undefined;
  return { ...probe, node: native ?? probe.node };
}

/** Resource aliases retain the actual decoded bytes and loaded font variants. */
export function legacyResourceAliases(
  composition: Composition,
  sourceAssets: readonly {
    id: string;
    path: string;
    sha256: string;
    width?: number;
    height?: number;
    weight?: string;
    style?: string | undefined;
  }[],
) {
  const aliases = composition.metadata?.legacyAssetAliases;
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  return new Map(
    aliases && typeof aliases === "object" && !Array.isArray(aliases)
      ? Object.entries(aliases).map(([native, index]) => {
          const source =
            typeof index === "number" && Number.isInteger(index)
              ? sourceAssets[index]
              : undefined;
          const asset = assets.get(native);
          if (
            !source ||
            !asset ||
            source.path !== asset.path ||
            source.sha256 !== asset.sha256 ||
            (asset.type === "image" &&
              (source.width !== asset.width ||
                source.height !== asset.height)) ||
            (asset.type === "font" &&
              (source.weight !== asset.weight || source.style !== asset.style))
          )
            passageError(
              "comp-asset-type",
              "Legacy resource alias differs from its prepared source asset",
              { path: `assets.${native}` },
            );
          return [native, source.id] as const;
        })
      : [],
  );
}

function pruneUnusedAssets(composition: Composition) {
  if (composition.assets.length <= COMPOSITION_LIMITS.maxAssets) return;
  const used = new Set(
    composition.layers.flatMap((layer) =>
      layer.type === "image"
        ? layer.sources.map((source) => source.asset)
        : layer.type === "provider"
          ? (layer.assets ?? [])
          : [],
    ),
  );
  composition.assets = composition.assets.filter((asset) => used.has(asset.id));
}

/** Collapse preserves direct draws, matrix concatenation, clips and per-child opacity. */
function splitDeepGroups(composition: Composition) {
  const original = composition.layers;
  const byId = new Map(original.map((layer) => [layer.id, layer]));
  const depth = (layer: CompositionLayer): number =>
    layer.parent ? 1 + depth(byId.get(layer.parent)!) : 0;
  if (
    !original.some((layer) => depth(layer) > COMPOSITION_LIMITS.maxParentDepth)
  )
    return;
  const ids = new Set(original.map((layer) => layer.id));
  const unique = (prefix: string) => {
    let id = prefix;
    while (ids.has(id)) id += "-helper";
    ids.add(id);
    return id;
  };
  const owners = new Map<string, CompositionScope>();
  const precomps: NonNullable<Composition["precomps"]> = [];
  const constraints = composition.constraints;
  composition.layers = [];
  delete composition.constraints;
  const visit = (
    layer: CompositionLayer,
    scope: CompositionScope,
    parentDepth: number,
    parent = layer.parent,
  ) => {
    const children = original.filter((child) => child.parent === layer.id);
    if (
      layer.type === "group" &&
      parentDepth === COMPOSITION_LIMITS.maxParentDepth - 1 &&
      children.length
    ) {
      const comp = unique(`legacy-scope-${precomps.length}`);
      const root = unique(`legacy-scope-root-${precomps.length}`);
      const nested = {
        id: comp,
        width: composition.width,
        height: composition.height,
        frameCount: composition.frameCount,
        fps: composition.fps,
        background: null,
        layers: [
          {
            id: root,
            type: "group" as const,
            size: layer.size,
            ...(layer.clip === undefined ? {} : { clip: layer.clip }),
            transform: { anchor: [0, 0] as [number, number] },
          },
        ] as CompositionLayer[],
      };
      precomps.push(nested);
      const host = {
        ...layer,
        ...(parent ? { parent } : {}),
        type: "precomp" as const,
        comp,
        collapseTransforms: true,
      };
      delete (host as { size?: unknown }).size;
      delete host.clip;
      scope.layers.push(host);
      owners.set(layer.id, scope);
      for (const child of children) visit(child, nested, 1, root);
      return;
    }
    scope.layers.push({ ...layer, ...(parent ? { parent } : {}) });
    owners.set(layer.id, scope);
    for (const child of children) visit(child, scope, parentDepth + 1);
  };
  for (const layer of original.filter((layer) => !layer.parent))
    visit(layer, composition, 0);
  for (const constraint of constraints ?? []) {
    const scope = owners.get(constraint.target)!;
    (scope.constraints ??= []).push(constraint);
  }
  composition.precomps = precomps;
}

/** Fit generated legacy data into the existing native contract, without tightening legacy inputs. */
export function fitLegacyComposition(
  composition: Composition,
  sourceNodes: readonly { id: string }[],
): Composition {
  const assetIndices = new Map(
    composition.assets.map((asset, index) => [asset.id, index]),
  );
  const nodeIndices = new Map(
    sourceNodes.map((node, index) => [node.id, index]),
  );
  pruneUnusedAssets(composition);
  remapIdentifiers(composition, assetIndices, nodeIndices);
  splitDeepGroups(composition);
  return composition;
}
