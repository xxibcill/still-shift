import type { Composition } from "./composition.ts";
import type { CompositionDiagnostic } from "./diagnostics.ts";

type Scope = Pick<Composition, "id" | "layers">;
type SourceEdge = { path: string; identity: string };

function nativeSourceEdges(composition: Composition) {
  const scopes: Scope[] = [composition, ...(composition.precomps ?? [])];
  const definitions = new Map(
    (composition.precomps ?? []).map((scope) => [scope.id, scope]),
  );
  function hasNative(id: string, visited = new Set<string>()): boolean {
    if (visited.has(id)) return false;
    visited.add(id);
    return (
      definitions
        .get(id)
        ?.layers.some(
          (layer) =>
            layer.type === "native3d" ||
            (layer.type === "precomp" && hasNative(layer.comp, visited)),
        ) ?? false
    );
  }
  const edges = new Map<string, SourceEdge>();
  const nativeAssets = composition.assets.filter(
    (asset) => asset.type === "native3d",
  );
  const protectedFonts = new Set(
    nativeAssets.flatMap((asset) =>
      asset.textureFont ? [asset.textureFont] : [],
    ),
  );
  for (const [index, asset] of composition.assets.entries())
    if (asset.type === "native3d" || protectedFonts.has(asset.id))
      edges.set(JSON.stringify(["asset", asset.id]), {
        path: `assets[${index}]`,
        identity: JSON.stringify(asset),
      });
  for (const [scopeIndex, scope] of scopes.entries())
    for (const [layerIndex, layer] of scope.layers.entries()) {
      const path =
        scopeIndex === 0
          ? `layers[${layerIndex}]`
          : `precomps[${scopeIndex - 1}].layers[${layerIndex}]`;
      const key = JSON.stringify([
        scopeIndex === 0 ? "root" : "precomp",
        scope.id,
        layer.id,
      ]);
      if (layer.type === "native3d")
        edges.set(`${key}:controller`, {
          path,
          identity: JSON.stringify([
            layer.type,
            layer.asset,
            layer.parent ?? null,
          ]),
        });
      if ("native3D" in layer && layer.native3D)
        edges.set(`${key}:binding`, {
          path: `${path}.native3D.sceneLayer`,
          identity: JSON.stringify(
            layer.native3D.role === "world-graphic"
              ? [
                  layer.native3D.role,
                  layer.native3D.sceneLayer,
                  layer.native3D.part ?? null,
                ]
              : [
                  layer.native3D.role,
                  layer.native3D.sceneLayer,
                  layer.native3D.anchor,
                  layer.native3D.target,
                  layer.native3D.visibilityPolicy,
                  layer.native3D.visibleWhen ?? null,
                ],
          ),
        });
      if (layer.type === "precomp" && hasNative(layer.comp))
        edges.set(`${key}:instance`, {
          path: `${path}.comp`,
          identity: layer.comp,
        });
    }
  return edges;
}

/** Inspector edits preserve the authored physical-source topology before trusted rebinding. */
export function native3DEditDiagnostics(
  base: Composition,
  candidate: Composition,
): CompositionDiagnostic[] {
  const original = nativeSourceEdges(base),
    next = nativeSourceEdges(candidate);
  const diagnostics: CompositionDiagnostic[] = [];
  for (const key of new Set([...original.keys(), ...next.keys()])) {
    const before = original.get(key),
      after = next.get(key);
    if (before?.identity === after?.identity) continue;
    diagnostics.push({
      code: "comp-native3d-topology",
      severity: "error",
      path: (after ?? before)!.path,
      message:
        "An inspector edit cannot change native controllers or their source references",
    });
  }
  return diagnostics;
}
