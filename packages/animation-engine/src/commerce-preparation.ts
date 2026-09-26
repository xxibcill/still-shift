import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";
import { AnimationEngineError } from "../../scene-contract/src/errors.ts";
import { CommerceBriefSchema } from "../../scene-contract/src/commerce.ts";
import { buildCommerceScene } from "../../renderer-core/src/commerce-scene.ts";

const fontPath = fileURLToPath(
  new URL(
    "../../../assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
    import.meta.url,
  ),
);
const sha256 = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");

export async function prepareCommerceFile(
  briefPath: string,
  outputPath: string,
) {
  const absoluteBrief = resolve(briefPath),
    absoluteOutput = resolve(outputPath);
  try {
    const brief = CommerceBriefSchema.parse(
      JSON.parse(await readFile(absoluteBrief, "utf8")),
    );
    const productPath = resolve(
      dirname(absoluteBrief),
      brief.product.imagePath,
    );
    const image = await readFile(productPath),
      font = await readFile(fontPath);
    const dimensions = imageSize(image);
    if (!dimensions.width || !dimensions.height)
      throw new Error("Product image has invalid dimensions");
    const backdropPath = brief.floating
      ? resolve(dirname(absoluteBrief), brief.floating.imagePath)
      : undefined;
    const backdropBytes = backdropPath
      ? await readFile(backdropPath)
      : undefined;
    const backdropSize = backdropBytes ? imageSize(backdropBytes) : undefined;
    const scene = buildCommerceScene(brief, {
      ...(backdropBytes && backdropSize && backdropPath
        ? {
            backdrop: {
              id: "backdrop-image",
              path: relative(dirname(absoluteOutput), backdropPath),
              sha256: sha256(backdropBytes),
              width: backdropSize.width,
              height: backdropSize.height,
            },
          }
        : {}),
      product: {
        id: "product-image",
        path: relative(dirname(absoluteOutput), productPath),
        sha256: sha256(image),
        width: dimensions.width,
        height: dimensions.height,
      },
      font: {
        id: "commerce-font",
        path: relative(dirname(absoluteOutput), fontPath),
        sha256: sha256(font),
        weight: brief.artDirection !== "standard" ? "400" : "600",
      },
    });
    await mkdir(dirname(absoluteOutput), { recursive: true });
    await writeFile(absoluteOutput, JSON.stringify(scene, null, 2) + "\n", {
      flag: "wx",
    });
    return {
      status: "prepared" as const,
      scenePath: absoluteOutput,
      selection: scene.metadata.selection,
      width: scene.width,
      height: scene.height,
      frameCount: scene.frameCount,
      fps: scene.fps,
    };
  } catch (error) {
    throw new AnimationEngineError(
      "SCENE_INVALID",
      error instanceof Error ? error.message : String(error),
    );
  }
}
