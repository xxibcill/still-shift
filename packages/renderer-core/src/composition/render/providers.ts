import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { passageError } from "../../passage-diagnostics.ts";
import type { LoadedFont } from "../../prepared-fonts.ts";
import type { ProviderContent } from "./graph.ts";

export type ProviderLayer = Extract<CompositionLayer, { type: "provider" }>;
export type ProviderResources = {
  images: ReadonlyMap<string, CanvasImageSource>;
  fonts: ReadonlyMap<string, LoadedFont>;
};
export type CanvasProviderDrawer = (
  ctx: CanvasRenderingContext2D,
  time: number,
  state?: number,
) => void;
export type CanvasContentProvider = {
  /** Versioned id, exactly as stored in the composition contract. */
  id: string;
  /** Validate and prepare once; the drawer receives layer-local time, including precomp clocks. */
  prepare(
    layer: ProviderLayer,
    resources: ProviderResources,
    path: string,
  ): CanvasProviderDrawer;
};

export function prepareCompositionProviders(
  composition: Composition,
  resources: ProviderResources,
  providers: readonly CanvasContentProvider[],
): (ctx: CanvasRenderingContext2D, content: ProviderContent) => void {
  const registry = new Map<string, CanvasContentProvider>();
  for (const provider of providers) {
    if (registry.has(provider.id))
      passageError(
        "comp-provider-duplicate",
        `Provider ${provider.id} was registered twice`,
        { path: "providers" },
      );
    registry.set(provider.id, provider);
  }
  const drawers = new Map<string, CanvasProviderDrawer>();
  for (const [index, scope] of [
    composition,
    ...(composition.precomps ?? []),
  ].entries()) {
    scope.layers.forEach((layer, i) => {
      if (layer.type !== "provider") return;
      const path = `${index ? `precomps[${index - 1}].` : ""}layers[${i}]`;
      const provider = registry.get(layer.provider);
      if (!provider)
        passageError(
          "comp-provider-unavailable",
          `Provider ${layer.provider} is not registered`,
          { path: `${path}.provider` },
        );
      const declared = new Set(layer.assets ?? []);
      // Limit the provider's resource view to its declared dependencies.
      const available: ProviderResources = {
        images: new Map(
          [...resources.images].filter(([id]) => declared.has(id)),
        ),
        fonts: new Map([...resources.fonts].filter(([id]) => declared.has(id))),
      };
      drawers.set(
        `${index ? `${scope.id}/` : ""}${layer.id}`,
        provider.prepare(layer, available, path),
      );
    });
  }
  return (ctx, content) => {
    const draw = drawers.get(content.key);
    if (!draw)
      passageError(
        "comp-provider-unavailable",
        "Provider layer was not prepared",
        { path: content.key },
      );
    draw(ctx, content.time, content.state);
  };
}
