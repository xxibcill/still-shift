import {
  createWebGLPreview,
  createIllustratedPreview,
  loadIllustratedImages,
} from "../../../packages/renderer-core/src/index.ts";
import type { ExportableScene } from "./export-worker.ts";

export type BrowserExportResult = {
  frameRenderAverageMs: number;
  frameRenderP95Ms: number;
  gpuRenderer: string;
};

declare global {
  interface Window {
    runStillShiftExport?: (
      scene: ExportableScene,
      hasDepth: boolean,
      transport: "raw_rgba" | "png_pipe" | "jpeg_pipe",
    ) => Promise<BrowserExportResult>;
  }
}

const loadImage = async (path: string): Promise<HTMLImageElement> => {
  const image = new Image();
  image.src = path;
  await image.decode();
  return image;
};

window.runStillShiftExport = async (scene, hasDepth, transport) => {
  const illustrated = "recipe" in scene;
  const source = illustrated ? null : await loadImage("/_export/source");
  const depth =
    !illustrated && hasDepth ? await loadImage("/_export/depth") : null;
  if (
    !illustrated &&
    source &&
    (source.naturalWidth !== scene.source.width ||
      source.naturalHeight !== scene.source.height ||
      (depth &&
        (depth.naturalWidth !== scene.source.width ||
          depth.naturalHeight !== scene.source.height)))
  ) {
    throw new Error("Export assets differ from resolved scene dimensions");
  }
  const canvas = document.createElement("canvas");
  canvas.width = scene.canvas.width;
  canvas.height = scene.canvas.height;
  document.body.append(canvas);
  const preview = illustrated
    ? createIllustratedPreview(
        canvas,
        scene,
        await loadIllustratedImages(scene, (id) => `/_export/assets/${id}`),
      )
    : createWebGLPreview(canvas, scene, source!, depth);
  const gl = illustrated ? null : canvas.getContext("webgl2");
  if (!illustrated && !gl)
    throw new Error("WebGL2 is unavailable in export browser");
  const gpuInfo = gl?.getExtension("WEBGL_debug_renderer_info");
  const gpuRenderer =
    gl && gpuInfo
      ? String(gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL))
      : gl
        ? String(gl.getParameter(gl.RENDERER))
        : "Canvas2D illustrated compositor";
  const timings: number[] = [];
  try {
    for (
      let frameIndex = 0;
      frameIndex < scene.timeline.frameCount;
      frameIndex += 1
    ) {
      const frameStart = performance.now();
      preview.renderFrame(frameIndex);
      let frameBytes: ArrayBuffer | Blob;
      if (transport === "raw_rgba") {
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        if (gl)
          gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
        else {
          const rgba = canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          const rowBytes = canvas.width * 4;
          for (let y = 0; y < canvas.height; y++)
            pixels.set(
              rgba.subarray(y * rowBytes, (y + 1) * rowBytes),
              (canvas.height - 1 - y) * rowBytes,
            );
        }
        frameBytes = pixels.buffer as ArrayBuffer;
      } else {
        frameBytes = await new Promise<Blob>((accept, reject) => {
          canvas.toBlob(
            (blob) =>
              blob
                ? accept(blob)
                : reject(new Error("PNG frame capture failed")),
            transport === "png_pipe" ? "image/png" : "image/jpeg",
            transport === "jpeg_pipe" ? 0.95 : undefined,
          );
        });
      }
      timings.push(performance.now() - frameStart);
      const response = await fetch("/_export/frame", {
        method: "POST",
        headers: { "x-frame-index": String(frameIndex) },
        body: frameBytes,
      });
      if (!response.ok)
        throw new Error(
          `Frame ${frameIndex} upload failed: ${await response.text()}`,
        );
    }
  } finally {
    preview.dispose();
  }
  timings.sort((a, b) => a - b);
  return {
    frameRenderAverageMs:
      timings.reduce((total, value) => total + value, 0) / timings.length,
    frameRenderP95Ms: timings[Math.ceil(timings.length * 0.95) - 1]!,
    gpuRenderer,
  };
};
