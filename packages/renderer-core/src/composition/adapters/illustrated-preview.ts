import type { IllustratedScene } from "../../prepared-scene.ts";
import { createCompositionPreview } from "../render/renderer.ts";
import { prepareIllustratedComposition } from "./illustrated.ts";
import type { Images } from "./illustrated-assets.ts";

/** Preparation once, then the shared native frame path; retains the authoring inspector metadata. */
export function createPreparedIllustratedPreview(
  canvas: HTMLCanvasElement,
  scene: IllustratedScene,
  images: Images,
) {
  canvas.width = scene.width;
  canvas.height = scene.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw Error("Canvas 2D is unavailable");
  const prepared = prepareIllustratedComposition(scene, images, context),
    preview = createCompositionPreview(
      canvas,
      prepared.composition,
      prepared.resources,
      { backend: "canvas2d" },
    );
  return {
    ...preview,
    composition: prepared.composition,
    typography: prepared.typography,
    resolvedTextSizes: prepared.resolvedTextSizes,
  };
}
