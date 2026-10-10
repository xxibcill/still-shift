import type {
  Composition,
  CompositionPreparedNative3DVersions,
  NativeAppearanceCodeIdentity,
} from "@still-shift/scene-contract";
import {
  loadCompositionResources,
  createCompositionPreview,
  renderCompositionFrameAsync,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { releaseRenderPixels } from "../../packages/renderer-core/src/managed-memory-context.ts";
export async function primitivePreview(
  composition: Composition,
  preparedNative3D: CompositionPreparedNative3DVersions,
  appearanceCodeIdentity: NativeAppearanceCodeIdentity,
) {
  const resources = await loadCompositionResources(
    composition,
    (id) => {
      throw Error(`Prepared primitive must not fetch external asset: ${id}`);
    },
    { preparedNative3D, appearanceCodeIdentity },
  );
  const preview = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources,
    { backend: "webgl2", collectNativeObservations: true },
  );
  const captures = [];
  try {
    for (let repeat = 0; repeat < 2; repeat++) {
      await preview.prepareFrame(0);
      const report = await renderCompositionFrameAsync(preview, 0),
        rgba = preview.readPixels();
      try {
        const canvas = document.createElement("canvas");
        canvas.width = composition.width;
        canvas.height = composition.height;
        canvas
          .getContext("2d")!
          .putImageData(
            new ImageData(
              new Uint8ClampedArray(rgba),
              composition.width,
              composition.height,
            ),
            0,
            0,
          );
        captures.push({
          report,
          rgba: Array.from(rgba),
          png: canvas.toDataURL("image/png"),
        });
      } finally {
        releaseRenderPixels(rgba);
      }
    }
  } finally {
    preview.dispose();
  }
  return { captures };
}
