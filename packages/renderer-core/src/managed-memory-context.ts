import type { ManagedMemory, MemoryLease } from "./managed-memory.ts";

let active: ManagedMemory | undefined;

/** A pinned export page owns exactly one allocator scope through all asynchronous frame uploads. */
export async function withManagedMemory<T>(
  memory: ManagedMemory,
  work: () => Promise<T>,
): Promise<T> {
  if (active) throw Error("Managed render memory scopes cannot overlap");
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
  return active.allocate("pixels", bytes, factory, retained, (value) =>
    ArrayBuffer.isView(value) ? value.buffer : value,
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
  );
}
