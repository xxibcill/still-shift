import { expect, it } from "vitest";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  allocateRenderPixels,
  withManagedMemory,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  captureFrameBlob,
  withManagedFrame,
} from "../../packages/execution-runtime/src/composition-frame-capture.ts";

const capacity = 4 * 2 * 3 + 3 + 1048576;
it("denies encoded capture before invoking the native encoder", async () => {
  const memory = new ManagedMemory({ pixels: capacity - 1, metadata: 8 });
  let encodes = 0;
  const canvas = {
    width: 2,
    height: 3,
    toBlob() {
      encodes++;
    },
  } as unknown as HTMLCanvasElement;
  try {
    await withManagedMemory(memory, () =>
      withManagedFrame(async () => {
        await expect(captureFrameBlob(canvas, "image/png")).rejects.toThrow(
          "aggregate worker quota",
        );
      }),
    );
    expect(encodes).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
  } finally {
    memory.dispose();
  }
});
it("retains the pre-admitted producer through capture and the actual consumer promise", async () => {
  const memory = new ManagedMemory({ pixels: capacity, metadata: 8 });
  let complete!: BlobCallback, acknowledge!: () => void;
  let nativeCapacity = 0;
  let ready!: () => void;
  const consuming = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const canvas = {
    width: 2,
    height: 3,
    toBlob(callback: BlobCallback) {
      nativeCapacity = memory.statistics.current.pixels;
      complete = callback;
    },
  } as unknown as HTMLCanvasElement;
  try {
    await withManagedMemory(memory, async () => {
      const frame = withManagedFrame(async () => {
        const blob = await captureFrameBlob(canvas, "image/png");
        expect(blob.size).toBe(3);
        expect(memory.statistics.current.pixels).toBe(3);
        await new Promise<void>((resolve) => {
          acknowledge = resolve;
          ready();
        });
      });
      expect(nativeCapacity).toBe(capacity);
      expect(memory.statistics.current.pixels).toBe(capacity);
      complete(new Blob([new Uint8Array([1, 2, 3])]));
      await consuming;
      expect(memory.hasScratch).toBe(true);
      expect(memory.statistics.current.pixels).toBe(3);
      acknowledge();
      await frame;
      expect(memory.hasScratch).toBe(false);
      expect(memory.statistics.reservations).toBe(0);
    });
  } finally {
    memory.dispose();
  }
});
it("releases raw scratch after failed acknowledgement and preserves original null over secondary cleanup", async () => {
  const memory = new ManagedMemory({ pixels: 32, metadata: 8 });
  let bytes!: Uint8Array;
  await withManagedMemory(memory, async () => {
    let reason: unknown = "not thrown";
    try {
      await withManagedFrame(async () => {
        bytes = allocateRenderPixels(16, () => new Uint8Array(16));
        memory.reserve("pixels", 16, () => {
          throw Error("secondary");
        });
        await Promise.resolve();
        throw null;
      });
    } catch (error) {
      reason = error;
    }
    expect(reason).toBe(null);
    expect(bytes.byteLength).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
  });
  memory.dispose();
});
it("rejects late native capture completion after allocator disposal", async () => {
  const memory = new ManagedMemory({ pixels: capacity, metadata: 8 });
  let complete!: BlobCallback;
  const canvas = {
    width: 2,
    height: 3,
    toBlob(callback: BlobCallback) {
      complete = callback;
    },
  } as unknown as HTMLCanvasElement;
  await withManagedMemory(memory, async () => {
    const capture = captureFrameBlob(canvas, "image/png");
    memory.dispose();
    complete(new Blob([new Uint8Array([1])]));
    await expect(capture).rejects.toThrow("no active owner");
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves failed native capture and releases the reserved encoded capacity", async () => {
  const memory = new ManagedMemory({ pixels: capacity, metadata: 8 });
  const canvas = {
    width: 2,
    height: 3,
    toBlob(callback: BlobCallback) {
      callback(null);
    },
  } as unknown as HTMLCanvasElement;
  try {
    await withManagedMemory(memory, () =>
      withManagedFrame(async () => {
        await expect(captureFrameBlob(canvas, "image/png")).rejects.toThrow(
          "image/png frame capture failed",
        );
      }),
    );
    expect(memory.statistics.reservations).toBe(0);
  } finally {
    memory.dispose();
  }
});

it("preserves original null from a native encoder invocation after admission", async () => {
  const memory = new ManagedMemory({ pixels: capacity, metadata: 8 });
  const canvas = {
    width: 2,
    height: 3,
    toBlob() {
      throw null;
    },
  } as unknown as HTMLCanvasElement;
  try {
    await withManagedMemory(memory, async () => {
      let reason: unknown = "not thrown";
      try {
        await withManagedFrame(async () => {
          await captureFrameBlob(canvas, "image/png");
        });
      } catch (error) {
        reason = error;
      }
      expect(reason).toBe(null);
      expect(memory.statistics.reservations).toBe(0);
    });
  } finally {
    memory.dispose();
  }
});
