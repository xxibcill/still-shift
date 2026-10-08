import {
  allocateRenderPixels,
  allocateRenderStorageAsync,
  readRenderImageData,
  releaseRenderPixels,
  releaseRenderStorage,
  renderMemory,
  resizeRenderStorage,
} from "@still-shift/renderer-core";
import { assertNever, type FrameTransport } from "./transport.ts";

export async function captureFrameBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  const memory = renderMemory();
  const capacity = canvas.width * canvas.height * 4 + canvas.height + 1048576;
  const blob = await allocateRenderStorageAsync(
    capacity,
    () =>
      new Promise<Blob>((accept, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? accept(blob)
              : reject(Error(`${mimeType} frame capture failed`)),
          mimeType,
          quality,
        );
      }),
    () => {},
  );
  try {
    if (memory && blob.size > capacity)
      throw Error("Encoded frame capture exceeds its admitted capacity");
    resizeRenderStorage(blob, blob.size);
    return blob;
  } catch (error) {
    releaseRenderStorage(blob, () => {});
    throw error;
  }
}

/** Capture uses the original native readback/encode and original raw row order. */
export async function captureFrame(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext | null,
  transport: FrameTransport,
): Promise<ArrayBuffer | Blob> {
  switch (transport) {
    case "raw_rgba": {
      const size = canvas.width * canvas.height * 4;
      const pixels = allocateRenderPixels(size, () => new Uint8Array(size));
      try {
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
          const rgba = readRenderImageData(
            canvas.getContext("2d")!,
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          try {
            const rowBytes = canvas.width * 4;
            for (let y = 0; y < canvas.height; y++)
              pixels.set(
                rgba.subarray(y * rowBytes, (y + 1) * rowBytes),
                (canvas.height - 1 - y) * rowBytes,
              );
          } finally {
            releaseRenderPixels(rgba);
          }
        }
        return pixels.buffer;
      } catch (error) {
        releaseRenderPixels(pixels);
        throw error;
      }
    }
    case "png_pipe":
      return captureFrameBlob(canvas, "image/png");
    case "jpeg_pipe":
      return captureFrameBlob(canvas, "image/jpeg", 0.95);
    default:
      return assertNever(transport);
  }
}

/** Large ArrayBuffer fetch bodies exceed Chromium's single IPC message limit.
 * Blob bodies stream through a native data pipe; reserve their snapshot before
 * construction and keep it alive through the same frame acknowledgement.
 */
export async function frameUploadBody(
  bytes: ArrayBuffer | Uint8Array<ArrayBuffer> | Blob,
): Promise<ArrayBuffer | Uint8Array<ArrayBuffer> | Blob> {
  if (bytes instanceof Blob || bytes.byteLength < 128 * 1024 ** 2) return bytes;
  return allocateRenderStorageAsync(
    bytes.byteLength,
    async () => new Blob([bytes]),
    () => {},
  );
}

/** Frame scratch spans rendering, native capture and the complete consumer acknowledgement. */
export async function withManagedFrame<T>(work: () => Promise<T>): Promise<T> {
  const memory = renderMemory();
  if (!memory) return work();
  memory.beginScratch();
  try {
    const result = await work();
    memory.endScratch();
    return result;
  } catch (error) {
    try {
      if (memory.hasScratch) memory.endScratch();
    } catch {
      /* Preserve the original frame/upload failure. */
    }
    throw error;
  }
}
