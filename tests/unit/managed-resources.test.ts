import { expect, it } from "vitest";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  allocateRenderPixels,
  allocateRenderStorageAsync,
  createRenderStorageAsync,
  withManagedMemory,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  mapRenderResources,
  prepareRenderResources,
  readRenderAssetBody,
} from "../../packages/renderer-core/src/managed-resources.ts";

it("commits successful native/input owners after nested resource loading", async () => {
  const memory = new ManagedMemory({ pixels: 32, metadata: 8 });
  let destroyed = 0;
  const pixels = await withManagedMemory(memory, async () => {
    const pixels = await prepareRenderResources(async () => {
      const input = allocateRenderPixels(16, () => new Uint8Array(16));
      await prepareRenderResources(async () => {
        await createRenderStorageAsync(
          16,
          () => ({}),
          async () => {},
          () => {
            destroyed++;
          },
          false,
        );
      });
      return input;
    });
    memory.beginScratch();
    memory.endScratch();
    expect(memory.statistics.current.pixels).toBe(32);
    expect(pixels.byteLength).toBe(16);
    return pixels;
  });
  memory.dispose();
  expect(destroyed).toBe(1);
  expect(pixels.byteLength).toBe(0);
  expect(memory.statistics.reservations).toBe(0);
});
it("rolls back a whole nested failed load and preserves original null decoder errors", async () => {
  const memory = new ManagedMemory({ pixels: 32, metadata: 8 });
  let destroyed = 0;
  await withManagedMemory(memory, async () => {
    let reason: unknown = "not thrown";
    try {
      await prepareRenderResources(async () => {
        allocateRenderPixels(16, () => new Uint8Array(16));
        await prepareRenderResources(async () => {
          await createRenderStorageAsync(
            16,
            () => ({}),
            async () => {
              throw null;
            },
            () => {
              destroyed++;
              throw Error("secondary cleanup");
            },
            false,
          );
        });
      });
    } catch (error) {
      reason = error;
    }
    expect(reason).toBe(null);
    expect(destroyed).toBe(1);
    expect(memory.statistics.current.pixels).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    expect(memory.hasScratch).toBe(false);
  });
  memory.dispose();
});
it("denies decode before invoking its native handle factory", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  let factories = 0;
  await withManagedMemory(memory, async () => {
    await expect(
      prepareRenderResources(async () => {
        allocateRenderPixels(16, () => new Uint8Array(16));
        await createRenderStorageAsync(
          1,
          () => {
            factories++;
            return {};
          },
          async () => {},
          () => {},
          false,
        );
      }),
    ).rejects.toThrow("aggregate worker quota");
    expect(factories).toBe(0);
    expect(memory.statistics.current.pixels).toBe(0);
  });
  memory.dispose();
});
it("serializes managed loads and starts no later decoder after a failure", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  const order: string[] = [];
  await withManagedMemory(memory, async () => {
    await expect(
      mapRenderResources([0, 1, 2], async (item) => {
        order.push("start" + item);
        await Promise.resolve();
        order.push("end" + item);
        if (item === 1) throw Error("decode failed");
        return item;
      }),
    ).rejects.toThrow("decode failed");
  });
  expect(order).toEqual(["start0", "end0", "start1", "end1"]);
  memory.dispose();
});
it("rejects late native registration after allocator disposal and destroys that registration", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  let registered = false;
  await withManagedMemory(memory, async () => {
    await expect(
      createRenderStorageAsync(
        16,
        () => ({}),
        async () => {
          memory.dispose();
          await Promise.resolve();
          registered = true;
        },
        () => {
          registered = false;
        },
        false,
      ),
    ).rejects.toThrow("owner was disposed");
    expect(registered).toBe(false);
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("requires the exact body size before managed body allocation or reader acquisition", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  await withManagedMemory(memory, async () => {
    const response = new Response(new Uint8Array([1, 2, 3]));
    let readers = 0;
    response.body!.getReader = () => {
      readers++;
      throw Error("unexpected body read");
    };
    await expect(readRenderAssetBody(response)).rejects.toThrow(
      "exact Content-Length",
    );
    expect(readers).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
  });
  memory.dispose();
});

it("releases a failed asynchronous producer reservation even when native cleanup throws", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  let destroyed = 0;
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    await expect(
      allocateRenderStorageAsync(
        16,
        async () => {
          memory.endScratch();
          return {};
        },
        () => {
          destroyed++;
          throw Error("secondary native cleanup");
        },
      ),
    ).rejects.toThrow("no active owner");
    expect(destroyed).toBe(1);
    expect(memory.statistics.reservations).toBe(0);
  });
  memory.dispose();
});
it("does not destroy a borrowed owner if an asynchronous producer returns it again", async () => {
  const memory = new ManagedMemory({ pixels: 32, metadata: 8 });
  let destroyed = 0;
  await withManagedMemory(memory, async () => {
    const borrowed = memory.allocate("pixels", 16, () => ({}));
    await expect(
      allocateRenderStorageAsync(
        16,
        async () => borrowed,
        () => {
          destroyed++;
        },
      ),
    ).rejects.toThrow("already owned resource");
    expect(destroyed).toBe(0);
    expect(memory.statistics.current.pixels).toBe(16);
    expect(memory.owns(borrowed)).toBe(true);
    memory.release(borrowed);
  });
  memory.dispose();
});

it("waits for a started nested decoder before rolling back the original failed phase", async () => {
  const memory = new ManagedMemory({ pixels: 32, metadata: 8 });
  let finish!: () => void;
  let destroyed = false;
  await withManagedMemory(memory, async () => {
    let nested!: Promise<object>;
    const root = prepareRenderResources(async () => {
      allocateRenderPixels(16, () => new Uint8Array(16));
      nested = prepareRenderResources(() =>
        createRenderStorageAsync(
          16,
          () => ({}),
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
          () => {
            destroyed = true;
          },
          false,
        ),
      );
      await Promise.resolve();
      throw null;
    });
    let rootSettled = false;
    void root.then(
      () => {
        rootSettled = true;
      },
      () => {
        rootSettled = true;
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(memory.hasScratch).toBe(true);
    expect(rootSettled).toBe(false);
    finish();
    await nested;
    let reason: unknown = "not thrown";
    try {
      await root;
    } catch (error) {
      reason = error;
    }
    expect(reason).toBe(null);
    expect(destroyed).toBe(true);
    expect(memory.statistics.reservations).toBe(0);
    expect(memory.hasScratch).toBe(false);
  });
  memory.dispose();
});

it("fails the complete preparation when a concurrently started child load rejects", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 8 });
  await withManagedMemory(memory, async () => {
    let child!: Promise<void>;
    const root = prepareRenderResources(async () => {
      allocateRenderPixels(16, () => new Uint8Array(16));
      child = prepareRenderResources(async () => {
        throw null;
      });
      void child.catch(() => {});
    });
    let reason: unknown = "not thrown";
    try {
      await root;
    } catch (error) {
      reason = error;
    }
    expect(reason).toBe(null);
    expect(memory.statistics.reservations).toBe(0);
  });
  memory.dispose();
});
