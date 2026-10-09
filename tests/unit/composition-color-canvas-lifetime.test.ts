import { afterEach, expect, it, vi } from "vitest";
import { colorEffectKernel } from "../../packages/renderer-core/src/composition/render/color-effects.ts";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

type Kernel = NonNullable<ReturnType<typeof colorEffectKernel>>;
type Context = Parameters<NonNullable<Kernel["renderCanvas"]>>[0];
type Surface = Parameters<NonNullable<Kernel["renderCanvas"]>>[1];
type Work = {
  memory?: ManagedMemory;
  pixel?: object;
  image?: ImageData;
  backing?: ArrayBuffer;
  input?: Surface;
  output?: Surface;
  pixelLease?: MemoryLease;
};
type Resource = { value?: object; destroy?: (value: object) => void };
type Captured = { owner: object; lease: MemoryLease; record: Resource };
const limits = { pixels: 4194304, metadata: 2097152 };
const params = { amount: 0.5 };
const originalPixels = [
  10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
];
const expectedPixels = [
  128, 128, 128, 255, 128, 128, 127, 255, 128, 128, 128, 255, 128, 128, 128,
  255,
];
const nativeBuffer = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  "buffer",
)!.get!;
function resources(memory: ManagedMemory) {
  return Reflect.get(memory, "resources") as Map<MemoryLease, Resource>;
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
  expect(resources(memory).size).toBe(0);
}
function capture(
  memory: ManagedMemory,
  transform?: (
    item: Captured,
    destroy?: (value: object) => void,
  ) => (value: object) => void,
) {
  const adopt = memory.adopt.bind(memory),
    items: Captured[] = [];
  vi.spyOn(memory, "adopt").mockImplementation((owner, lease, destroy) => {
    const item: Captured = { owner, lease, record: {} };
    adopt(owner, lease, transform?.(item, destroy) ?? destroy);
    item.record = resources(memory).get(lease)!;
    items.push(item);
  });
  return items;
}
/** Node unit fixture for the ImageData native accessor seam. The backing/view
 * are actual native products; genuine browser ImageData acceptance is separate. */
function imageFixture() {
  const values = new WeakMap<object, Uint8ClampedArray<ArrayBuffer>>();
  let nativeGets = 0;
  class FixtureImageData {
    constructor(data: Uint8ClampedArray<ArrayBuffer>) {
      values.set(this, data);
    }
    get data() {
      nativeGets++;
      const data = values.get(this);
      if (!data) throw TypeError("ImageData brand");
      return data;
    }
  }
  vi.stubGlobal("ImageData", FixtureImageData);
  const data = new Uint8ClampedArray(originalPixels),
    backing = data.buffer;
  const image = new FixtureImageData(data) as unknown as ImageData;
  return { image, data, backing, nativeGets: () => nativeGets };
}
function harness(
  image: ImageData,
  put?: (image: ImageData) => void,
  read?: () => ImageData,
) {
  const committed = [...originalPixels],
    getImageData = vi.fn(read ?? (() => image));
  const input = {
    width: 2,
    height: 2,
    ctx: { getImageData },
  } as unknown as Surface;
  const putImageData = vi.fn((value: ImageData) => {
    put?.(value);
    committed.splice(0, committed.length, ...value.data);
  });
  const output = {
    width: 2,
    height: 2,
    ctx: { putImageData },
  } as unknown as Surface;
  const createSurface = vi.fn(() => output),
    context = { createSurface } as unknown as Context;
  return {
    input,
    output,
    context,
    createSurface,
    getImageData,
    putImageData,
    committed,
  };
}
function backingFailure(
  memory: ManagedMemory,
  backing: ArrayBuffer,
  order: string[],
) {
  Object.defineProperty(backing, "transfer", {
    configurable: true,
    get() {
      order.push("transfer");
      expect(memory.statistics.current.pixels).toBeGreaterThanOrEqual(16);
      expect(backing.byteLength).toBe(16);
      throw null;
    },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps actual Canvas parent, ImageData reference and native backing alive through a disposing putImageData", async () => {
  const memory = new ManagedMemory(limits),
    fixture = imageFixture(),
    captured = capture(memory);
  let parent: Captured | undefined;
  const h = harness(fixture.image, (image) => {
    parent = captured.find((item) => item.lease.bytes === 16384)!;
    const work = parent.owner as Work,
      before = memory.statistics.current.metadata;
    memory.dispose();
    expect(memory.statistics.current).toEqual({
      pixels: 16,
      metadata: before - 4096,
    });
    expect(memory.owns(parent.owner)).toBe(true);
    expect(parent.record.value).toBe(parent.owner);
    expect(parent.lease.active).toBe(false);
    expect(work.input).toBe(h.input);
    expect(work.output).toBe(h.output);
    expect(work.image).toBe(image);
    expect(work.memory).toBe(memory);
    expect(work.pixel).toEqual({});
    expect(fixture.backing.byteLength).toBe(16);
    expect(memory.owns(fixture.backing)).toBe(true);
    expect([...fixture.data]).toEqual(expectedPixels);
    expect(resources(memory).get(work.pixelLease!)?.value).toBe(
      fixture.backing,
    );
  });
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!;
    expect(kernel.renderCanvas!(h.context, h.input, params)).toBe(h.output);
    expect(h.committed).toEqual(expectedPixels);
    expect(parent!.owner).toEqual({});
    expect(parent!.record).toEqual({});
    expect(fixture.backing.byteLength).toBe(0);
    expect(fixture.data.byteLength).toBe(0);
    empty(memory);
  });
});

it("keeps independently released and scratch-retired actual image backing live until its native consumer exits", async () => {
  for (const scratch of [false, true]) {
    const memory = new ManagedMemory(limits),
      fixture = imageFixture(),
      captured = capture(memory);
    const h = harness(fixture.image, () => {
      const parent = captured.find((item) => item.lease.bytes === 16384)!;
      const child = captured.find((item) => item.owner === fixture.backing)!;
      const before = memory.statistics.current;
      if (scratch) memory.endScratch();
      else child.lease.release();
      expect(parent.lease.active).toBe(!scratch);
      expect(child.lease.active).toBe(false);
      expect(memory.owns(parent.owner)).toBe(true);
      expect(memory.owns(child.owner)).toBe(true);
      expect(child.record.value).toBe(fixture.backing);
      expect(memory.statistics.current).toEqual(before);
      expect(fixture.backing.byteLength).toBe(16);
      expect([...fixture.data]).toEqual(expectedPixels);
    });
    await withManagedMemory(memory, async () => {
      const kernel = colorEffectKernel("color.invert")!;
      if (scratch) memory.beginScratch();
      expect(kernel.renderCanvas!(h.context, h.input, params)).toBe(h.output);
      expect(h.committed).toEqual(expectedPixels);
      expect(fixture.backing.byteLength).toBe(0);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 12288 });
      memory.dispose();
      empty(memory);
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("settles the exception-local Canvas parent hold when adoption disposes and throws null before returning work", async () => {
  const memory = new ManagedMemory(limits),
    fixture = imageFixture(),
    adopt = memory.adopt.bind(memory);
  let parent: object | undefined, record: Resource | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((owner, lease, destroy) => {
    adopt(owner, lease, destroy);
    if (lease.bytes === 16384) {
      parent = owner;
      record = resources(memory).get(lease)!;
      memory.dispose();
      expect(memory.owns(owner)).toBe(true);
      expect(record.value).toBe(owner);
      expect((owner as Work).pixel).toEqual({});
      throw null;
    }
  });
  const h = harness(fixture.image);
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!;
    let failed = false,
      reason: unknown;
    try {
      kernel.renderCanvas!(h.context, h.input, params);
    } catch (error) {
      failed = true;
      reason = error;
    }
    expect(failed).toBe(true);
    expect(reason).toBe(null);
    expect(parent).toEqual({});
    expect(record).toEqual({});
    expect(h.createSurface).toHaveBeenCalledTimes(0);
    expect(h.getImageData).toHaveBeenCalledTimes(0);
    empty(memory);
  });
});

it("recovers actual native backing after original data/buffer null without repeating those original Gets or destruction", async () => {
  for (const cut of ["data", "buffer"]) {
    const memory = new ManagedMemory(limits),
      fixture = imageFixture(),
      order: string[] = [];
    backingFailure(memory, fixture.backing, order);
    Object.defineProperty(fixture.image, "data", {
      configurable: true,
      get() {
        order.push("data");
        expect(memory.statistics.current.pixels).toBe(16);
        if (cut === "data") throw null;
        return fixture.data;
      },
    });
    Object.defineProperty(fixture.data, "buffer", {
      configurable: true,
      get() {
        order.push("buffer");
        expect(memory.statistics.current.pixels).toBe(16);
        throw null;
      },
    });
    const h = harness(fixture.image);
    await withManagedMemory(memory, async () => {
      const kernel = colorEffectKernel("color.invert")!;
      let failed = false,
        reason: unknown;
      try {
        kernel.renderCanvas!(h.context, h.input, params);
      } catch (error) {
        failed = true;
        reason = error;
      }
      expect(failed).toBe(true);
      expect(reason).toBe(null);
      expect(order).toEqual(
        cut === "data" ? ["data", "transfer"] : ["data", "buffer", "transfer"],
      );
      expect(fixture.nativeGets()).toBe(1);
      expect(fixture.backing.byteLength).toBe(0);
      expect(h.putImageData).toHaveBeenCalledTimes(0);
      expect(h.committed).toEqual(originalPixels);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 12288 });
      memory.dispose();
      empty(memory);
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("preserves a known same-allocator alias from a misleading original data/buffer Get and detaches the actual fresh image backing", async () => {
  for (const cut of ["data", "buffer"]) {
    const memory = new ManagedMemory(limits),
      fixture = imageFixture();
    const prior = memory.allocate(
      "pixels",
      16,
      () => new ArrayBuffer(16),
      true,
      (value) => value,
      (value) =>
        (
          value as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
        ).transfer(0),
    );
    const priorView = new Uint8ClampedArray(prior);
    priorView.fill(77);
    let gets = 0;
    if (cut === "data")
      Object.defineProperty(fixture.image, "data", {
        configurable: true,
        get() {
          gets++;
          return priorView;
        },
      });
    else
      Object.defineProperty(fixture.data, "buffer", {
        configurable: true,
        get() {
          gets++;
          return prior;
        },
      });
    const h = harness(fixture.image);
    await withManagedMemory(memory, async () => {
      const kernel = colorEffectKernel("color.invert")!;
      expect(() => kernel.renderCanvas!(h.context, h.input, params)).toThrow(
        /already owned/,
      );
      expect(gets).toBe(1);
      expect(fixture.backing.byteLength).toBe(0);
      expect(prior.byteLength).toBe(16);
      expect([...priorView]).toEqual(Array(16).fill(77));
      expect(memory.owns(prior)).toBe(true);
      expect(h.committed).toEqual(originalPixels);
      expect(memory.statistics.current).toEqual({
        pixels: 16,
        metadata: 12288,
      });
      memory.dispose();
      expect(prior.byteLength).toBe(0);
      empty(memory);
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("preserves pre/post image adoption null while actual fresh backing and previous committed backing remain charged", async () => {
  for (const post of [false, true]) {
    const memory = new ManagedMemory(limits),
      fixture = imageFixture(),
      adopt = memory.adopt.bind(memory);
    const prior = memory.allocate(
      "pixels",
      16,
      () => new ArrayBuffer(16),
      true,
      (value) => value,
      (value) =>
        (
          value as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
        ).transfer(0),
    );
    const priorView = new Uint8Array(prior);
    priorView.fill(93);
    let parent: object | undefined;
    vi.spyOn(memory, "adopt").mockImplementation((owner, lease, destroy) => {
      if (lease.bytes === 16384) parent = owner;
      if (owner === fixture.backing) {
        if (post) adopt(owner, lease, destroy);
        expect(memory.statistics.current.pixels).toBe(32);
        expect(memory.owns(parent!)).toBe(true);
        expect(fixture.backing.byteLength).toBe(16);
        throw null;
      }
      adopt(owner, lease, destroy);
    });
    const h = harness(fixture.image);
    await withManagedMemory(memory, async () => {
      const kernel = colorEffectKernel("color.invert")!;
      let failed = false,
        reason: unknown;
      try {
        kernel.renderCanvas!(h.context, h.input, params);
      } catch (error) {
        failed = true;
        reason = error;
      }
      expect(failed).toBe(true);
      expect(reason).toBe(null);
      expect(fixture.backing.byteLength).toBe(0);
      expect(prior.byteLength).toBe(16);
      expect([...priorView]).toEqual(Array(16).fill(93));
      expect(memory.owns(prior)).toBe(true);
      expect(h.committed).toEqual(originalPixels);
      expect(memory.statistics.current).toEqual({
        pixels: 16,
        metadata: 12288,
      });
      memory.dispose();
      expect(prior.byteLength).toBe(0);
      empty(memory);
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("holds factory charge through getImageData scratch/disposal before returning then rejects and detaches the late fresh result", async () => {
  for (const dispose of [false, true]) {
    const memory = new ManagedMemory(limits),
      fixture = imageFixture(),
      order: string[] = [];
    Object.defineProperty(fixture.image, "data", {
      configurable: true,
      get() {
        order.push("data");
        expect(memory.statistics.current.pixels).toBe(16);
        return fixture.data;
      },
    });
    Object.defineProperty(fixture.data, "buffer", {
      configurable: true,
      get() {
        order.push("buffer");
        expect(memory.statistics.current.pixels).toBe(16);
        return nativeBuffer.call(fixture.data) as ArrayBuffer;
      },
    });
    backingFailure(memory, fixture.backing, order);
    const h = harness(fixture.image, undefined, () => {
      order.push("factory");
      if (dispose) memory.dispose();
      else memory.endScratch();
      expect(memory.statistics.current.pixels).toBe(16);
      expect(fixture.backing.byteLength).toBe(16);
      return fixture.image;
    });
    await withManagedMemory(memory, async () => {
      const kernel = colorEffectKernel("color.invert")!;
      memory.beginScratch();
      expect(() => kernel.renderCanvas!(h.context, h.input, params)).toThrow(
        /no active owner/,
      );
      expect(order).toEqual(["factory", "data", "buffer", "transfer"]);
      expect(fixture.backing.byteLength).toBe(0);
      expect(h.putImageData).toHaveBeenCalledTimes(0);
      expect(h.committed).toEqual(originalPixels);
      if (!dispose) {
        expect(memory.statistics.current).toEqual({
          pixels: 0,
          metadata: 12288,
        });
        memory.dispose();
      }
      empty(memory);
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("attempts native image and parent cleanup errors while preserving the original putImageData null", async () => {
  const memory = new ManagedMemory(limits),
    fixture = imageFixture(),
    order: string[] = [];
  let parent: Captured | undefined;
  const captured = capture(memory, (item, destroy) => (owner) => {
    if (owner === fixture.backing) {
      expect(memory.owns(parent!.owner)).toBe(true);
      expect(parent!.record.value).toBe(parent!.owner);
    }
    destroy?.(owner);
    if (item.lease.bytes === 16384) {
      order.push("parent");
      throw Error("later parent cleanup");
    }
  });
  backingFailure(memory, fixture.backing, order);
  const h = harness(fixture.image, () => {
    parent = captured.find((item) => item.lease.bytes === 16384)!;
    memory.dispose();
    expect(fixture.backing.byteLength).toBe(16);
    throw null;
  });
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!;
    let failed = false,
      reason: unknown;
    try {
      kernel.renderCanvas!(h.context, h.input, params);
    } catch (error) {
      failed = true;
      reason = error;
    }
    expect(failed).toBe(true);
    expect(reason).toBe(null);
    expect(order).toEqual(["transfer", "parent"]);
    expect(fixture.backing.byteLength).toBe(0);
    expect(parent!.record).toEqual({});
    expect(parent!.owner).toEqual({});
    expect(h.committed).toEqual(originalPixels);
    empty(memory);
  });
});

it("preserves actual image cleanup null after successful native commit, clears once and retries with a fresh actual image", async () => {
  const memory = new ManagedMemory(limits),
    fixture = imageFixture(),
    order: string[] = [];
  backingFailure(memory, fixture.backing, order);
  const h = harness(fixture.image);
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!;
    let failed = false,
      reason: unknown;
    try {
      kernel.renderCanvas!(h.context, h.input, params);
    } catch (error) {
      failed = true;
      reason = error;
    }
    expect(failed).toBe(true);
    expect(reason).toBe(null);
    expect(order).toEqual(["transfer"]);
    expect(h.committed).toEqual(expectedPixels);
    expect(fixture.backing.byteLength).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 12288 });
    const retry = imageFixture(),
      next = harness(retry.image);
    expect(kernel.renderCanvas!(next.context, next.input, params)).toBe(
      next.output,
    );
    expect(next.committed).toEqual(expectedPixels);
    expect(retry.backing.byteLength).toBe(0);
    memory.dispose();
    empty(memory);
  });
});

it("keeps actual Canvas sampling parent and backing live through middle Math.round disposal success/null", async () => {
  const round = Math.round;
  for (const fail of [false, true]) {
    const memory = new ManagedMemory(limits),
      fixture = imageFixture(),
      captured = capture(memory);
    let calls = 0;
    await withManagedMemory(memory, async () => {
      const kernel = colorEffectKernel("color.invert")!,
        h = harness(fixture.image);
      vi.spyOn(Math, "round").mockImplementation((value) => {
        calls++;
        if (calls === 10) {
          const parent = captured.find((item) => item.lease.bytes === 16384)!;
          memory.dispose();
          expect(memory.owns(parent.owner)).toBe(true);
          expect(parent.record.value).toBe(parent.owner);
          expect(memory.owns(fixture.backing)).toBe(true);
          expect(memory.statistics.current.pixels).toBe(16);
          expect(fixture.backing.byteLength).toBe(16);
          if (fail) throw null;
        }
        return round(value);
      });
      let failed = false,
        reason: unknown,
        output: Surface | undefined;
      try {
        output = kernel.renderCanvas!(h.context, h.input, params);
      } catch (error) {
        failed = true;
        reason = error;
      }
      if (fail) {
        expect(failed).toBe(true);
        expect(reason).toBe(null);
        expect(h.putImageData).toHaveBeenCalledTimes(0);
        expect(h.committed).toEqual(originalPixels);
      } else {
        expect(failed).toBe(false);
        expect(output).toBe(h.output);
        expect(h.committed).toEqual(expectedPixels);
      }
      expect(fixture.backing.byteLength).toBe(0);
      empty(memory);
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("refuses stale Canvas kernel work before any original factory after disposing native consumption", async () => {
  const memory = new ManagedMemory(limits),
    fixture = imageFixture(),
    h = harness(fixture.image, () => memory.dispose());
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!;
    expect(kernel.renderCanvas!(h.context, h.input, params)).toBe(h.output);
    empty(memory);
    const next = harness(imageFixture().image);
    expect(() =>
      kernel.renderCanvas!(next.context, next.input, params),
    ).toThrow(/disposed/);
    expect(next.createSurface).toHaveBeenCalledTimes(0);
    expect(next.getImageData).toHaveBeenCalledTimes(0);
    empty(memory);
  });
});

it("refuses a new image factory after scratch retires the actual Canvas parent during native surface creation", async () => {
  const memory = new ManagedMemory(limits),
    fixture = imageFixture(),
    h = harness(fixture.image);
  vi.spyOn(h.context, "createSurface").mockImplementation(() => {
    memory.endScratch();
    return h.output;
  });
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!;
    memory.beginScratch();
    expect(() => kernel.renderCanvas!(h.context, h.input, params)).toThrow(
      /work owner was disposed/,
    );
    expect(h.getImageData).toHaveBeenCalledTimes(0);
    expect(h.putImageData).toHaveBeenCalledTimes(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 12288 });
    memory.dispose();
    empty(memory);
  });
});

it("rejects exact image quota before original getImageData while keeping old committed native backing unchanged, then retries", async () => {
  const memory = new ManagedMemory({ pixels: 31, metadata: limits.metadata }),
    fixture = imageFixture();
  const prior = memory.allocate(
    "pixels",
    16,
    () => new ArrayBuffer(16),
    true,
    (value) => value,
    (value) =>
      (
        value as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
      ).transfer(0),
  );
  const priorView = new Uint8Array(prior);
  priorView.fill(42);
  const h = harness(fixture.image);
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!;
    expect(() => kernel.renderCanvas!(h.context, h.input, params)).toThrow(
      /quota/,
    );
    expect(h.getImageData).toHaveBeenCalledTimes(0);
    expect(h.putImageData).toHaveBeenCalledTimes(0);
    expect([...priorView]).toEqual(Array(16).fill(42));
    expect(prior.byteLength).toBe(16);
    expect(memory.owns(prior)).toBe(true);
    expect(h.committed).toEqual(originalPixels);
    expect(memory.statistics.current).toEqual({ pixels: 16, metadata: 12288 });
    expect(memory.statistics.reservations).toBe(3);
    memory.release(prior);
    expect(prior.byteLength).toBe(0);
    expect(kernel.renderCanvas!(h.context, h.input, params)).toBe(h.output);
    expect(h.getImageData).toHaveBeenCalledTimes(1);
    expect(h.committed).toEqual(expectedPixels);
    expect(fixture.backing.byteLength).toBe(0);
    memory.dispose();
    empty(memory);
  });
});
