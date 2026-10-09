import { afterEach, expect, it, vi } from "vitest";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import {
  allocateRenderPixels,
  allocateRenderStorageAsync,
  createRenderStorage,
  readRenderImageData,
  withManagedMemory,
} from "../../packages/renderer-core/src/managed-memory-context.ts";

type ResourceRecord = { value?: object; destroy?: (value: object) => void };
const limits = { pixels: 32, metadata: 4096 };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function detach(value: object) {
  const buffer = value as ArrayBuffer & {
    transfer(bytes: number): ArrayBuffer;
  };
  if (buffer.byteLength) buffer.transfer(0);
}
function secondaryRelease(memory: ManagedMemory, afterCalls = 0) {
  const reserve = memory.reserve.bind(memory);
  vi.spyOn(memory, "reserve").mockImplementation((...args) => {
    const lease = reserve(...args),
      release = lease.release.bind(lease);
    let calls = 0;
    vi.spyOn(lease, "release").mockImplementation(() => {
      release();
      if (++calls > afterCalls) throw Error("secondary release");
    });
    return lease;
  });
}
function thrown(work: () => unknown): unknown {
  let reason: unknown = "not thrown";
  try {
    work();
  } catch (error) {
    reason = error;
  }
  return reason;
}
afterEach(() => vi.restoreAllMocks());

it("rejects a native handle retired by its successful initializer instead of publishing it after destruction", async () => {
  for (const route of ["scratch", "allocator", "consumer"]) {
    const memory = new ManagedMemory({ ...limits, pixels: 16 });
    let backing: ArrayBuffer | undefined,
      destroyed = 0,
      actual: ResourceRecord | undefined;
    const resources = Reflect.get(memory, "resources") as Map<
        MemoryLease,
        ResourceRecord
      >,
      set = resources.set.bind(resources);
    vi.spyOn(resources, "set").mockImplementation((key, value) => {
      actual = value;
      return set(key, value);
    });
    await withManagedMemory(memory, async () => {
      memory.beginScratch();
      expect(() =>
        createRenderStorage(
          16,
          () => ({ backing: (backing = new ArrayBuffer(16)) }),
          (value) => {
            if (route === "scratch") memory.endScratch();
            else if (route === "allocator") memory.dispose();
            else memory.release(value);
            expect(memory.statistics.current.pixels).toBe(16);
            expect(memory.owns(value)).toBe(true);
            expect(destroyed).toBe(0);
          },
          (value) => {
            destroyed++;
            expect(memory.owns(value)).toBe(true);
            expect(memory.statistics.current.pixels).toBe(16);
            detach(value.backing);
          },
          false,
        ),
      ).toThrow(/owner was disposed/);
      expect(destroyed).toBe(1);
      expect(actual).toEqual({});
      expect(backing!.byteLength).toBe(0);
      empty(memory);
      if (route === "consumer") memory.endScratch();
    });
    memory.dispose();
  }
});

it("rejects a generic owner retired during adoption and preserves actual finish null without repeating cleanup", () => {
  for (const failed of [false, true]) {
    const memory = new ManagedMemory({ ...limits, pixels: 16 }),
      adopt = memory.adopt.bind(memory);
    let backing: ArrayBuffer | undefined,
      destroyed = 0,
      fallbackCalls = 0,
      actual: ResourceRecord | undefined;
    const resources = Reflect.get(memory, "resources") as Map<
        MemoryLease,
        ResourceRecord
      >,
      set = resources.set.bind(resources);
    vi.spyOn(resources, "set").mockImplementation((key, value) => {
      actual = value;
      return set(key, value);
    });
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      adopt(...args);
      memory.dispose();
      expect(destroyed).toBe(0);
      expect(memory.statistics.current.pixels).toBe(16);
    });
    const reason = thrown(() =>
      memory.allocate(
        "pixels",
        16,
        () => (backing = new ArrayBuffer(16)),
        false,
        (value) => value,
        (value) => {
          destroyed++;
          expect(memory.owns(value)).toBe(true);
          expect(memory.statistics.current.pixels).toBe(16);
          detach(value);
          if (failed) throw null;
        },
        (value) => {
          fallbackCalls++;
          return value;
        },
      ),
    );
    if (failed) expect(reason).toBeNull();
    else expect(String(reason)).toMatch(/owner was disposed/);
    expect(destroyed).toBe(1);
    expect(fallbackCalls).toBe(0);
    expect(actual).toEqual({});
    expect(backing!.byteLength).toBe(0);
    empty(memory);
    vi.restoreAllMocks();
    memory.dispose();
  }
});

it("rejects pixel admission before the original factory or image method getter", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 15 });
  let factories = 0,
    methodGets = 0;
  const context = Object.defineProperty({}, "getImageData", {
    get() {
      methodGets++;
      throw Error("unexpected native getter");
    },
  });
  await withManagedMemory(memory, async () => {
    expect(() =>
      allocateRenderPixels(16, () => {
        factories++;
        return new Uint8Array(16);
      }),
    ).toThrow(/quota/);
    expect(() =>
      readRenderImageData(context as CanvasRenderingContext2D, 0, 0, 2, 2),
    ).toThrow(/quota/);
    expect(factories).toBe(0);
    expect(methodGets).toBe(0);
    empty(memory);
  });
  memory.dispose();
});

it("preserves original factory null over secondary release without invoking identity or failed identity", () => {
  const memory = new ManagedMemory(limits),
    identity = vi.fn((value: object) => value),
    failedIdentity = vi.fn((value: object) => value);
  secondaryRelease(memory);
  expect(
    thrown(() =>
      memory.allocate(
        "pixels",
        16,
        () => {
          throw null;
        },
        false,
        identity,
        detach,
        failedIdentity,
      ),
    ),
  ).toBeNull();
  expect(identity).not.toHaveBeenCalled();
  expect(failedIdentity).not.toHaveBeenCalled();
  empty(memory);
  memory.dispose();
});

it("captures a factory result through identity null and retires it while charged without repeating the identity", () => {
  const memory = new ManagedMemory({ ...limits, pixels: 16 });
  let actual: ArrayBuffer | undefined,
    calls = 0,
    fallbackCalls = 0,
    destroyed = 0;
  secondaryRelease(memory);
  const reason = thrown(() =>
    memory.allocate(
      "pixels",
      16,
      () => (actual = new ArrayBuffer(16)),
      false,
      () => {
        calls++;
        throw null;
      },
      (value) => {
        destroyed++;
        expect(value).toBe(actual);
        expect(memory.owns(value)).toBe(false);
        expect(memory.statistics.current.pixels).toBe(16);
        expect(memory.statistics.reservations).toBe(1);
        expect(() => memory.reserve("pixels", 1)).toThrow(/quota/);
        detach(value);
        throw Error("secondary fresh cleanup");
      },
      (value) => {
        fallbackCalls++;
        expect(value).toBe(actual);
        return value;
      },
    ),
  );
  expect(reason).toBeNull();
  expect(calls).toBe(1);
  expect(fallbackCalls).toBe(1);
  expect(destroyed).toBe(1);
  expect(actual!.byteLength).toBe(0);
  empty(memory);
  memory.dispose();
});

it("retains complete actual backing through pre/post adoption null, then preserves first null over fresh or installed cleanup", () => {
  for (const after of [false, true]) {
    const memory = new ManagedMemory({ ...limits, pixels: 16 }),
      adopt = memory.adopt.bind(memory);
    let actual: ArrayBuffer | undefined,
      destroyed = 0,
      fallbackCalls = 0;
    secondaryRelease(memory);
    vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
      expect(memory.statistics.current.pixels).toBe(16);
      if (after) adopt(value, lease, destroy);
      throw null;
    });
    expect(
      thrown(() =>
        memory.allocate(
          "pixels",
          16,
          () => (actual = new ArrayBuffer(16)),
          false,
          (value) => value,
          (value) => {
            destroyed++;
            expect(memory.owns(value)).toBe(after);
            expect(memory.statistics.current.pixels).toBe(16);
            expect(actual!.byteLength).toBe(16);
            detach(value);
            throw Error("secondary destructor");
          },
          (value) => {
            fallbackCalls++;
            return value;
          },
        ),
      ),
    ).toBeNull();
    expect(fallbackCalls).toBe(1);
    expect(destroyed).toBe(1);
    expect(actual!.byteLength).toBe(0);
    expect(memory.owns(actual!)).toBe(false);
    empty(memory);
    vi.restoreAllMocks();
    memory.dispose();
  }
});

it("rolls back actual partial resource registration before/after Map insertion, preserving insertion ownership order and prior owner", () => {
  for (const after of [false, true]) {
    const memory = new ManagedMemory({ ...limits, pixels: 24 });
    const prior = memory.allocate(
      "pixels",
      8,
      () => new ArrayBuffer(8),
      true,
      (v) => v,
      detach,
    );
    const map = Reflect.get(memory, "resources") as Map<
        MemoryLease,
        ResourceRecord
      >,
      nativeSet = map.set.bind(map);
    let actual: ArrayBuffer | undefined,
      record: ResourceRecord | undefined,
      destroyed = 0;
    vi.spyOn(map, "set").mockImplementation((lease, value) => {
      record = value;
      expect(value.value).toBe(actual);
      expect(memory.owns(value.value!)).toBe(true); // Preserve original WeakMap-before-Map ordering.
      expect(memory.statistics.current.pixels).toBe(24);
      if (after) nativeSet(lease, value);
      throw null;
    });
    secondaryRelease(memory);
    expect(
      thrown(() =>
        memory.allocate(
          "pixels",
          16,
          () => (actual = new ArrayBuffer(16)),
          false,
          (v) => v,
          (value) => {
            destroyed++;
            expect(memory.owns(value)).toBe(false); // adopt rolled its registration back.
            expect(memory.statistics.current.pixels).toBe(24);
            detach(value);
            throw Error("secondary fresh cleanup");
          },
          (v) => v,
        ),
      ),
    ).toBeNull();
    expect(record).toEqual({});
    expect(destroyed).toBe(1);
    expect(actual!.byteLength).toBe(0);
    expect(memory.owns(actual!)).toBe(false);
    expect(map.size).toBe(1);
    expect(memory.owns(prior)).toBe(true);
    expect(prior.byteLength).toBe(8);
    expect(memory.statistics.current.pixels).toBe(8);
    vi.restoreAllMocks();
    memory.release(prior);
    empty(memory);
    memory.dispose();
  }
});

it("leaves a rolled-back direct adoption lease reusable while clearing the real failed resource record", () => {
  for (const after of [false, true]) {
    const memory = new ManagedMemory({ ...limits, pixels: 16 }),
      lease = memory.reserve("pixels", 16),
      value = new ArrayBuffer(16);
    const map = Reflect.get(memory, "resources") as Map<
        MemoryLease,
        ResourceRecord
      >,
      nativeSet = map.set.bind(map);
    let record: ResourceRecord | undefined;
    const set = vi.spyOn(map, "set").mockImplementationOnce((key, next) => {
      record = next;
      expect(memory.owns(value)).toBe(true);
      if (after) nativeSet(key, next);
      throw null;
    });
    expect(thrown(() => memory.adopt(value, lease, detach))).toBeNull();
    expect(record).toEqual({});
    expect(lease.active).toBe(true);
    expect(memory.owns(value)).toBe(false);
    expect(value.byteLength).toBe(16); // adopt does not itself consume caller-owned product.
    expect(map.size).toBe(0);
    expect(memory.statistics.current.pixels).toBe(16);
    set.mockRestore();
    memory.adopt(value, lease, detach);
    memory.release(value);
    expect(value.byteLength).toBe(0);
    empty(memory);
    memory.dispose();
  }
});

it("rolls back WeakMap ownership insertion null before/after mutation without destroying a prior owner", () => {
  for (const after of [false, true]) {
    const memory = new ManagedMemory({ ...limits, pixels: 24 });
    const prior = memory.allocate(
      "pixels",
      8,
      () => new ArrayBuffer(8),
      true,
      (v) => v,
      detach,
    );
    const ownership = Reflect.get(memory, "ownership") as WeakMap<
        object,
        MemoryLease
      >,
      nativeSet = ownership.set.bind(ownership);
    const resources = Reflect.get(memory, "resources") as Map<
      MemoryLease,
      ResourceRecord
    >;
    let actual: ArrayBuffer | undefined,
      destroyed = 0;
    vi.spyOn(ownership, "set").mockImplementation((value, lease) => {
      expect(value).toBe(actual);
      expect(memory.owns(prior)).toBe(true);
      expect(memory.owns(value)).toBe(false);
      expect(memory.statistics.current.pixels).toBe(24);
      if (after) nativeSet(value, lease);
      throw null;
    });
    secondaryRelease(memory);
    expect(
      thrown(() =>
        memory.allocate(
          "pixels",
          16,
          () => (actual = new ArrayBuffer(16)),
          false,
          (v) => v,
          (value) => {
            destroyed++;
            expect(memory.owns(value)).toBe(false);
            expect(memory.statistics.current.pixels).toBe(24);
            detach(value);
            throw Error("secondary fresh cleanup");
          },
          (v) => v,
        ),
      ),
    ).toBeNull();
    expect(actual!.byteLength).toBe(0);
    expect(destroyed).toBe(1);
    expect(memory.owns(actual!)).toBe(false);
    expect(memory.owns(prior)).toBe(true);
    expect(prior.byteLength).toBe(8);
    expect(resources.size).toBe(1);
    expect(memory.statistics.current.pixels).toBe(8);
    vi.restoreAllMocks();
    memory.release(prior);
    empty(memory);
    memory.dispose();
  }
});

it("holds admission through factory-triggered scratch/allocator disposal, identity and actual unowned backing cleanup", () => {
  for (const route of ["scratch", "allocator"]) {
    const memory = new ManagedMemory({ ...limits, pixels: 16 });
    memory.beginScratch();
    let actual: ArrayBuffer | undefined,
      identityCalls = 0,
      destroyed = 0;
    const reason = thrown(() =>
      memory.allocate(
        "pixels",
        16,
        () => {
          expect(memory.statistics.current.pixels).toBe(16);
          if (route === "scratch") memory.endScratch();
          else memory.dispose();
          expect(memory.statistics.current.pixels).toBe(16);
          expect(memory.statistics.reservations).toBe(1);
          actual = new ArrayBuffer(16);
          expect(() => memory.reserve("pixels", 1)).toThrow(
            route === "scratch" ? /quota/ : /disposed/,
          );
          return actual;
        },
        false,
        (value) => {
          identityCalls++;
          expect(memory.statistics.current.pixels).toBe(16);
          return value;
        },
        (value) => {
          destroyed++;
          expect(memory.statistics.current.pixels).toBe(16);
          expect(memory.owns(value)).toBe(false);
          detach(value);
        },
        (value) => value,
      ),
    );
    expect(String(reason)).toMatch(/no active owner/);
    expect(identityCalls).toBe(1);
    expect(destroyed).toBe(1);
    expect(actual!.byteLength).toBe(0);
    empty(memory);
    memory.dispose();
  }
});

it("preserves first factory null after reentrant disposal and settles its hold despite a secondary release error", () => {
  for (const route of ["scratch", "allocator"]) {
    const memory = new ManagedMemory({ ...limits, pixels: 16 });
    memory.beginScratch();
    secondaryRelease(memory, 1);
    expect(
      thrown(() =>
        memory.allocate("pixels", 16, () => {
          if (route === "scratch") memory.endScratch();
          else memory.dispose();
          expect(memory.statistics.current.pixels).toBe(16);
          throw null;
        }),
      ),
    ).toBeNull();
    empty(memory);
    vi.restoreAllMocks();
    memory.dispose();
  }
});

it("holds fresh synchronous native storage factory through disposal-before-return and charged actual cleanup", async () => {
  for (const route of ["scratch", "allocator"]) {
    const memory = new ManagedMemory({ ...limits, pixels: 16 });
    let actual: { backing: ArrayBuffer } | undefined,
      initialized = 0,
      destroyed = 0;
    await withManagedMemory(memory, async () => {
      memory.beginScratch();
      const reason = thrown(() =>
        createRenderStorage(
          16,
          () => {
            expect(memory.statistics.current.pixels).toBe(16);
            if (route === "scratch") memory.endScratch();
            else memory.dispose();
            expect(memory.statistics.current.pixels).toBe(16);
            expect(memory.statistics.reservations).toBe(1);
            actual = { backing: new ArrayBuffer(16) };
            return actual;
          },
          () => {
            initialized++;
          },
          (value) => {
            destroyed++;
            expect(value).toBe(actual);
            expect(memory.owns(value)).toBe(false);
            expect(memory.statistics.current.pixels).toBe(16);
            detach(value.backing);
            throw Error("secondary native cleanup");
          },
          false,
        ),
      );
      expect(String(reason)).toMatch(/no active owner/);
      expect(initialized).toBe(0);
      expect(destroyed).toBe(1);
      expect(actual!.backing.byteLength).toBe(0);
      empty(memory);
    });
    memory.dispose();
  }
});

it("holds a fresh asynchronous native factory across await and disposal-before-return until charged actual cleanup", async () => {
  for (const route of ["scratch", "allocator"]) {
    const memory = new ManagedMemory({ ...limits, pixels: 16 });
    let actual: { backing: ArrayBuffer } | undefined,
      destroyed = 0;
    await withManagedMemory(memory, async () => {
      memory.beginScratch();
      await expect(
        allocateRenderStorageAsync(
          16,
          async () => {
            if (route === "scratch") memory.endScratch();
            else memory.dispose();
            expect(memory.statistics.current.pixels).toBe(16);
            expect(memory.statistics.reservations).toBe(1);
            await Promise.resolve();
            expect(memory.statistics.current.pixels).toBe(16);
            actual = { backing: new ArrayBuffer(16) };
            return actual;
          },
          (value) => {
            destroyed++;
            expect(value).toBe(actual);
            expect(memory.owns(value)).toBe(false);
            expect(memory.statistics.current.pixels).toBe(16);
            detach(value.backing);
            throw Error("secondary native cleanup");
          },
        ),
      ).rejects.toThrow(/no active owner/);
      expect(destroyed).toBe(1);
      expect(actual!.backing.byteLength).toBe(0);
      empty(memory);
    });
    memory.dispose();
  }
});

it("preserves first synchronous/asynchronous native factory null after disposal and settles all held admission", async () => {
  for (const async of [false, true])
    for (const route of ["scratch", "allocator"]) {
      const memory = new ManagedMemory({ ...limits, pixels: 16 });
      let destroyed = 0;
      await withManagedMemory(memory, async () => {
        memory.beginScratch();
        secondaryRelease(memory, 1);
        const fail = () => {
          if (route === "scratch") memory.endScratch();
          else memory.dispose();
          expect(memory.statistics.current.pixels).toBe(16);
          throw null;
        };
        if (async)
          await expect(
            allocateRenderStorageAsync(
              16,
              async () => fail(),
              () => {
                destroyed++;
              },
            ),
          ).rejects.toBeNull();
        else
          expect(
            thrown(() =>
              createRenderStorage(
                16,
                fail,
                () => {},
                () => {
                  destroyed++;
                },
                false,
              ),
            ),
          ).toBeNull();
        expect(destroyed).toBe(0);
        empty(memory);
      });
      vi.restoreAllMocks();
      memory.dispose();
    }
});

it("recovers actual native typed/DataView backing after the original buffer getter null without repeating that getter", async () => {
  const makers: ((buffer: ArrayBuffer) => ArrayBufferView)[] = [
    (b) => new Uint8Array(b),
    (b) => new Uint8ClampedArray(b),
    (b) => new Float32Array(b),
    (b) => new DataView(b),
  ];
  for (const make of makers) {
    const memory = new ManagedMemory({ ...limits, pixels: 16 });
    let backing: ArrayBuffer | undefined,
      actual: ArrayBufferView | undefined,
      gets = 0;
    await withManagedMemory(memory, async () => {
      secondaryRelease(memory);
      expect(
        thrown(() =>
          allocateRenderPixels(16, () => {
            backing = new ArrayBuffer(16);
            actual = make(backing);
            Object.defineProperty(actual, "buffer", {
              get() {
                gets++;
                throw null;
              },
            });
            return actual;
          }),
        ),
      ).toBeNull();
      expect(gets).toBe(1);
      expect(backing!.byteLength).toBe(0);
      expect(memory.owns(backing!)).toBe(false);
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});

it("retires actual ArrayBuffer and view products after pre/post adoption null with exact original buffer reads", async () => {
  const makers: ((buffer: ArrayBuffer) => ArrayBuffer | ArrayBufferView)[] = [
    (b) => b,
    (b) => new Uint8Array(b),
    (b) => new DataView(b),
  ];
  for (const make of makers)
    for (const after of [false, true]) {
      const memory = new ManagedMemory({ ...limits, pixels: 16 }),
        adopt = memory.adopt.bind(memory);
      let backing: ArrayBuffer | undefined,
        bufferGets = 0;
      await withManagedMemory(memory, async () => {
        secondaryRelease(memory);
        vi.spyOn(memory, "adopt").mockImplementation(
          (value, lease, destroy) => {
            expect(value).toBe(backing);
            expect(memory.statistics.current.pixels).toBe(16);
            if (after) adopt(value, lease, destroy);
            throw null;
          },
        );
        expect(
          thrown(() =>
            allocateRenderPixels(16, () => {
              backing = new ArrayBuffer(16);
              const product = make(backing);
              if (ArrayBuffer.isView(product))
                Object.defineProperty(product, "buffer", {
                  get() {
                    bufferGets++;
                    return backing;
                  },
                });
              return product;
            }),
          ),
        ).toBeNull();
        expect(bufferGets).toBe(make === makers[0] ? 0 : 1);
        expect(backing!.byteLength).toBe(0);
        empty(memory);
      });
      vi.restoreAllMocks();
      memory.dispose();
    }
});

it("preserves a duplicate same-allocator backing and its real bytes without repeated user buffer reads", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const prior = allocateRenderPixels(16, () => new Uint8Array(16).fill(27));
    const backing = prior.buffer;
    let gets = 0;
    Object.defineProperty(prior, "buffer", {
      get() {
        gets++;
        return backing;
      },
    });
    expect(() => allocateRenderPixels(16, () => prior)).toThrow(
      /already owned/,
    );
    expect(gets).toBe(1);
    expect(memory.owns(backing)).toBe(true);
    expect(memory.statistics.current.pixels).toBe(16);
    expect(memory.statistics.reservations).toBe(1);
    expect([...prior]).toEqual(Array(16).fill(27));
    memory.release(backing);
    expect(backing.byteLength).toBe(0);
    empty(memory);
  });
  memory.dispose();
});

it("clears a fresh native backing when its overridden buffer getter returns a different already-owned alias", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const prior = allocateRenderPixels(16, () => new Uint8Array(16).fill(49)),
      borrowed = prior.buffer;
    let fresh: ArrayBuffer | undefined,
      gets = 0;
    expect(() =>
      allocateRenderPixels(16, () => {
        fresh = new ArrayBuffer(16);
        const product = new Uint8Array(fresh);
        Object.defineProperty(product, "buffer", {
          get() {
            gets++;
            return borrowed;
          },
        });
        return product;
      }),
    ).toThrow(/already owned/);
    expect(gets).toBe(1);
    expect(fresh!.byteLength).toBe(0);
    expect(borrowed.byteLength).toBe(16);
    expect(memory.owns(borrowed)).toBe(true);
    expect([...prior]).toEqual(Array(16).fill(49));
    expect(memory.statistics.current.pixels).toBe(16);
    memory.release(borrowed);
    empty(memory);
  });
  memory.dispose();
});

it("attempts native actual detachment after original backing destructor null without repeating successful property gets", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 16 });
  const nativeLength = Object.getOwnPropertyDescriptor(
    ArrayBuffer.prototype,
    "byteLength",
  )!.get!;
  let backing: ArrayBuffer | undefined;
  const trace: string[] = [];
  await withManagedMemory(memory, async () => {
    const view = allocateRenderPixels(16, () => new Uint8Array(16));
    backing = view.buffer;
    Object.defineProperty(backing, "byteLength", {
      get() {
        trace.push("length:get");
        return nativeLength.call(backing) as number;
      },
    });
    Object.defineProperty(backing, "transfer", {
      get() {
        trace.push("transfer:get");
        return function (this: ArrayBuffer, bytes: number) {
          trace.push("transfer:call");
          expect(this).toBe(backing);
          expect(bytes).toBe(0);
          expect(memory.owns(this)).toBe(true);
          expect(memory.statistics.current.pixels).toBe(16);
          expect(nativeLength.call(this)).toBe(16);
          throw null;
        };
      },
    });
    expect(thrown(() => memory.release(backing!))).toBeNull();
    expect(trace).toEqual(["length:get", "transfer:get", "transfer:call"]);
    expect(nativeLength.call(backing)).toBe(0);
    expect(memory.owns(backing)).toBe(false);
    empty(memory);
  });
  memory.dispose();
});

function imageFixture(trace: unknown[], failBuffer = false) {
  let backing: ArrayBuffer | undefined, image: object | undefined;
  const context = Object.defineProperty({}, "getImageData", {
    get() {
      trace.push("method:get");
      return function (this: object, ...args: number[]) {
        expect(this).toBe(context);
        trace.push(["method:call", ...args]);
        backing = new ArrayBuffer(16);
        const data = new Uint8ClampedArray(backing);
        Object.defineProperty(data, "buffer", {
          get() {
            trace.push("buffer:get");
            if (failBuffer) throw null;
            return backing;
          },
        });
        image = Object.defineProperty({}, "data", {
          get() {
            trace.push("data:get");
            return data;
          },
        });
        return image;
      };
    },
  });
  return {
    context: context as CanvasRenderingContext2D,
    backing: () => backing!,
    image: () => image!,
  };
}

it("preserves successful managed readback method/data/buffer receiver and read sequence exactly", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 16 }),
    trace: unknown[] = [],
    fixture = imageFixture(trace);
  await withManagedMemory(memory, async () => {
    const result = readRenderImageData(fixture.context, 3, 4, 2, 2);
    expect(result).toBe(fixture.image());
    expect(trace).toEqual([
      "method:get",
      ["method:call", 3, 4, 2, 2],
      "data:get",
      "buffer:get",
    ]);
    expect(memory.owns(fixture.backing())).toBe(true);
    expect(fixture.backing().byteLength).toBe(16);
    memory.release(fixture.backing());
    expect(fixture.backing().byteLength).toBe(0);
    empty(memory);
  });
  memory.dispose();
});

it("cleans the original completed fake ImageData data view after buffer getter null without repeating data or buffer reads", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 16 }),
    trace: unknown[] = [],
    fixture = imageFixture(trace, true);
  await withManagedMemory(memory, async () => {
    secondaryRelease(memory);
    expect(
      thrown(() => readRenderImageData(fixture.context, 3, 4, 2, 2)),
    ).toBeNull();
    expect(trace).toEqual([
      "method:get",
      ["method:call", 3, 4, 2, 2],
      "data:get",
      "buffer:get",
    ]);
    expect(fixture.backing().byteLength).toBe(0);
    empty(memory);
  });
  vi.restoreAllMocks();
  memory.dispose();
});

it("retains inactive pixel factory identity and native readback order without resolving or cleaning backing", () => {
  const trace: unknown[] = [],
    fixture = imageFixture(trace, true);
  const result = readRenderImageData(fixture.context, 3, 4, 2, 2);
  expect(result).toBe(fixture.image());
  expect(trace).toEqual(["method:get", ["method:call", 3, 4, 2, 2]]);
  expect(fixture.backing().byteLength).toBe(16);
  let gets = 0;
  const backing = new ArrayBuffer(16),
    view = new Uint8Array(backing);
  Object.defineProperty(view, "buffer", {
    get() {
      gets++;
      throw null;
    },
  });
  expect(allocateRenderPixels(16, () => view)).toBe(view);
  expect(gets).toBe(0);
  expect(backing.byteLength).toBe(16);
  detach(backing);
  detach(fixture.backing());
});
