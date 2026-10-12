import type { CompositionScene } from "../../packages/renderer-core/src/composition/render/renderer.ts";
import {
  createCompositionPreview,
  loadCompositionResources,
  renderCompositionFrameAsync,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { evaluateCompositionExposure } from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";
import { compositionQualityTree } from "../../packages/renderer-core/src/composition/quality-samples.ts";
import { releaseRenderPixels } from "../../packages/renderer-core/src/managed-memory-context.ts";
async function preview(scene: CompositionScene, paths: Record<string, string>) {
  const resources = await loadCompositionResources(
    scene.composition,
    (id) => "/@fs/" + paths[id],
    {
      ...(scene.preparedMedia ? { preparedMedia: scene.preparedMedia } : {}),
      ...(scene.preparedNative3D
        ? { preparedNative3D: scene.preparedNative3D }
        : {}),
      ...(scene.nativeAppearanceCodeIdentity
        ? { appearanceCodeIdentity: scene.nativeAppearanceCodeIdentity }
        : {}),
    },
  );
  return createCompositionPreview(
    document.createElement("canvas"),
    scene.composition,
    resources,
    {
      backend: "webgl2",
      collectNativeObservations: true,
      collectStatistics: true,
    },
  );
}
async function checksum(pixels: ArrayLike<number>) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(pixels));
  return [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
/** Compare actual native and plate previews at the unchanged RGB tolerance2; seek all cached frames in three orders. */
export async function cuePlateBrowserProof(
  direct: CompositionScene,
  directPaths: Record<string, string>,
  cached: CompositionScene,
  cachedPaths: Record<string, string>,
) {
  const original = await preview(direct, directPaths);
  let reused: Awaited<ReturnType<typeof preview>> | undefined;
  const frames: {
    frame: number;
    directSha256: string;
    cachedSha256: string;
    maximumRgbDifference: number;
    changedRgbValues: number;
    textBounds: unknown[];
  }[] = [];
  const sampledPngs: { frame: number; png: string }[] = [];
  try {
    reused = await preview(cached, cachedPaths);
    for (let frame = 0; frame < direct.composition.frameCount; frame++) {
      await original.prepareFrame(frame);
      await reused.prepareFrame(frame);
      const nativeReport = await renderCompositionFrameAsync(original, frame),
        cachedReport = await renderCompositionFrameAsync(reused, frame);
      if (
        nativeReport.diagnostics.some((d) => d.severity === "error") ||
        cachedReport.diagnostics.some((d) => d.severity === "error")
      )
        throw Error("Frame diagnostic " + frame);
      if (
        nativeReport.nativeObservationsV2?.length !== 1 ||
        cachedReport.nativeObservations?.length ||
        cachedReport.nativeObservationsV2?.length ||
        cachedReport.nativeObservationsV3?.length
      )
        throw Error(
          "Fresh native observation appeared in cached preview or direct native proof missing",
        );
      const directOptions = {
          ...original.evaluationOptions,
          textBounds: original.textBounds,
        },
        cachedOptions = {
          ...reused.evaluationOptions,
          textBounds: reused.textBounds,
        };
      const directQuality = compositionQualityTree(
        direct.composition,
        [
          ...evaluateCompositionExposure(
            direct.composition,
            frame,
            directOptions,
          ),
        ][0]!,
        directOptions,
      );
      const cachedQuality = compositionQualityTree(
        cached.composition,
        [
          ...evaluateCompositionExposure(
            cached.composition,
            frame,
            cachedOptions,
          ),
        ][0]!,
        cachedOptions,
      );
      const textBounds = [];
      for (const layer of cached.composition.layers) {
        if (
          layer.type !== "text" ||
          frame < (layer.inPoint ?? 0) ||
          frame >= (layer.outPoint ?? cached.composition.frameCount)
        )
          continue;
        const a = directQuality.layers.get(layer.id),
          b = cachedQuality.layers.get(layer.id);
        if (
          !a?.bounds ||
          !b?.bounds ||
          !original.textBounds[layer.id] ||
          !reused.textBounds[layer.id] ||
          JSON.stringify(a.bounds) !== JSON.stringify(b.bounds) ||
          a.visible !== b.visible ||
          a.text !== b.text
        )
          throw Error(
            "Actual cached glyph bounds/visibility differ " +
              layer.id +
              " at " +
              frame,
          );
        const directLayer = direct.composition.layers.find(
          (l) => l.id === layer.id,
        )!;
        const binding =
          directLayer.native3D ??
          direct.composition.layers.find((l) => l.id === directLayer.parent)
            ?.native3D;
        if (binding?.role === "screen-anchor") {
          const anchors = [
            binding.anchor,
            ...(binding.target.kind === "visibility"
              ? (binding.target.anchors ?? [])
              : []),
          ];
          if (
            !a.visible ||
            !b.visible ||
            !a.fullyOnScreen ||
            !b.fullyOnScreen ||
            b.text !== layer.text ||
            anchors.some((id) => {
              const observed =
                nativeReport.nativeObservationsV2![0]!.observed.anchors[id];
              return (
                !observed ||
                !("visibility" in observed) ||
                observed.visibility !== "visible"
              );
            })
          )
            throw Error(
              "All-five-styles positive requires painted copy and actual visible native anchors at " +
                frame +
                ": " +
                layer.id,
            );
        }
        if (
          b.bounds.left < 0 ||
          b.bounds.top < 0 ||
          b.bounds.right > cached.composition.width ||
          b.bounds.bottom > cached.composition.height
        )
          throw Error("Cached glyph clipped " + layer.id);
        textBounds.push({
          id: layer.id,
          text: b.text,
          visible: b.visible,
          bounds: b.bounds,
        });
      }
      const a = original.readPixels(),
        b = reused.readPixels();
      try {
        if (a.length !== b.length) throw Error("Preview dimensions differ");
        let maximumRgbDifference = 0,
          changedRgbValues = 0;
        for (let i = 0; i < a.length; i++) {
          if (i % 4 === 3) {
            if (a[i] !== b[i]) throw Error("Preview alpha differs at " + frame);
            continue;
          }
          const delta = Math.abs(a[i]! - b[i]!);
          maximumRgbDifference = Math.max(maximumRgbDifference, delta);
          if (delta) changedRgbValues++;
        }
        if (maximumRgbDifference > 2)
          throw Error(
            "Native/plate preview RGB exceeds unchanged2 at " +
              frame +
              ": " +
              maximumRgbDifference,
          );
        frames.push({
          frame,
          directSha256: await checksum(a),
          cachedSha256: await checksum(b),
          maximumRgbDifference,
          changedRgbValues,
          textBounds,
        });
        if ([0, 15, 30, 45, 59].includes(frame)) {
          const canvas = document.createElement("canvas");
          canvas.width = cached.composition.width;
          canvas.height = cached.composition.height;
          canvas
            .getContext("2d")!
            .putImageData(
              new ImageData(
                new Uint8ClampedArray(b),
                canvas.width,
                canvas.height,
              ),
              0,
              0,
            );
          sampledPngs.push({ frame, png: canvas.toDataURL("image/png") });
        }
      } finally {
        releaseRenderPixels(a);
        releaseRenderPixels(b);
      }
    }
    for (const order of [
      Array.from({ length: frames.length }, (_, i) => frames.length - 1 - i),
      Array.from({ length: frames.length }, (_, i) => (i * 17) % frames.length),
    ]) {
      for (const frame of order) {
        await reused.prepareFrame(frame);
        const report = await renderCompositionFrameAsync(reused, frame);
        if (
          report.nativeObservationsV2?.length ||
          report.nativeObservations?.length ||
          report.nativeObservationsV3?.length
        )
          throw Error("Cached seek generated native observations");
        const pixels = reused.readPixels();
        try {
          if ((await checksum(pixels)) !== frames[frame]!.cachedSha256)
            throw Error("Cached seek changed pixels at " + frame);
        } finally {
          releaseRenderPixels(pixels);
        }
      }
    }
    const measured = reused.renderStatistics?.();
    if (
      !measured ||
      measured.byLayerType.some(
        (r) => (r.type === "native-depth" || r.type === "native3d") && r.calls,
      )
    )
      throw Error(
        "Cached preview omitted measurements or submitted native work",
      );
    return {
      frames,
      sampledPngs,
      measured,
      cachedSeekFrames: frames.length * 2,
      freshCachedNativePasses: 0,
      fixedRgbTolerance: 2,
    };
  } finally {
    reused?.dispose();
    original.dispose();
  }
}
