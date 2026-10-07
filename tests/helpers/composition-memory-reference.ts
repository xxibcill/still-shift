import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  createRenderCanvas,
  allocateRenderPixels,
  readRenderImageData,
  renderMemory,
  readRenderResponsePixels,
  releaseRenderCanvas,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { createCanvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";

/** Pooled native surfaces and exposure storage remain charged until their actual release. */
export async function checkManagedCanvasPool() {
  const memory = new ManagedMemory({ pixels: 400000, metadata: 8192 });
  try {
    return await withManagedMemory(memory, async () => {
      const backend = createCanvas2dBackend({
        images: { images: new Map(), sizes: new Map() },
        drawText: () => {},
        poolByteLimit: 256,
      });
      memory.beginScratch();
      const first = backend.createSurface(8, 8);
      const second = backend.createSurface(8, 8);
      backend.releaseSurface(first);
      backend.releaseSurface(second);
      memory.endScratch();
      if (
        first.canvas.width !== 0 ||
        second.canvas.width !== 8 ||
        memory.statistics.current.pixels !== 256
      )
        throw Error(
          "Managed Canvas pool did not evict and retain actual storage",
        );
      memory.beginScratch();
      const reused = backend.createSurface(8, 8);
      if (reused !== second) throw Error("Managed Canvas pool changed reuse");
      backend.releaseSurface(reused);
      const dropped = backend.createSurface(16, 16);
      backend.releaseSurface(dropped);
      memory.endScratch();
      if (
        dropped.canvas.width !== 0 ||
        memory.statistics.current.pixels !== 256
      )
        throw Error("Over-pool Canvas retained backing admission");
      const canvas = createRenderCanvas();
      canvas.width = canvas.height = 8;
      const target = backend.wrap(canvas, canvas.getContext("2d")!);
      memory.beginScratch();
      backend.accumulateExposure!(target, 4, (sample) => {
        target.ctx.fillStyle = `rgb(${[0, 255, 127, 64][sample]},20,40)`;
        target.ctx.fillRect(0, 0, 8, 8);
      });
      const actual = backend.readPixels(target);
      const exposureChannels = actual.length;
      for (let byte = 0; byte < actual.length; byte++)
        if (actual[byte] !== [112, 20, 40, 255][byte % 4])
          throw Error(`Managed exposure changed actual byte ${byte}`);
      memory.endScratch();
      if (Number(memory.statistics.current.pixels) !== 1536)
        throw Error(
          "Managed exposure did not retain exactly its accumulator and canvases",
        );
      backend.dispose();
      releaseRenderCanvas(canvas);
      if (
        Number(second.canvas.width) !== 0 ||
        Number(memory.statistics.current.pixels) !== 0
      )
        throw Error(
          "Managed backend disposal retained Canvas/exposure storage",
        );
      return {
        status: "passed",
        exactExposureChannels: exposureChannels,
        evictedCanvasDestroyed: true,
        overPoolCanvasDestroyed: true,
        retainedPoolReused: true,
        statistics: memory.statistics,
      };
    });
  } finally {
    memory.dispose();
  }
}

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
      memory.beginScratch();
      const response = await fetch("/_memory_primitives");
      const received = new Uint8Array(
        await readRenderResponsePixels(response, 180000),
      );
      const responseBytes = received.length;
      for (let byte = 0; byte < received.length; byte++)
        if (received[byte] !== (byte * 37) % 251)
          throw Error(`Managed BYOB changed actual response byte ${byte}`);
      if (Number(memory.statistics.current.pixels) !== 181024)
        throw Error("Managed BYOB retained a receive block after copying");
      memory.endScratch();
      if (received.byteLength !== 0)
        throw Error("Managed scratch did not detach actual response storage");
      const responseFailures = [];
      for (const size of [179999, 180001, 400000]) {
        memory.beginScratch();
        const response = await fetch("/_memory_primitives");
        const body = response.body!;
        const getReader = body.getReader;
        let reads = 0;
        Object.defineProperty(body, "getReader", {
          value: (...args: unknown[]) => {
            reads++;
            return Reflect.apply(getReader, body, args);
          },
        });
        let rejected = false;
        try {
          await readRenderResponsePixels(response, size);
        } catch (error) {
          rejected = (
            size === 400000 ? /aggregate worker quota/ : /exact body size/
          ).test(String(error));
        } finally {
          memory.endScratch();
        }
        if (
          !rejected ||
          (size === 400000 && reads !== 0) ||
          Number(memory.statistics.current.pixels) !== 1024 ||
          memory.statistics.reservations !== 1
        )
          throw Error(
            "Managed response failure changed admission, ownership or original bounds",
          );
        responseFailures.push({
          size,
          rejected: true,
          readerAcquisitions: reads,
        });
      }
      memory.beginScratch();
      let originalFailure: unknown = "not thrown";
      try {
        await readRenderResponsePixels(
          new Response(
            new ReadableStream({
              type: "bytes",
              start(controller) {
                controller.error(null);
              },
            }),
          ),
          16,
        );
      } catch (error) {
        originalFailure = error;
      } finally {
        memory.endScratch();
      }
      if (
        originalFailure !== null ||
        Number(memory.statistics.current.pixels) !== 1024
      )
        throw Error(
          "Managed response replaced the original null failure or retained storage",
        );
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
        exactResponseBytes: responseBytes,
        scratchResponseDetached: true,
        responseFailures,
        originalNullStreamFailurePreserved: true,
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
