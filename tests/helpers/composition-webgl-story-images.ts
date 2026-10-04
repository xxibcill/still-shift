import {
  compareFrames,
  compileStoryScene,
  createCompositionPreview,
  createIllustratedPreview,
  loadCompositionResources,
  loadIllustratedImages,
  meetsTier,
  storyToComposition,
} from "../../packages/renderer-core/src/index.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/index.ts";

/** SVG edges accumulate different bytes when bounded images use hardware blending. */
export async function checkWebglStoryImageRounding() {
  const reports = [];
  for (const { path, frames } of [
    {
      path: "story-motion-continuous/evidence-boundary.json",
      frames: [112, 119, 138, 144],
    },
    {
      path: "story-passages/templates/unequal-access.json",
      frames: [0, 4],
    },
  ]) {
    const url = new URL(`/benchmarks/fixtures/${path}`, location.href);
    const input = StorySceneSchema.parse(await (await fetch(url)).json());
    const scene = compileStoryScene(input);
    const composition = storyToComposition(input);
    const assets = new Map(
      composition.assets.map((asset) => [
        asset.id,
        new URL(asset.path, url).href,
      ]),
    );
    const legacyCanvas = document.createElement("canvas");
    const legacy = createIllustratedPreview(
      legacyCanvas,
      scene,
      await loadIllustratedImages(scene, (id) => assets.get(id)!),
    );
    const gpu = createCompositionPreview(
      document.createElement("canvas"),
      composition,
      await loadCompositionResources(composition, (id) => assets.get(id)!),
      { backend: "webgl2" },
    );
    let maxDelta = 0;
    try {
      for (const frame of [...frames, ...frames.toReversed()]) {
        legacy.renderFrame(frame);
        gpu.renderFrame(frame);
        const expected = legacyCanvas
          .getContext("2d")!
          .getImageData(0, 0, composition.width, composition.height).data;
        const comparison = compareFrames(
          expected,
          gpu.readPixels(),
          composition.width,
          composition.height,
        );
        if (!meetsTier(comparison, "near"))
          throw new Error(
            `${path} frame ${frame}: WebGL image delta ${comparison.maxChannelDelta}, PSNR ${comparison.psnr}`,
          );
        maxDelta = Math.max(maxDelta, comparison.maxChannelDelta);
      }
      reports.push({ path, frames: frames.length * 2, maxDelta });
    } finally {
      gpu.dispose();
      legacy.dispose();
    }
  }
  return reports;
}
