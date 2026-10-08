import type { Composition } from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";

/** Identical opaque states must retain full viewport coverage throughout a focused fade. */
export async function compositionAffineCrossfadeFocusAcceptance(page: Page) {
  return page.evaluate(async () => {
    const renderUrl = "/packages/renderer-core/src/index.ts",
      render = (await import(renderUrl)) as typeof Render,
      width = 32,
      height = 32,
      imageSize = 80;
    const source = document.createElement("canvas");
    source.width = source.height = imageSize;
    const context = source.getContext("2d", { willReadFrequently: true })!;
    context.fillStyle = "#d08040";
    context.fillRect(0, 0, imageSize, imageSize);
    const assetUrl = source.toDataURL("image/png"),
      png = await (await fetch(assetUrl)).arrayBuffer(),
      hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", png)),
      )
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    const documentFor = (rasterize: "draw" | "natural-size"): Composition => ({
      schemaVersion: "composition-1",
      id: "affine-crossfade-focus",
      width,
      height,
      fps: 24,
      frameCount: 5,
      assets: [
        {
          id: "png",
          type: "image",
          path: "opaque-crossfade.png",
          width: imageSize,
          height: imageSize,
          sha256: `sha256:${hash}`,
        },
      ],
      layers: [
        {
          id: "camera",
          type: "camera",
          depthOfField: true,
          focusDistance: 200,
          aperture: 10,
          blurModel: "gaussian",
          maxBlur: 4,
        },
        {
          id: "art",
          type: "image",
          threeD: true,
          size: [imageSize, imageSize],
          sources: [{ asset: "png" }, { asset: "png" }],
          fit: "stretch",
          rasterize,
          stateFrom: 0,
          state: 1,
          stateMix: {
            keys: [0, 0.25, 0.5, 0.75, 1].map((value, frame) => ({
              frame,
              value,
              interpolation: "hold" as const,
            })),
          },
          transform: { anchor: [0, 0, 0], position: [-24, -24, 0] },
        },
      ],
    });
    const resources = await render.loadCompositionResources(
      documentFor("draw"),
      () => assetUrl,
    );
    const frames = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2];
    const reports = [];
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const reference = render.createCompositionPreview(
          document.createElement("canvas"),
          documentFor("draw"),
          resources,
          { backend },
        ),
        actual = render.createCompositionPreview(
          document.createElement("canvas"),
          documentFor("natural-size"),
          resources,
          { backend },
        );
      try {
        for (const frame of frames) {
          reference.renderFrame(frame);
          actual.renderFrame(frame);
          const expected = reference.readPixels().slice(),
            pixels = actual.readPixels().slice(),
            metrics = render.compareFrames(expected, pixels, width, height);
          if (expected[0]! < 207 || expected[1]! < 127 || expected[2]! < 63)
            throw Error(
              `${backend}/${frame}: projected coverage reference faded`,
            );
          if (metrics.maxChannelDelta > 1)
            throw Error(
              `${backend}/${frame}: focused crossfade lost viewport coverage ${JSON.stringify(metrics)}`,
            );
          reports.push({ backend, frame, metrics });
        }
      } finally {
        reference.dispose();
        actual.dispose();
      }
    }
    return reports;
  });
}
