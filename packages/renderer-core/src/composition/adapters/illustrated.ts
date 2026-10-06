import type { IllustratedScene } from "../../prepared-scene.ts";
import type { Images } from "./illustrated-assets.ts";
import type { CompositionResources } from "../render/renderer.ts";
import { compiledStoryToComposition } from "./story.ts";
import { compiledCommerceToComposition } from "./commerce.ts";
import { compiledCinematicToComposition } from "./cinematic.ts";
import { compiledLegacyToComposition } from "./legacy.ts";
import { prepareComponentTextFits } from "../../component-text-fit.ts";
import { prepareCommerceTextFits } from "../../commerce-layout.ts";
import { validateStoryTextLayout } from "../../story-text-layout.ts";
import { validateTypographySafeArea } from "../../typography-safe-area.ts";
import {
  prepareTypography,
  resolveTypographyNodes,
} from "../../typography-renderer.ts";

/** Family dispatch and font measurement happen once, outside native frame rendering. */
export function prepareIllustratedComposition(
  input: IllustratedScene,
  images: Images,
  context: CanvasRenderingContext2D,
) {
  const fonts = images.fonts ?? new Map();
  const textLayout = { context, fonts };
  const prepared = (() => {
    if (input.schemaVersion === "story-scene-1") {
      if (input.authoringVersion === "1" && !input.typography)
        validateStoryTextLayout(input, fonts);
      const scene = prepareComponentTextFits(
        resolveTypographyNodes(input),
        context,
        fonts,
      );
      const typography = scene.typography
        ? prepareTypography(scene, fonts)
        : undefined;
      if (typography) validateTypographySafeArea(scene, typography);
      return {
        scene,
        typography,
        composition: compiledStoryToComposition(scene),
      };
    }
    if (input.schemaVersion === "commerce-scene-1") {
      const scene = prepareComponentTextFits(
        prepareCommerceTextFits(resolveTypographyNodes(input), context, fonts),
        context,
        fonts,
      );
      return {
        scene,
        typography: scene.typography
          ? prepareTypography(scene, fonts)
          : undefined,
        composition: compiledCommerceToComposition(scene, { textLayout }),
      };
    }
    return {
      scene: input,
      typography: undefined,
      composition:
        input.schemaVersion === "illustrated-scene-2"
          ? compiledCinematicToComposition(input)
          : compiledLegacyToComposition(input),
    };
  })();
  // Styles and animated font axes were verified and loaded by asset preparation.
  // Match variants by their immutable source bytes, preserving provider isolation.
  const providerFonts: NonNullable<CompositionResources["providerFonts"]> =
    new Map(
      [prepared.composition, ...(prepared.composition.precomps ?? [])].flatMap(
        (scope, index) =>
          scope.layers.flatMap((layer) => {
            if (layer.type !== "provider") return [];
            const declared = new Set(layer.assets ?? []);
            const sources = [...declared].flatMap((id) => {
              const bytes = fonts.get(id)?.bytes;
              return bytes ? [bytes] : [];
            });
            return [
              [
                `${index ? `${scope.id}/` : ""}${layer.id}`,
                new Map(
                  [...fonts].filter(
                    ([id, font]) =>
                      declared.has(id) ||
                      (!!font.bytes && sources.includes(font.bytes)),
                  ),
                ),
              ] as const,
            ];
          }),
      ),
    );
  const resources: CompositionResources = {
    ...(images.textProbe ? { textProbe: images.textProbe } : {}),
    images: new Map(
      [...images].map(([id, image]) => [id, images.rasters?.get(id) ?? image]),
    ),
    fonts,
    providerFonts,
  };
  return {
    composition: prepared.composition,
    resources,
    typography: prepared.typography,
    resolvedTextSizes: Object.fromEntries(
      prepared.scene.nodes.flatMap((node) =>
        node.type === "text" ? [[node.id, node.fontSize]] : [],
      ),
    ),
  };
}
