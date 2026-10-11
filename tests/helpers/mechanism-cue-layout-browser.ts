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
import { evaluateCompositionExposure } from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";
import { compositionQualityTree } from "../../packages/renderer-core/src/composition/quality-samples.ts";
import { releaseRenderPixels } from "../../packages/renderer-core/src/managed-memory-context.ts";
export async function cueLayoutBrowserProof(
  composition: Composition,
  preparedNative3D: CompositionPreparedNative3DVersions,
  appearanceCodeIdentity: NativeAppearanceCodeIdentity,
) {
  const resources = await loadCompositionResources(
    composition,
    (id) => "/@fs/" + composition.assets.find((asset) => asset.id === id)!.path,
    { preparedNative3D, appearanceCodeIdentity },
  );
  const canvas = document.createElement("canvas"),
    preview = createCompositionPreview(canvas, composition, resources, {
      backend: "webgl2",
      collectNativeObservations: true,
    });
  const frames: { frame: number; sha256: string; bounds: unknown[] }[] = [];
  let png = "";
  const capture = async (frame: number, record: boolean) => {
    await preview.prepareFrame(frame);
    const report = await renderCompositionFrameAsync(preview, frame);
    if (report.diagnostics.some((d) => d.severity === "error"))
      throw Error(JSON.stringify(report.diagnostics));
    const options = {
      ...preview.evaluationOptions,
      textBounds: preview.textBounds,
    };
    const quality = compositionQualityTree(
      composition,
      [...evaluateCompositionExposure(composition, frame, options)][0]!,
      options,
    );
    const bounds = [];
    for (const layer of composition.layers)
      if (
        layer.type === "text" &&
        frame >= (layer.inPoint ?? 0) &&
        frame < (layer.outPoint ?? composition.frameCount)
      ) {
        const actual = quality.layers.get(layer.id),
          b = actual?.bounds;
        if (!b || !preview.textBounds[layer.id])
          throw Error("Missing actual glyph measurement " + layer.id);
        if (
          b.left < 0 ||
          b.top < 0 ||
          b.right > composition.width ||
          b.bottom > composition.height
        )
          throw Error("Clipped text " + layer.id + JSON.stringify(b));
        if (layer.native3D?.role === "screen-anchor") {
          const anchor = layer.native3D.anchor;
          if (
            !report.nativeObservationsV2?.some((pass) => {
              const observed = pass.observed.anchors[anchor];
              return (
                observed &&
                "visibility" in observed &&
                observed.visibility === "visible"
              );
            })
          )
            throw Error(
              "Annotation anchor is not actually visible at " +
                frame +
                ": " +
                anchor,
            );
          if (
            !actual.visible ||
            !actual.fullyOnScreen ||
            actual.text !== layer.text
          )
            throw Error(
              "Annotation must be fully painted with complete copy: " +
                layer.id,
            );
          const pos = layer.transform?.position;
          if (!Array.isArray(pos)) throw Error("Expected pinned annotation");
          const left = pos[0]! - 0.01 * composition.width,
            top = pos[1]! - 0.005 * composition.height;
          if (
            b.left < left - 0.001 ||
            b.top < top - 0.001 ||
            b.right > left + 0.34 * composition.width + 0.001 ||
            b.bottom > top + 0.17 * composition.height + 0.001
          )
            throw Error(
              "Glyphs leave solved backing " +
                layer.id +
                JSON.stringify({ b, left, top }),
            );
        }
        bounds.push({
          id: layer.id,
          text: actual.text,
          visible: actual.visible,
          bounds: b,
        });
      }
    const pixels = preview.readPixels();
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array(pixels),
      );
      const sha256 = [...new Uint8Array(digest)]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      if (record) {
        frames.push({ frame, sha256, bounds });
        if (frame === Math.floor(composition.frameCount / 3)) {
          const output = document.createElement("canvas");
          output.width = composition.width;
          output.height = composition.height;
          output
            .getContext("2d")!
            .putImageData(
              new ImageData(
                new Uint8ClampedArray(pixels),
                composition.width,
                composition.height,
              ),
              0,
              0,
            );
          png = output.toDataURL("image/png");
        }
      } else if (frames[frame]!.sha256 !== sha256)
        throw Error("Seek history changed pixels at " + frame);
    } finally {
      releaseRenderPixels(pixels);
    }
  };
  try {
    for (let frame = 0; frame < composition.frameCount; frame++)
      await capture(frame, true);
    for (let frame = composition.frameCount - 1; frame >= 0; frame--)
      await capture(frame, false);
    for (let i = 0; i < composition.frameCount; i++)
      await capture((i * 17) % composition.frameCount, false);
    return {
      frames,
      png,
      forwardReverseRandomStable: true,
      measuredFrames: composition.frameCount,
    };
  } finally {
    preview.dispose();
  }
}
