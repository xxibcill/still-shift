import {
  createRenderCanvas,
  readRenderImageData,
} from "../../managed-memory-context.ts";
import type { IllustratedScene } from "../../prepared-scene.ts";
import type { TextLayout } from "../../text-layout.ts";
import type { PreparedTypography } from "../../typography-renderer.ts";
import { loadPreparedFonts, type LoadedFont } from "../../prepared-fonts.ts";
import { inspectForegroundReveal } from "../../reveal-validation.ts";
import { validateStoryCameraAlphaCoverage } from "../../story-camera.ts";
import { loadTextAnimationFonts } from "../../typography-axes.ts";
import { sha256Hex } from "../../browser-checksum.ts";

export type Images = Map<string, HTMLImageElement> & {
  revealValidation?: ReturnType<typeof inspectForegroundReveal>;
  fonts?: Map<string, LoadedFont>;
  textLayouts?: Map<string, Map<string, TextLayout>>;
  typography?: PreparedTypography;
  rasters?: Map<string, HTMLCanvasElement>;
  textProbe?: {
    node: string;
    mode: "ink-only" | "container-only";
  };
};
export async function loadIllustratedImages(
  scene: IllustratedScene,
  assetUrl: (id: string) => string,
) {
  const entries = await Promise.all(
    scene.assets.map(async (asset) => {
      const image = new Image();
      let localUrl: string | undefined;
      if (
        scene.schemaVersion === "story-scene-1" &&
        scene.authoringVersion === "1"
      ) {
        const response = await fetch(assetUrl(asset.id));
        if (!response.ok) throw new Error("Asset unavailable: " + asset.id);
        const bytes = await response.arrayBuffer();
        const digest = await sha256Hex(bytes);
        if ("sha256:" + digest !== asset.sha256)
          throw new Error("Asset checksum differs: " + asset.id);
        localUrl = URL.createObjectURL(
          new Blob([bytes], {
            type:
              response.headers.get("Content-Type") ??
              "application/octet-stream",
          }),
        );
      }
      image.src = localUrl ?? assetUrl(asset.id);
      try {
        await image.decode();
      } finally {
        if (localUrl) URL.revokeObjectURL(localUrl);
      }
      if (
        image.naturalWidth !== asset.width ||
        image.naturalHeight !== asset.height
      )
        throw new Error(`Dimensions differ for ${asset.id}`);
      return [asset.id, image] as const;
    }),
  );
  const images: Images = new Map(entries);
  if (scene.schemaVersion === "story-scene-1" && scene.camera?.cover?.length) {
    validateStoryCameraAlphaCoverage(scene, (id) => {
      const image = images.get(id)!;
      const probe = createRenderCanvas();
      probe.width = image.naturalWidth;
      probe.height = image.naturalHeight;
      const context = probe.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      return readRenderImageData(context, 0, 0, probe.width, probe.height);
    });
  }
  images.fonts = await loadPreparedFonts(scene, assetUrl);
  if (
    (scene.schemaVersion === "story-scene-1" ||
      scene.schemaVersion === "commerce-scene-1") &&
    scene.typography
  )
    await loadTextAnimationFonts(scene, images.fonts);
  if (scene.schemaVersion === "story-scene-1" && scene.motionGrammar === "v2") {
    // SVG rasterization can depend on the active clip. Cache the complete image
    // once so adjacent assembly strips share exactly the same deposited pixels.
    images.rasters = new Map(
      entries.map(([id, image]) => {
        const raster = createRenderCanvas();
        raster.width = image.naturalWidth;
        raster.height = image.naturalHeight;
        raster.getContext("2d")!.drawImage(image, 0, 0);
        return [id, raster];
      }),
    );
  }
  if (scene.schemaVersion === "illustrated-scene-2") {
    const node = scene.nodes.find(
      (item) => item.id === scene.recipe.background,
    )!;
    const bounds = scene.layers.find(
      (item) => item.node === node.id,
    )!.paintedBounds!;
    const source = node.states[0]!;
    const image = images.get(source.asset)!;
    const [sx, sy, sw, sh] = source.crop ?? [
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
    ];
    const left = Math.floor(sx + (bounds[0] / node.width) * sw);
    const top = Math.floor(sy + (bounds[1] / node.height) * sh);
    const right = Math.ceil(sx + ((bounds[0] + bounds[2]) / node.width) * sw);
    const bottom = Math.ceil(sy + ((bounds[1] + bounds[3]) / node.height) * sh);
    const probe = createRenderCanvas();
    probe.width = image.naturalWidth;
    probe.height = image.naturalHeight;
    const context = probe.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const pixels = readRenderImageData(
      context,
      left,
      top,
      right - left,
      bottom - top,
    ).data;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i]! < 254)
        throw new Error(
          "Declared painted background coverage contains transparent pixels",
        );
  }
  if (
    scene.schemaVersion === "illustrated-scene-2" &&
    scene.recipe.preset === "foreground_reveal"
  ) {
    const alphaImages = new Map(
      entries.map(([id, image]) => {
        const probe = createRenderCanvas();
        probe.width = image.naturalWidth;
        probe.height = image.naturalHeight;
        const ctx = probe.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0);
        return [
          id,
          readRenderImageData(ctx, 0, 0, probe.width, probe.height),
        ] as const;
      }),
    );
    images.revealValidation = inspectForegroundReveal(scene, alphaImages);
  }
  return images;
}
