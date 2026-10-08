import { compileFamilyTimeline } from "./timeline.ts";
import type { IllustratedScene } from "../../prepared-scene.ts";
import type { Images } from "./illustrated-assets.ts";
import type { CompositionResources } from "../render/renderer.ts";
import { compiledStoryToComposition } from "./story.ts";
import { compiledCommerceToComposition } from "./commerce.ts";
import { compiledCinematicToComposition } from "./cinematic.ts";
import { compiledLegacyToComposition } from "./legacy.ts";
import {
  legacyResourceAliases,
  legacyTextProbe,
} from "./legacy-compatibility.ts";
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
  const fonts = new Map(images.fonts ?? []);
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
        ...compileFamilyTimeline(scene.frameCount, (window) =>
          compiledStoryToComposition(scene, {}, window),
        ),
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
        ...compileFamilyTimeline(scene.frameCount, (window) =>
          compiledCommerceToComposition(scene, { textLayout }, window),
        ),
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
  const documents =
    "windows" in prepared && prepared.windows
      ? prepared.windows.map((window) => window.composition)
      : [prepared.composition];
  const nativeImages = new Map(
    [...images].map(([id, image]) => [id, images.rasters?.get(id) ?? image]),
  );
  for (const document of documents)
    for (const [native, original] of legacyResourceAliases(document, [
      ...input.assets,
      ...(input.fonts ?? []),
    ])) {
      const image = nativeImages.get(original);
      if (image) nativeImages.set(native, image);
      const font = fonts.get(original);
      if (font) fonts.set(native, font);
    }
  const providerFonts: NonNullable<CompositionResources["providerFonts"]> =
    new Map(
      documents.flatMap((composition) =>
        [composition, ...(composition.precomps ?? [])].flatMap((scope, index) =>
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
      ),
    );
  const textProbe = images.textProbe
    ? input.schemaVersion === "illustrated-scene-1"
      ? legacyTextProbe(prepared.composition, input.nodes, images.textProbe)
      : images.textProbe
    : undefined;
  const resources: CompositionResources = {
    ...(textProbe ? { textProbe } : {}),
    images: nativeImages,
    fonts,
    providerFonts,
  };
  return {
    composition: prepared.composition,
    ...("windows" in prepared ? { windows: prepared.windows } : {}),
    resources,
    typography: prepared.typography,
    resolvedTextSizes: Object.fromEntries(
      prepared.scene.nodes.flatMap((node) =>
        node.type === "text" ? [[node.id, node.fontSize]] : [],
      ),
    ),
  };
}
