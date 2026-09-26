import type { CinematicScene } from "../../packages/scene-contract/src/cinematic.ts";
import * as renderer from "../../packages/renderer-core/src/illustrated-renderer.ts";
import * as camera from "../../packages/renderer-core/src/cinematic-scene.ts";

export async function measureFocusPixels(source: CinematicScene) {
  // Remove drift so pixel sharpness measurements compare the same source locations.
  const scene = camera.compileCinematicScene({
    ...source,
    camera: { ...source.camera, travel: [0, 0] },
  });
  const images = await renderer.loadIllustratedImages(
    scene,
    (id) =>
      `/cinematic/assets/${scene.assets
        .find((asset) => asset.id === id)!
        .path.split("/")
        .at(-1)}`,
  );
  const canvas = document.createElement("canvas");
  const preview = renderer.createIllustratedPreview(canvas, scene, images);
  const context = canvas.getContext("2d")!;
  const energy = (x: number, y: number, width: number, height: number) => {
    const data = context.getImageData(x, y, width, height).data;
    let sum = 0;
    for (let row = 0; row < height - 1; row++)
      for (let col = 0; col < width - 1; col++) {
        const i = (row * width + col) * 4;
        for (let channel = 0; channel < 3; channel++)
          sum +=
            (data[i + channel]! - data[i + 4 + channel]!) ** 2 +
            (data[i + channel]! - data[i + width * 4 + channel]!) ** 2;
      }
    return sum / ((width - 1) * (height - 1) * 6);
  };
  const measure = () => ({
    near: energy(120, 250, 250, 400),
    subject: energy(1260, 340, 150, 430),
  });
  preview.renderFrame(0);
  const opening = measure();
  preview.renderFrame(scene.timeline.frameCount - 1);
  const ending = measure();
  preview.renderFrame(0);
  const repeated = measure();

  // A red card against white reveals both clipped blur and black-alpha fringes.
  const synthetic = new Map<string, HTMLImageElement>();
  for (const asset of scene.assets) {
    const layer = document.createElement("canvas");
    layer.width = asset.width;
    layer.height = asset.height;
    const ctx = layer.getContext("2d")!;
    if (asset.id !== scene.recipe.foreground) {
      ctx.fillStyle = asset.id === scene.recipe.subject ? "#ff0000" : "#ffffff";
      ctx.fillRect(0, 0, layer.width, layer.height);
    }
    const image = new Image();
    image.src = layer.toDataURL();
    await image.decode();
    synthetic.set(asset.id, image);
  }
  const edgeCanvas = document.createElement("canvas");
  const edgePreview = renderer.createIllustratedPreview(
    edgeCanvas,
    scene,
    synthetic,
  );
  const node = scene.nodes.find((node) => node.id === scene.recipe.subject)!;
  const pixel = () =>
    Array.from(
      edgeCanvas
        .getContext("2d")!
        .getImageData(
          Math.floor(node.x) - 2,
          Math.floor(node.y + node.height / 2),
          1,
          1,
        ).data,
    );
  edgePreview.renderFrame(0);
  const blurredOutside = pixel();
  edgePreview.renderFrame(scene.timeline.frameCount - 1);
  const sharpOutside = pixel();
  const corner = Array.from(
    edgeCanvas.getContext("2d")!.getImageData(0, 0, 1, 1).data,
  );
  const unsupported = document.createElement("canvas");
  const unsupportedContext = unsupported.getContext("2d")!;
  Object.setPrototypeOf(unsupportedContext, {});
  let unsupportedError = "";
  try {
    renderer.createIllustratedPreview(unsupported, scene, images);
  } catch (error) {
    unsupportedError = String(error);
  }
  return {
    opening,
    ending,
    repeated,
    blurredOutside,
    sharpOutside,
    corner,
    unsupportedError,
  };
}
