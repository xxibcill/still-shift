import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { passageError } from "../../passage-diagnostics.ts";
import type { LoadedFont } from "../../prepared-fonts.ts";
import type { ProviderContent } from "./graph.ts";
import type { Bounds } from "../evaluate/types.ts";

export type ProviderLayer = Extract<CompositionLayer, { type: "provider" }>;
export type ProviderResources = {
  images: ReadonlyMap<string, CanvasImageSource>;
  fonts: ReadonlyMap<string, LoadedFont>;
  providerFonts?: ReadonlyMap<string, ReadonlyMap<string, LoadedFont>>;
};
type DrawProvider = (
  ctx: CanvasRenderingContext2D,
  time: number,
  state?: number,
  sourceTime?: number,
) => void;
export type CanvasProviderDrawer = DrawProvider & {
  /** Equal keys promise identical local pixels, including every clock-dependent value. */
  visualKey?: (time: number, state?: number, sourceTime?: number) => string;
  /** Conservative local painted bounds across all states and clocks. */
  bounds?: Bounds;
};
export function preparedProvider(
  draw: DrawProvider,
  metadata: Pick<CanvasProviderDrawer, "visualKey" | "bounds">,
): CanvasProviderDrawer {
  return Object.assign(draw, metadata);
}
export type CanvasContentProvider = {
  /** Versioned id, exactly as stored in the composition contract. */
  id: string;
  /** Prepare style/axis variants from this layer's verified, declared fonts only. */
  loadFonts?(
    layer: ProviderLayer,
    fonts: Map<string, LoadedFont>,
    path: string,
  ): Promise<void>;
  /** Validate and prepare once; the drawer receives layer-local time, including precomp clocks. */
  prepare(
    layer: ProviderLayer,
    resources: ProviderResources,
    path: string,
  ): CanvasProviderDrawer;
};

/** Each provider receives an isolated font map; variants never leak into other layers. */
export async function loadProviderFonts(
  composition: Composition,
  fonts: ReadonlyMap<string, LoadedFont>,
  providers: readonly CanvasContentProvider[],
) {
  const prepared = new Map<string, Map<string, LoadedFont>>();
  for (const [index, scope] of [
    composition,
    ...(composition.precomps ?? []),
  ].entries()) {
    for (const [i, layer] of scope.layers.entries()) {
      if (layer.type !== "provider") continue;
      const provider = providers.find(
        (provider) => provider.id === layer.provider,
      );
      if (!provider?.loadFonts) continue;
      const declared = new Set(layer.assets ?? []);
      const scoped = new Map([...fonts].filter(([id]) => declared.has(id)));
      const path = `${index ? `precomps[${index - 1}].` : ""}layers[${i}]`;
      await provider.loadFonts(layer, scoped, path);
      prepared.set(`${index ? `${scope.id}/` : ""}${layer.id}`, scoped);
    }
  }
  return prepared;
}

export function prepareCompositionProviders(
  composition: Composition,
  resources: ProviderResources,
  providers: readonly CanvasContentProvider[],
) {
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
      const key = `${index ? `${scope.id}/` : ""}${layer.id}`;
      // Limit the provider's resource view to its declared dependencies.
      const available: ProviderResources = {
        images: new Map(
          [...resources.images].filter(([id]) => declared.has(id)),
        ),
        fonts:
          resources.providerFonts?.get(key) ??
          new Map([...resources.fonts].filter(([id]) => declared.has(id))),
      };
      drawers.set(key, provider.prepare(layer, available, path));
    });
  }
  const draw = (ctx: CanvasRenderingContext2D, content: ProviderContent) => {
    const draw = drawers.get(content.key);
    if (!draw)
      passageError(
        "comp-provider-unavailable",
        "Provider layer was not prepared",
        { path: content.key },
      );
    draw(ctx, content.time, content.state, content.sourceTime);
  };
  return Object.assign(draw, {
    contentKey(content: ProviderContent): string | undefined {
      const key = drawers.get(content.key)?.visualKey;
      if (!key) return undefined;
      return JSON.stringify([
        key(content.time, content.state, content.sourceTime),
        content.stateFrom === undefined
          ? null
          : key(content.time, content.stateFrom, content.sourceTime),
      ]);
    },
    contentBounds(content: ProviderContent): Bounds | undefined {
      const rect = content.layer.bounds;
      return rect
        ? { left: rect[0], top: rect[1], right: rect[2], bottom: rect[3] }
        : drawers.get(content.key)?.bounds;
    },
  });
}
