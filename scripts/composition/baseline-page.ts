import {
  createIllustratedPreview,
  loadIllustratedImages,
  type IllustratedScene,
} from "../../packages/renderer-core/src/index.ts";

export type BaselineRenderOptions = {
  /** Frames uploaded at full size when `uploadSampleFrames` is set. */
  sampleFrames: number[];
  /** Frames stored as small thumbnails for diagnosing a baseline change. */
  thumbnailFrames: number[];
  thumbnailWidth: number;
  uploadSampleFrames: boolean;
  /**
   * 64-bit hash prefixes from another environment's baseline. Frames that differ are
   * uploaded (the first mismatch plus mismatching sampled frames, up to
   * `maxMismatchUploads`) so they can be compared at full resolution elsewhere.
   */
  expectedFrames?: string[];
  maxMismatchUploads?: number;
  profile: string;
  item: string;
  /** Unique per item: fixtures reuse asset ids for different files, so URLs must not collide in the page cache. */
  assetBase: string;
};

export type BaselineRenderResult = {
  frameHashes: string[];
  renderMs: number[];
  readbackMs: number[];
  thumbnails: { frame: number; width: number; height: number; rgb: string }[];
};

export type SampleRenderOptions = Pick<
  BaselineRenderOptions,
  "sampleFrames" | "profile" | "item" | "assetBase"
>;

declare global {
  interface Window {
    runCompositionBaseline?: (
      scene: IllustratedScene,
      options: BaselineRenderOptions,
    ) => Promise<BaselineRenderResult>;
    runCompositionSamples?: (
      scene: IllustratedScene,
      options: SampleRenderOptions,
    ) => Promise<void>;
  }
}

const uploadFrame = async (
  pixels: Uint8ClampedArray<ArrayBuffer>,
  options: SampleRenderOptions,
  frame: number,
) => {
  const response = await fetch(
    `/_baseline/frame?${new URLSearchParams({
      profile: options.profile,
      item: options.item,
      frame: String(frame),
    })}`,
    { method: "POST", body: pixels },
  );
  if (!response.ok)
    throw new Error(`Frame ${frame} upload failed: ${response.status}`);
};

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const base64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

// Mirrors packages/execution-runtime/src/export-page.ts so baselines measure the same
// renderer path as MP4 export, before encoding.
window.runCompositionBaseline = async (scene, options) => {
  const canvas = document.createElement("canvas");
  canvas.width = scene.canvas.width;
  canvas.height = scene.canvas.height;
  document.body.append(canvas);
  const preview = createIllustratedPreview(
    canvas,
    scene,
    await loadIllustratedImages(scene, (id) => `${options.assetBase}${id}`),
  );
  const context = canvas.getContext("2d")!;
  const thumbnail = document.createElement("canvas");
  thumbnail.width = options.thumbnailWidth;
  thumbnail.height = Math.max(
    1,
    Math.round((options.thumbnailWidth * canvas.height) / canvas.width),
  );
  const thumbnailContext = thumbnail.getContext("2d", {
    willReadFrequently: true,
  })!;
  thumbnailContext.imageSmoothingQuality = "high";
  const samples = new Set(options.sampleFrames);
  let mismatchUploads = 0;
  const thumbnails = new Set(options.thumbnailFrames);
  const result: BaselineRenderResult = {
    frameHashes: [],
    renderMs: [],
    readbackMs: [],
    thumbnails: [],
  };
  try {
    for (let frame = 0; frame < scene.timeline.frameCount; frame += 1) {
      const renderStart = performance.now();
      preview.renderFrame(frame);
      const readbackStart = performance.now();
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const readbackEnd = performance.now();
      result.renderMs.push(readbackStart - renderStart);
      result.readbackMs.push(readbackEnd - readbackStart);
      const hash = hex(await crypto.subtle.digest("SHA-256", pixels));
      result.frameHashes.push(hash);
      if (
        options.expectedFrames &&
        hash.slice(0, 16) !== options.expectedFrames[frame] &&
        mismatchUploads < (options.maxMismatchUploads ?? 0) &&
        (mismatchUploads === 0 || samples.has(frame))
      ) {
        mismatchUploads += 1;
        await uploadFrame(pixels, options, frame);
      }
      if (thumbnails.has(frame)) {
        thumbnailContext.drawImage(
          canvas,
          0,
          0,
          thumbnail.width,
          thumbnail.height,
        );
        const small = thumbnailContext.getImageData(
          0,
          0,
          thumbnail.width,
          thumbnail.height,
        ).data;
        const rgb = new Uint8Array(thumbnail.width * thumbnail.height * 3);
        for (let pixel = 0; pixel < thumbnail.width * thumbnail.height; pixel++)
          rgb.set(small.subarray(pixel * 4, pixel * 4 + 3), pixel * 3);
        result.thumbnails.push({
          frame,
          width: thumbnail.width,
          height: thumbnail.height,
          rgb: base64(rgb),
        });
      }
      if (options.uploadSampleFrames && samples.has(frame))
        await uploadFrame(pixels, options, frame);
    }
  } finally {
    preview.dispose();
    canvas.remove();
  }
  return result;
};

/**
 * Renders each sampled frame on a fresh canvas and reads it back exactly once. Chromium
 * moves a canvas off the GPU after repeated readbacks, so reading every frame from one
 * canvas (as `runCompositionBaseline` does) would measure software rasterisation even
 * in a hardware profile. Evaluation is pure, so frames can be rendered out of order.
 */
window.runCompositionSamples = async (scene, options) => {
  const images = await loadIllustratedImages(
    scene,
    (id) => `${options.assetBase}${id}`,
  );
  for (const frame of options.sampleFrames) {
    const canvas = document.createElement("canvas");
    canvas.width = scene.canvas.width;
    canvas.height = scene.canvas.height;
    document.body.append(canvas);
    const preview = createIllustratedPreview(canvas, scene, images);
    try {
      preview.renderFrame(frame);
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      await uploadFrame(pixels, options, frame);
    } finally {
      preview.dispose();
      canvas.remove();
    }
  }
};
