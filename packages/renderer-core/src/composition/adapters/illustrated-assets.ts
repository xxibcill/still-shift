import {
  createRenderBlob,
  releaseRenderBlob,
  decodeRenderImage,
  mapRenderResources,
  prepareRenderResources,
  readRenderAssetBody,
} from "../../managed-resources.ts";
import {
  createRenderCanvas,
  readRenderImageData,
  releaseRenderCanvas,
  releaseRenderPixels,
  renderMemory,
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
  return prepareRenderResources(async () => {
    const entries = await mapRenderResources(scene.assets, async (asset) => {
      const verified =
        scene.schemaVersion === "story-scene-1" &&
        scene.authoringVersion === "1";
      let localUrl: string | undefined,
        blob: Blob | undefined,
        bytes: ArrayBuffer | undefined;
      try {
        if (verified || renderMemory()) {
          const response = await fetch(assetUrl(asset.id));
          if (!response.ok) throw new Error("Asset unavailable: " + asset.id);
          bytes = await readRenderAssetBody(response);
          if (verified && "sha256:" + (await sha256Hex(bytes)) !== asset.sha256)
            throw new Error("Asset checksum differs: " + asset.id);
          blob = createRenderBlob(
            bytes,
            response.headers.get("Content-Type") ?? "application/octet-stream",
          );
          localUrl = URL.createObjectURL(blob);
        }
        const image = await decodeRenderImage(
          localUrl ?? assetUrl(asset.id),
          asset.width,
          asset.height,
        );
        if (
          image.naturalWidth !== asset.width ||
          image.naturalHeight !== asset.height
        )
          throw new Error(`Dimensions differ for ${asset.id}`);
        return [asset.id, image] as const;
      } finally {
        if (localUrl) URL.revokeObjectURL(localUrl);
        if (blob) releaseRenderBlob(blob);
        releaseRenderPixels(bytes);
      }
    });
    const images: Images = new Map(entries);
    if (
      scene.schemaVersion === "story-scene-1" &&
      scene.camera?.cover?.length
    ) {
      const probes: ImageData[] = [];
      try {
        validateStoryCameraAlphaCoverage(scene, (id) => {
          const pixels = imagePixels(images.get(id)!);
          probes.push(pixels);
          return pixels;
        });
      } finally {
        for (const pixels of probes) releaseRenderPixels(pixels.data);
      }
    }
    images.fonts = await loadPreparedFonts(scene, assetUrl);
    if (
      (scene.schemaVersion === "story-scene-1" ||
        scene.schemaVersion === "commerce-scene-1") &&
      scene.typography
    )
      await loadTextAnimationFonts(scene, images.fonts);
    if (
      scene.schemaVersion === "story-scene-1" &&
      scene.motionGrammar === "v2"
    ) {
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
      const bottom = Math.ceil(
        sy + ((bounds[1] + bounds[3]) / node.height) * sh,
      );
      const pixels = imagePixels(image, [
        left,
        top,
        right - left,
        bottom - top,
      ]).data;
      try {
        for (let i = 3; i < pixels.length; i += 4)
          if (pixels[i]! < 254)
            throw new Error(
              "Declared painted background coverage contains transparent pixels",
            );
      } finally {
        releaseRenderPixels(pixels);
      }
    }
    if (
      scene.schemaVersion === "illustrated-scene-2" &&
      scene.recipe.preset === "foreground_reveal"
    ) {
      const alphaImages = new Map(
        entries.map(([id, image]) => [id, imagePixels(image)]),
      );
      try {
        images.revealValidation = inspectForegroundReveal(scene, alphaImages);
      } finally {
        for (const pixels of alphaImages.values())
          releaseRenderPixels(pixels.data);
      }
    }
    return images;
  });
}

/** Coverage probes consume the original native readback, then release their temporary backing. */
function imagePixels(
  image: HTMLImageElement,
  rect?: readonly [number, number, number, number],
): ImageData {
  const canvas = createRenderCanvas();
  try {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const [x, y, width, height] = rect ?? [0, 0, canvas.width, canvas.height];
    return readRenderImageData(context, x, y, width, height);
  } finally {
    releaseRenderCanvas(canvas);
  }
}
