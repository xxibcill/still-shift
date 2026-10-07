import type { ManagedMemory, MemoryLease } from "./managed-memory.ts";

let active: ManagedMemory | undefined;
const destroyPixelBacking = (value: object) => {
  if (value instanceof ArrayBuffer && value.byteLength)
    (value as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }).transfer(
      0,
    );
};

/** A pinned export page owns exactly one allocator scope through all asynchronous frame uploads. */
export async function withManagedMemory<T>(
  memory: ManagedMemory,
  work: () => Promise<T>,
): Promise<T> {
  if (active) throw Error("Managed render memory scopes cannot overlap");
  if (
    typeof (ArrayBuffer.prototype as ArrayBuffer & { transfer?: unknown })
      .transfer !== "function"
  )
    throw Error("Managed render memory requires native ArrayBuffer detachment");
  active = memory;
  try {
    return await work();
  } finally {
    active = undefined;
  }
}

export function renderMemory(): ManagedMemory | undefined {
  return active;
}

/** Assign pixel admission to the backing store, so typed views do not create new owners. */
export function allocateRenderPixels<T extends ArrayBuffer | ArrayBufferView>(
  bytes: number,
  factory: () => T,
  retained = false,
): T {
  if (!active) return factory();
  return active.allocate(
    "pixels",
    bytes,
    factory,
    retained,
    (value) => (ArrayBuffer.isView(value) ? value.buffer : value),
    destroyPixelBacking,
  );
}

export function retainRenderPixels(value: ArrayBuffer | ArrayBufferView): void {
  active?.retain(ArrayBuffer.isView(value) ? value.buffer : value);
}
export function releaseRenderPixels(
  value: ArrayBuffer | ArrayBufferView | undefined,
): void {
  if (value) active?.release(ArrayBuffer.isView(value) ? value.buffer : value);
}

const storageLeases = new WeakMap<object, MemoryLease>();

/** Admit native texture/buffer storage before creating its handle or submitting storage commands. */
export function createRenderStorage<T extends object>(
  bytes: number,
  create: () => T | null,
  initialize: (value: T) => void,
  destroy: (value: T) => void,
): T {
  const memory = active;
  const lease = memory?.reserve("pixels", bytes, undefined, true);
  let value: T | undefined;
  try {
    value = create() ?? undefined;
    if (!value) throw Error("Native render storage creation failed");
    const resource = value;
    if (memory && lease) {
      memory.adopt(resource, lease, () => {
        storageLeases.delete(resource);
        destroy(resource);
      });
      storageLeases.set(resource, lease);
    }
    initialize(resource);
    return resource;
  } catch (error) {
    // Cleanup must preserve the original native/admission failure, including null.
    try {
      if (lease) lease.release();
      else if (value) destroy(value);
    } catch {
      /* The original failure owns this path. */
    }
    throw error;
  }
}

/** Stored leases allow actual native destruction even after the page's active scope ends. */
export function releaseRenderStorage<T extends object>(
  value: T,
  destroy: (value: T) => void,
): void {
  const lease = storageLeases.get(value);
  if (lease) lease.release();
  else destroy(value);
}

/** Canvas backing changes are admitted before the native setter changes its allocation. */
export function createRenderCanvas(): HTMLCanvasElement {
  const memory = active;
  if (!memory) return document.createElement("canvas");
  const width = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "width",
    )!,
    height = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "height",
    )!;
  let canvas: HTMLCanvasElement | undefined;
  const lease = memory.reserve("pixels", 300 * 150 * 4, () => {
    if (!canvas) return;
    width.set!.call(canvas, 0);
    height.set!.call(canvas, 0);
  });
  try {
    canvas = document.createElement("canvas");
  } catch (error) {
    lease.release();
    throw error;
  }
  const ownedCanvas = canvas;
  const install = (
    name: "width" | "height",
    descriptor: PropertyDescriptor,
  ) => {
    Object.defineProperty(ownedCanvas, name, {
      configurable: true,
      enumerable: true,
      get: () => descriptor.get!.call(ownedCanvas) as number,
      set: (value: number) => {
        if (!Number.isSafeInteger(value) || value < 0 || value > 32768)
          throw Error("Managed canvas dimensions are invalid");
        const bytes =
          value *
          (name === "width" ? ownedCanvas.height : ownedCanvas.width) *
          4;
        const before = lease.bytes;
        lease.resize(bytes);
        try {
          descriptor.set!.call(ownedCanvas, value);
        } catch (error) {
          lease.resize(before);
          throw error;
        }
      },
    });
  };
  install("width", width);
  install("height", height);
  memory.adopt(ownedCanvas, lease);
  canvasLeases.set(ownedCanvas, lease);
  return ownedCanvas;
}
export function retainRenderCanvas(canvas: HTMLCanvasElement): void {
  active?.retain(canvas);
}
const canvasLeases = new WeakMap<HTMLCanvasElement, MemoryLease>();

export function releaseRenderCanvas(canvas: HTMLCanvasElement): void {
  const lease = canvasLeases.get(canvas);
  if (!lease) return;
  lease.release();
  canvasLeases.delete(canvas);
}

export function readRenderImageData(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageData {
  if (!active) return context.getImageData(x, y, width, height);
  return active.allocate(
    "pixels",
    Math.abs(width * height) * 4,
    () => context.getImageData(x, y, width, height),
    false,
    (image) => image.data.buffer,
    destroyPixelBacking,
  );
}

/** Allocate the exact destination and each BYOB receive block before the stream can fill them. */
export async function readRenderResponsePixels(
  response: Response,
  expected: number,
): Promise<ArrayBuffer> {
  const memory = active;
  if (!memory) return response.arrayBuffer();
  if (!Number.isSafeInteger(expected) || expected < 1 || !response.body)
    throw Error("Managed response requires an exact positive body size");
  let pixels: Uint8Array<ArrayBuffer> | undefined;
  let reader: ReadableStreamBYOBReader | undefined;
  let count = 0;
  try {
    pixels = allocateRenderPixels(expected, () => new Uint8Array(expected));
    reader = response.body.getReader({ mode: "byob" });
    for (;;) {
      const size = Math.min(65536, Math.max(1, expected - count));
      const block = allocateRenderPixels(size, () => new Uint8Array(size));
      const original = block.buffer;
      let owner: ArrayBufferLike = original;
      try {
        const part = await reader.read(block);
        if (part.value) {
          if (part.value.buffer.byteLength > size)
            throw Error("Managed BYOB body exceeds its admitted backing store");
          memory.transfer(original, part.value.buffer);
          owner = part.value.buffer;
          if (count + part.value.byteLength > expected)
            throw Error("Managed response exceeds its exact body size");
          pixels.set(part.value, count);
          count += part.value.byteLength;
        }
        if (part.done) break;
      } finally {
        memory.release(owner);
      }
    }
    if (count !== expected)
      throw Error("Managed response differs from its exact body size");
    return pixels.buffer;
  } catch (error) {
    releaseRenderPixels(pixels);
    throw error;
  } finally {
    if (reader) await reader.cancel().catch(() => {});
    else await response.body.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
