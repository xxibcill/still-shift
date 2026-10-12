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
export async function familyPackPreview(
  composition: Composition,
  preparedNative3D: CompositionPreparedNative3DVersions,
  appearanceCodeIdentity: NativeAppearanceCodeIdentity,
) {
  const resources = await loadCompositionResources(
    composition,
    (id) => {
      throw Error(`Unexpected family pack asset fetch: ${id}`);
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
    for (const frame of [0, 3, 6, 9, 12, 18, 21, 23, 0, 12]) {
      await preview.prepareFrame(frame);
      const report = await renderCompositionFrameAsync(preview, frame),
        rgba = preview.readPixels();
      try {
        const encoded = document.createElement("canvas");
        encoded.width = composition.width;
        encoded.height = composition.height;
        encoded
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
          frame,
          report,
          rgba: Array.from(rgba),
          png: encoded.toDataURL("image/png"),
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
