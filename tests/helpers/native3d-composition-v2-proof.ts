import type {
  Composition,
  CompositionPreparedNative3DVersions,
  NativeAppearanceCodeIdentity,
} from "@still-shift/scene-contract";
import {
  createCompositionPreview,
  loadCompositionResources,
  renderCompositionFrameAsync,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { releaseRenderPixels } from "../../packages/renderer-core/src/managed-memory-context.ts";

export async function nativeCompositionV2Proof(
  composition: Composition,
  preparedNative3D: CompositionPreparedNative3DVersions,
  appearanceCodeIdentity: NativeAppearanceCodeIdentity,
) {
  const resources = await loadCompositionResources(
    composition,
    () => {
      throw Error(
        "No file fetch is expected after verified native preparation",
      );
    },
    {
      preparedNative3D,
      appearanceCodeIdentity,
    },
  );
  const canvas = document.createElement("canvas");
  const preview = createCompositionPreview(canvas, composition, resources, {
    backend: "webgl2",
    collectNativeObservations: true,
  });
  const captures = [];
  const negatives: { id: string; message: string }[] = [];
  const expectFailure = async (
    id: string,
    operation: () => unknown | Promise<unknown>,
  ) => {
    let message: string | undefined;
    try {
      await operation();
    } catch (error) {
      message = String(error);
    }
    if (!message) throw Error(`Negative case did not fail: ${id}`);
    negatives.push({ id, message });
  };
  try {
    await preview.prepareFrame(0);
    await expectFailure("synchronous-scene2", () => preview.renderFrame(0));
    await expectFailure("pixels-before-completion", () => preview.readPixels());
    for (const frame of [0, 3, 0, 4]) {
      await preview.prepareFrame(frame);
      const pending = renderCompositionFrameAsync(preview, frame);
      void pending.then(
        () => {},
        () => {},
      );
      await expectFailure("overlapping-output-frame", () =>
        renderCompositionFrameAsync(preview, frame),
      );
      await expectFailure("pixels-during-completion", () =>
        preview.readPixels(),
      );
      const report = await pending;
      const pixels = preview.readPixels();
      try {
        const encoded = document.createElement("canvas");
        encoded.width = composition.width;
        encoded.height = composition.height;
        const image = new ImageData(
          new Uint8ClampedArray(pixels),
          composition.width,
          composition.height,
        );
        encoded.getContext("2d")!.putImageData(image, 0, 0);
        captures.push({
          frame,
          report,
          rgba: [...pixels],
          png: encoded.toDataURL("image/png"),
        });
      } finally {
        releaseRenderPixels(pixels);
      }
    }
    await preview.prepareFrame(0);
    const cancelled = renderCompositionFrameAsync(preview, 0);
    void cancelled.then(
      () => {},
      () => {},
    );
    preview.dispose();
    await expectFailure("dispose-pending-frame", () => cancelled);
    await expectFailure("disposed-pixels", () => preview.readPixels());
    await expectFailure("disposed-prepare", () => preview.prepareFrame(0));
  } finally {
    preview.dispose();
  }
  const ordinary = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources,
    { backend: "webgl2" },
  );
  let defaultRgba: number[];
  try {
    await ordinary.prepareFrame(0);
    const report = await renderCompositionFrameAsync(ordinary, 0);
    if (report.nativeObservationsV2 !== undefined)
      throw Error("Default preview unexpectedly collected output observations");
    const pixels = ordinary.readPixels();
    try {
      defaultRgba = [...pixels];
    } finally {
      releaseRenderPixels(pixels);
    }
  } finally {
    ordinary.dispose();
  }
  const factory = resources.nativeDepthFactory!;
  const failing = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    {
      ...resources,
      nativeDepthFactory(context, options) {
        const runtime = factory(context, options);
        return {
          ...runtime,
          async finalize() {
            await runtime.finalize?.();
            throw Error("injected-first-native-finalization-failure");
          },
        };
      },
    },
    { backend: "webgl2", collectNativeObservations: true },
  );
  try {
    await failing.prepareFrame(0);
    await expectFailure("native-finalizer-failure", () =>
      renderCompositionFrameAsync(failing, 0),
    );
    await expectFailure("pixels-after-failed-completion", () =>
      failing.readPixels(),
    );
  } finally {
    failing.dispose();
  }
  const empty = createCompositionPreview(
    document.createElement("canvas"),
    { ...composition, layers: [] },
    resources,
    {
      backend: "webgl2",
      collectNativeObservations: true,
    },
  );
  let emptyPasses;
  try {
    await empty.prepareFrame(0);
    const report = await renderCompositionFrameAsync(empty, 0);
    emptyPasses = report.nativeObservationsV2;
    const pixels = empty.readPixels();
    releaseRenderPixels(pixels);
  } finally {
    empty.dispose();
  }
  return {
    captures,
    negatives,
    emptyPasses,
    defaultRgba,
    scope: "normal-composition-preview2",
  };
}
