import { assertCompositionEffectVersions } from "@still-shift/renderer-core";
import {
  createCompositionPreview,
  createWebGLPreview,
  createIllustratedPreview,
  loadCompositionResources,
  loadIllustratedImages,
  type CompositionScene,
  type CompositionPreview,
} from "@still-shift/renderer-core";
import { compositionSurfaceExchange } from "./composition-surface-client.ts";
import type { ExportableScene } from "./export-worker.ts";
import { assertNever, type FrameTransport } from "./transport.ts";

export type BrowserExportResult = {
  frameRenderAverageMs: number;
  frameRenderP95Ms: number;
  frameUploadAverageMs: number;
  frameUploadP95Ms: number;
  gpuRenderer: string;
  work?: {
    worker: number;
    frames: { index: number; renderMs: number; uploadMs: number }[];
    cacheStatistics?: ReturnType<
      NonNullable<CompositionPreview["surfaceCacheStatistics"]>
    >;
  };
};

export type BrowserFrameWork = {
  worker: number;
  workers: number;
  credential: string;
  surfaceCache?: { scopeKey: string; byteLimit: number };
};

export type BrowserCompositionOutput = {
  preserveAlpha: boolean;
  canonicalCapture: boolean;
  work?: BrowserFrameWork;
};

declare global {
  interface Window {
    runStillShiftExport?: (
      scene: ExportableScene,
      hasDepth: boolean,
      transport: FrameTransport,
      output?: BrowserCompositionOutput,
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

const captureBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> =>
  new Promise((accept, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? accept(blob)
          : reject(new Error(`${mimeType} frame capture failed`)),
      mimeType,
      quality,
    );
  });

const captureFrame = (
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext | null,
  transport: FrameTransport,
): Promise<ArrayBuffer | Blob> => {
  switch (transport) {
    case "raw_rgba": {
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
      return Promise.resolve(pixels.buffer as ArrayBuffer);
    }
    case "png_pipe":
      return captureBlob(canvas, "image/png");
    case "jpeg_pipe":
      return captureBlob(canvas, "image/jpeg", 0.95);
    default:
      return assertNever(transport);
  }
};

const isComposition = (scene: ExportableScene): scene is CompositionScene =>
  "schemaVersion" in scene && scene.schemaVersion === "composition-scene-1";

window.runStillShiftExport = async (scene, hasDepth, transport, output) => {
  if (isComposition(scene)) return exportComposition(scene, transport, output);
  if (output)
    throw Error("Composition output profiles require a composition scene");
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
    : await createWebGLPreview(canvas, scene, source!, depth);
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
  return renderFrames(
    scene.timeline.frameCount,
    (frame) => {
      preview.renderFrame(frame);
    },
    () => preview.dispose(),
    canvas,
    gl,
    transport,
    gpuRenderer,
  );
};

const exportComposition = async (
  scene: CompositionScene,
  transport: FrameTransport,
  output?: BrowserCompositionOutput,
): Promise<BrowserExportResult> => {
  const work = output?.work;
  if (
    work &&
    (!Number.isInteger(work.workers) ||
      work.workers < 1 ||
      work.workers > 4 ||
      work.workers > scene.timeline.frameCount ||
      !Number.isInteger(work.worker) ||
      work.worker < 0 ||
      work.worker >= work.workers)
  )
    throw Error("Composition browser frame assignment is invalid");
  assertCompositionEffectVersions(scene);
  const resources = await loadCompositionResources(
    scene.composition,
    (id) => `/_export/assets/${id}`,
    scene.preparedMedia ? { preparedMedia: scene.preparedMedia } : {},
  );
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const preview = createCompositionPreview(
    canvas,
    scene.composition,
    resources,
    {
      backend: scene.backend ?? "canvas2d",
      ...(output ? { preserveAlpha: output.preserveAlpha } : {}),
      ...(output?.work?.surfaceCache
        ? {
            surfaceCache: {
              ...output.work.surfaceCache,
              exchange: compositionSurfaceExchange({
                worker: output.work.worker,
                credential: output.work.credential,
              }),
            },
          }
        : {}),
    },
  );
  const gl = preview.backend === "webgl2" ? canvas.getContext("webgl2") : null;
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  const renderer = gl
    ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    : "Canvas2D";
  let cacheStatistics: NonNullable<
    BrowserExportResult["work"]
  >["cacheStatistics"];
  const result = await renderFrames(
    scene.timeline.frameCount,
    resources.media || output?.work?.surfaceCache
      ? async (frame) => {
          await preview.prepareFrame(frame);
          preview.renderFrame(frame);
        }
      : (frame) => {
          preview.renderFrame(frame);
        },
    () => {
      cacheStatistics = preview.surfaceCacheStatistics?.();
      preview.dispose();
    },
    canvas,
    gl,
    transport,
    `${renderer} ${preview.rendererVersion}`,
    output?.canonicalCapture && transport === "raw_rgba"
      ? () => Promise.resolve(preview.readPixels().buffer as ArrayBuffer)
      : undefined,
    output?.work,
  );
  if (result.work && cacheStatistics)
    result.work.cacheStatistics = cacheStatistics;
  return result;
};

const renderFrames = async (
  frameCount: number,
  renderFrame: (frame: number) => void | Promise<void>,
  dispose: () => void,
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext | null,
  transport: FrameTransport,
  gpuRenderer: string,
  capture?: () => Promise<ArrayBuffer | Blob>,
  work?: BrowserFrameWork,
): Promise<BrowserExportResult> => {
  const timings: number[] = [];
  const uploadTimings: number[] = [];
  const frames: NonNullable<BrowserExportResult["work"]>["frames"] = [];
  try {
    for (
      let frameIndex = work?.worker ?? 0;
      frameIndex < frameCount;
      frameIndex += work?.workers ?? 1
    ) {
      const frameStart = performance.now();
      const readiness = renderFrame(frameIndex);
      if (readiness) await readiness;
      const frameBytes = await (capture
        ? capture()
        : captureFrame(canvas, gl, transport));
      timings.push(performance.now() - frameStart);
      const uploadStart = performance.now();
      const response = await fetch("/_export/frame", {
        method: "POST",
        headers: {
          "x-frame-index": String(frameIndex),
          ...(work
            ? {
                "x-export-worker": String(work.worker),
                "x-export-credential": work.credential,
              }
            : {}),
        },
        body: frameBytes,
      });
      if (!response.ok)
        throw new Error(
          `Frame ${frameIndex} upload failed: ${await response.text()}`,
        );
      uploadTimings.push(performance.now() - uploadStart);
      if (work)
        frames.push({
          index: frameIndex,
          renderMs: timings.at(-1)!,
          uploadMs: uploadTimings.at(-1)!,
        });
    }
  } finally {
    dispose();
  }
  const render = summarizeTimings(timings);
  const upload = summarizeTimings(uploadTimings);
  return {
    frameRenderAverageMs: render.averageMs,
    frameRenderP95Ms: render.p95Ms,
    frameUploadAverageMs: upload.averageMs,
    frameUploadP95Ms: upload.p95Ms,
    gpuRenderer,
    ...(work ? { work: { worker: work.worker, frames } } : {}),
  };
};
