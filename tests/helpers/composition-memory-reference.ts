import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  createRenderCanvas,
  allocateRenderPixels,
  readRenderImageData,
  renderMemory,
} from "../../packages/renderer-core/src/managed-memory-context.ts";

/** Actual native admission, exact kernel pixels and explicit scratch destruction. */
export async function checkManagedMemoryPrimitives() {
  const memory = new ManagedMemory({ pixels: 400000, metadata: 8192 });
  const baseline = document.createElement("canvas");
  baseline.width = baseline.height = 16;
  const paint = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        context.fillStyle = `rgba(${x * 17},${y * 17},${(x + y) * 8},${(x * 16 + y) / 255})`;
        context.fillRect(x, y, 1, 1);
      }
    return context;
  };
  const expected = paint(baseline).getImageData(0, 0, 16, 16).data;
  let nativeWidthCalls = 0;
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    "width",
  )!;
  Object.defineProperty(HTMLCanvasElement.prototype, "width", {
    ...descriptor,
    set(this: HTMLCanvasElement, value: number) {
      nativeWidthCalls++;
      descriptor.set!.call(this, value);
    },
  });
  try {
    return await withManagedMemory(memory, async () => {
      memory.beginScratch();
      const canvas = createRenderCanvas();
      canvas.width = canvas.height = 16;
      const context = paint(canvas);
      const calls = nativeWidthCalls;
      let rejected = false;
      try {
        canvas.width = 32768;
      } catch (error) {
        rejected = /aggregate worker quota/.test(String(error));
      }
      if (!rejected || canvas.width !== 16 || nativeWidthCalls !== calls)
        throw Error("Over-quota Canvas reached the native setter");
      const pixels = readRenderImageData(context, 0, 0, 16, 16).data;
      for (let i = 0; i < pixels.length; i++)
        if (pixels[i] !== expected[i])
          throw Error(`Managed native Canvas changed pixel ${i}`);
      const view = allocateRenderPixels(16, () => new Uint8Array(16));
      memory.retain(new Uint8ClampedArray(view.buffer).buffer);
      memory.endScratch();
      if (
        Number(canvas.width) !== 0 ||
        Number(canvas.height) !== 0 ||
        memory.statistics.current.pixels !== 16
      )
        throw Error(
          "Scratch did not release actual Canvas storage or preserve retained aliases",
        );
      memory.release(view.buffer);
      memory.beginScratch();
      const committed = createRenderCanvas();
      committed.width = committed.height = 16;
      paint(committed);
      memory.commitScratch();
      memory.beginScratch();
      const discarded = createRenderCanvas();
      discarded.width = discarded.height = 8;
      memory.endScratch();
      if (discarded.width !== 0 || committed.width !== 16)
        throw Error("Construction commit lost Canvas ownership");
      let overlapRejected = false;
      try {
        await withManagedMemory(memory, async () => {});
      } catch (error) {
        overlapRejected = /cannot overlap/.test(String(error));
      }
      if (!overlapRejected || renderMemory() !== memory)
        throw Error("Allocator page scope ownership changed");
      const before = memory.statistics;
      memory.dispose();
      if (
        Number(committed.width) !== 0 ||
        Number(committed.height) !== 0 ||
        Number(memory.statistics.current.pixels) !== 0
      )
        throw Error("Disposal retained native Canvas storage");
      return {
        status: "passed",
        exactChannelComparisons: expected.length,
        rejectedBeforeNativeSetter: true,
        scratchCanvasDestroyed: true,
        committedCanvasDestroyed: true,
        retainedBackingStoreAlias: true,
        scopeOverlapRejected: true,
        before,
        after: memory.statistics,
      };
    });
  } finally {
    Object.defineProperty(HTMLCanvasElement.prototype, "width", descriptor);
    memory.dispose();
    baseline.width = baseline.height = 0;
  }
}
