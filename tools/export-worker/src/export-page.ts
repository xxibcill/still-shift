import { createWebGLPreview } from "../../../packages/renderer-core/src/index.ts";
import type { PreviewScene } from "../../../packages/renderer-core/src/scene.ts";

export type BrowserExportResult = {
  frameRenderAverageMs: number;
  frameRenderP95Ms: number;
  frameUploadAverageMs: number;
  frameUploadP95Ms: number;
  gpuRenderer: string;
};

declare global {
  interface Window {
    runStillShiftExport?: (
      scene: PreviewScene,
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

const summarizeTimings = (timings: number[]) => {
  timings.sort((a, b) => a - b);
  return {
    averageMs:
      timings.reduce((total, value) => total + value, 0) / timings.length,
    p95Ms: timings[Math.ceil(timings.length * 0.95) - 1]!,
  };
};

window.runStillShiftExport = async (scene, hasDepth, transport) => {
  const source = await loadImage("/_export/source");
  const depth = hasDepth ? await loadImage("/_export/depth") : null;
  if (
    source.naturalWidth !== scene.source.width ||
    source.naturalHeight !== scene.source.height ||
    (depth &&
      (depth.naturalWidth !== scene.source.width ||
        depth.naturalHeight !== scene.source.height))
  ) {
    throw new Error("Export assets differ from resolved scene dimensions");
  }
  const canvas = document.createElement("canvas");
  canvas.width = scene.canvas.width;
  canvas.height = scene.canvas.height;
  document.body.append(canvas);
  const preview = createWebGLPreview(canvas, scene, source, depth);
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 is unavailable in export browser");
  const gpuInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpuRenderer = gpuInfo
    ? String(gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  const timings: number[] = [];
  const uploadTimings: number[] = [];
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
        gl.readPixels(
          0,
          0,
          canvas.width,
          canvas.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
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
      const uploadStart = performance.now();
      const response = await fetch("/_export/frame", {
        method: "POST",
        headers: { "x-frame-index": String(frameIndex) },
        body: frameBytes,
      });
      if (!response.ok)
        throw new Error(
          `Frame ${frameIndex} upload failed: ${await response.text()}`,
        );
      uploadTimings.push(performance.now() - uploadStart);
    }
  } finally {
    preview.dispose();
  }
  const render = summarizeTimings(timings);
  const upload = summarizeTimings(uploadTimings);
  return {
    frameRenderAverageMs: render.averageMs,
    frameRenderP95Ms: render.p95Ms,
    frameUploadAverageMs: upload.averageMs,
    frameUploadP95Ms: upload.p95Ms,
    gpuRenderer,
  };
};
