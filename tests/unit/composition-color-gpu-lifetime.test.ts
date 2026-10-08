import { afterEach, expect, it, vi } from "vitest";
import { colorEffectKernel } from "../../packages/renderer-core/src/composition/render/color-effects.ts";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

type Kernel = NonNullable<ReturnType<typeof colorEffectKernel>>;
type GpuContext = Parameters<NonNullable<Kernel["renderGpu"]>>[0];
type Surface = Parameters<NonNullable<Kernel["renderGpu"]>>[1];
type Params = Parameters<NonNullable<Kernel["renderGpu"]>>[2];
type Resource = { value?: object; destroy?: (value: object) => void };
type Captured = { owner: object; lease: MemoryLease; record: Resource };
type Work = {
  memory?: ManagedMemory;
  pixel?: object;
  entries?: [string, unknown][];
  filtered?: [string, unknown][];
  uniforms?: Record<string, unknown>;
  inputs?: Surface[];
  bytes?: Uint8Array<ArrayBuffer>;
  backing?: ArrayBuffer;
  pixelLease?: MemoryLease;
};
const limits = { pixels: 4194304, metadata: 2097152 };
const input = { width: 2, height: 2 } as Surface;
const params: Params = { amount: 0.5 };
const curveParams: Params = {
  curve: [
    [0, 0],
    [1, 1],
  ],
  amount: 1,
};
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
    captured: Captured,
    destroy?: (value: object) => void,
  ) => (value: object) => void,
) {
  const original = memory.adopt.bind(memory),
    captured: Captured[] = [];
  vi.spyOn(memory, "adopt").mockImplementation((owner, lease, destroy) => {
    const item: Captured = { owner, lease, record: {} };
    original(owner, lease, transform?.(item, destroy) ?? destroy);
    item.record = resources(memory).get(lease)!;
    captured.push(item);
  });
  return captured;
}
function harness(
  pass?: GpuContext["pass"],
  upload?: GpuContext["uploadBytes"],
) {
  let output: Surface | undefined;
  const createSurface = vi.fn((width: number, height: number) => {
    const value = { width, height } as Surface;
    output ??= value;
    return value;
  });
  const context = {
    createSurface,
    pass: vi.fn(pass),
    uploadBytes: vi.fn(upload),
  } as unknown as GpuContext;
  return { context, createSurface, output: () => output };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the actual parent, native input array, entry tuples and uniforms alive through a disposing pass", async () => {
  const memory = new ManagedMemory(limits),
    captured = capture(memory);
  let parent: Captured | undefined,
    tuples: [string, unknown][] | undefined,
    filtered: [string, unknown][] | undefined,
    uniforms: Record<string, unknown> | undefined,
    inputs: readonly Surface[] | undefined;
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!;
    const h = harness((_shader, _output, actualInputs, actualUniforms) => {
      parent = captured.find((v) => v.lease.bytes === 16384)!;
      const work = parent.owner as Work;
      tuples = work.entries!;
      filtered = work.filtered!;
      uniforms = actualUniforms;
      inputs = actualInputs;
      const before = memory.statistics.current.metadata;
      memory.dispose();
      expect(memory.statistics.current.metadata).toBe(before - 4096);
      expect(memory.owns(parent.owner)).toBe(true);
      expect(parent.record.value).toBe(parent.owner);
      expect(parent.lease.active).toBe(false);
      expect(work.memory).toBe(memory);
      expect(actualInputs).toEqual([input]);
      expect(tuples).toEqual([["amount", 0.5]]);
      expect(filtered).toEqual([["amount", 0.5]]);
      expect(filtered[0]).toBe(tuples[0]);
      expect(actualUniforms).toEqual({ amount: 0.5 });
      for (const value of [tuples, filtered, actualUniforms])
        expect(memory.owns(value!)).toBe(true);
    });
    expect(kernel.renderGpu!(h.context, input, params)).toBe(h.output());
    expect(parent!.owner).toEqual({});
    expect(parent!.record).toEqual({});
    expect(tuples).toEqual([]);
    expect(filtered).toEqual([]);
    expect(uniforms).toEqual({});
    expect(inputs).toEqual([]);
    empty(memory);
  });
});

it("keeps the real 1024-byte curve backing admitted and attached through native upload and disposing pass", async () => {
  const memory = new ManagedMemory(limits),
    captured = capture(memory);
  let backing: ArrayBuffer | undefined,
    view: Uint8Array<ArrayBuffer> | undefined;
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.curves")!;
    const h = harness(
      (_shader, _output, actualInputs, actualUniforms) => {
        const owner = captured.find((v) => v.lease.bytes === 16384)!
          .owner as Work;
        memory.dispose();
        expect(owner.inputs).toBe(actualInputs);
        expect(actualInputs).toHaveLength(2);
        expect(actualUniforms).toEqual({ amount: 1 });
        expect(memory.statistics.current.pixels).toBe(1024);
        expect(memory.owns(backing!)).toBe(true);
        expect(backing!.byteLength).toBe(1024);
        expect(view![0]).toBe(0);
        expect(view![4 * 128]).toBe(128);
        expect(view![1020]).toBe(255);
        expect(view![3]).toBe(255);
        expect(view![1023]).toBe(255);
        const record = resources(memory).get(owner.pixelLease!);
        expect(record?.value).toBe(backing);
      },
      (_surface, bytes) => {
        view = bytes as Uint8Array<ArrayBuffer>;
        backing = view.buffer;
        expect(backing.byteLength).toBe(1024);
        expect(memory.statistics.current.pixels).toBe(1024);
      },
    );
    expect(kernel.renderGpu!(h.context, input, curveParams)).toBe(h.output());
    expect(backing!.byteLength).toBe(0);
    expect(view!.byteLength).toBe(0);
    empty(memory);
  });
});

it("settles every independent child and parent after a native null without replacing that first reason", async () => {
  const memory = new ManagedMemory(limits),
    cleanup: string[] = [];
  let parent: Captured | undefined;
  const captured = capture(memory, (item, destroy) => (value) => {
    if (
      parent &&
      item.lease !== parent.lease &&
      item.lease.bytes !== 4096 &&
      item.lease.bytes !== 8192
    ) {
      expect(memory.owns(parent.owner)).toBe(true);
      expect(parent.record.value).toBe(parent.owner);
      expect(memory.statistics.current.metadata).toBeGreaterThanOrEqual(16384);
    }
    destroy?.(value);
    if (item.lease.bytes === 768) {
      cleanup.push("uniform");
      throw null;
    }
    if (item.lease.bytes === 780) {
      cleanup.push("entries");
      throw Error("secondary entry destructor");
    }
    if (item.lease.bytes === 16384) {
      cleanup.push("parent");
      throw Error("secondary parent destructor");
    }
  });
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!;
    const h = harness(() => {
      parent = captured.find((v) => v.lease.bytes === 16384)!;
      memory.dispose();
      throw null;
    });
    let failed = false,
      reason: unknown;
    try {
      kernel.renderGpu!(h.context, input, params);
    } catch (error) {
      failed = true;
      reason = error;
    }
    expect(failed).toBe(true);
    expect(reason).toBe(null);
    expect(cleanup).toEqual(["uniform", "entries", "parent"]);
    for (const item of captured) expect(item.record).toEqual({});
    empty(memory);
  });
});

it("preserves a first independent cleanup null after native success and still settles later parent cleanup", async () => {
  const memory = new ManagedMemory(limits),
    cleanup: string[] = [];
  capture(memory, (item, destroy) => (value) => {
    destroy?.(value);
    if (item.lease.bytes === 768) {
      cleanup.push("uniform");
      throw null;
    }
    if (item.lease.bytes === 16384) {
      cleanup.push("parent");
      throw Error("later parent");
    }
  });
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!,
      h = harness(() => memory.dispose());
    let failed = false,
      reason: unknown;
    try {
      kernel.renderGpu!(h.context, input, params);
    } catch (error) {
      failed = true;
      reason = error;
    }
    expect(failed).toBe(true);
    expect(reason).toBe(null);
    expect(cleanup).toEqual(["uniform", "parent"]);
    empty(memory);
  });
});

it("settles a captured parent construction hold when adoption disposes and throws before work returns", async () => {
  const memory = new ManagedMemory(limits),
    original = memory.adopt.bind(memory);
  let parent: object | undefined, record: Resource | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((owner, lease, destroy) => {
    original(owner, lease, destroy);
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
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!,
      h = harness();
    let failed = false,
      reason: unknown;
    try {
      kernel.renderGpu!(h.context, input, params);
    } catch (error) {
      failed = true;
      reason = error;
    }
    expect(failed).toBe(true);
    expect(reason).toBe(null);
    expect(h.createSurface).toHaveBeenCalledTimes(0);
    expect(parent).toEqual({});
    expect(record).toEqual({});
    empty(memory);
  });
});

it("holds adopted entry tuples through a late adoption null and clears them after producer cleanup", async () => {
  const memory = new ManagedMemory(limits),
    original = memory.adopt.bind(memory);
  let entries: object | undefined,
    entryRecord: Resource | undefined,
    parent: object | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((owner, lease, destroy) => {
    original(owner, lease, destroy);
    if (lease.bytes === 16384) parent = owner;
    if (lease.bytes === 780) {
      entries = owner;
      entryRecord = resources(memory).get(lease)!;
      memory.dispose();
      expect(memory.owns(parent!)).toBe(true);
      expect(memory.owns(owner)).toBe(true);
      expect(owner).toEqual([["amount", 0.5]]);
      expect(entryRecord.value).toBe(owner);
      throw null;
    }
  });
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!,
      h = harness();
    let failed = false,
      reason: unknown;
    try {
      kernel.renderGpu!(h.context, input, params);
    } catch (error) {
      failed = true;
      reason = error;
    }
    expect(failed).toBe(true);
    expect(reason).toBe(null);
    expect(h.context.pass).toHaveBeenCalledTimes(0);
    expect(entries).toEqual([]);
    expect(entryRecord).toEqual({});
    expect(parent).toEqual({});
    empty(memory);
  });
});

it("detaches a fresh curve factory output once when its original buffer Get throws null", async () => {
  const memory = new ManagedMemory(limits),
    NativeBytes = Uint8Array;
  let backing: ArrayBuffer | undefined,
    bufferGets = 0,
    detachGets = 0;
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.curves")!;
    const replacement = vi.fn(function (length: number) {
      const bytes = new NativeBytes(length);
      backing = bytes.buffer;
      Object.defineProperty(backing, "transfer", {
        configurable: true,
        get() {
          detachGets++;
          expect(memory.statistics.current.pixels).toBe(1024);
          throw null;
        },
      });
      Object.defineProperty(bytes, "buffer", {
        configurable: true,
        get() {
          bufferGets++;
          expect(memory.statistics.current.pixels).toBe(1024);
          throw null;
        },
      });
      return bytes;
    });
    Object.defineProperty(replacement, "prototype", {
      value: NativeBytes.prototype,
    });
    vi.stubGlobal("Uint8Array", replacement);
    const h = harness();
    let failed = false,
      reason: unknown;
    try {
      kernel.renderGpu!(h.context, input, curveParams);
    } catch (error) {
      failed = true;
      reason = error;
    }
    expect(failed).toBe(true);
    expect(reason).toBe(null);
    expect(bufferGets).toBe(1);
    expect(detachGets).toBe(1);
    expect(backing!.byteLength).toBe(0);
    expect(h.context.uploadBytes).toHaveBeenCalledTimes(0);
    expect(memory.statistics.current.pixels).toBe(0);
    expect(memory.statistics.current.metadata).toBe(12288);
    memory.dispose();
    empty(memory);
  });
});

it("preserves pre/post curve adoption null, actual held byte charge and previous committed backing", async () => {
  for (const post of [false, true]) {
    const memory = new ManagedMemory(limits),
      original = memory.adopt.bind(memory);
    const prior = memory.allocate(
      "pixels",
      16,
      () => new ArrayBuffer(16),
      true,
      (v) => v,
      (v) =>
        (v as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }).transfer(
          0,
        ),
    );
    const priorBytes = new Uint8Array(prior);
    priorBytes.fill(77);
    let backing: ArrayBuffer | undefined, parent: object | undefined;
    vi.spyOn(memory, "adopt").mockImplementation((owner, lease, destroy) => {
      if (lease.bytes === 16384) parent = owner;
      if (lease.bytes === 1024 && owner instanceof ArrayBuffer) {
        backing = owner;
        if (post) original(owner, lease, destroy);
        expect(memory.owns(parent!)).toBe(true);
        expect(memory.statistics.current.pixels).toBe(1040);
        expect(backing.byteLength).toBe(1024);
        throw null;
      }
      original(owner, lease, destroy);
    });
    await withManagedMemory(memory, async () => {
      const kernel = colorEffectKernel("color.curves")!,
        h = harness();
      let failed = false,
        reason: unknown;
      try {
        kernel.renderGpu!(h.context, input, curveParams);
      } catch (error) {
        failed = true;
        reason = error;
      }
      expect(failed).toBe(true);
      expect(reason).toBe(null);
      expect(backing!.byteLength).toBe(0);
      expect(prior.byteLength).toBe(16);
      expect([...priorBytes]).toEqual(Array(16).fill(77));
      expect(memory.owns(prior)).toBe(true);
      expect(memory.statistics.current).toEqual({
        pixels: 16,
        metadata: 12288,
      });
      expect(h.context.uploadBytes).toHaveBeenCalledTimes(0);
      memory.dispose();
      expect(prior.byteLength).toBe(0);
      empty(memory);
    });
    vi.restoreAllMocks();
  }
});

it("refuses stale kernel work before original native factories after a completed disposing pass", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!,
      h = harness(() => memory.dispose());
    expect(kernel.renderGpu!(h.context, input, params)).toBe(h.output());
    empty(memory);
    const stale = harness();
    expect(() => kernel.renderGpu!(stale.context, input, params)).toThrow(
      /disposed/,
    );
    expect(stale.createSurface).toHaveBeenCalledTimes(0);
    expect(stale.context.pass).toHaveBeenCalledTimes(0);
    empty(memory);
  });
});

it("refuses a new child factory after scratch retires the actual already-started GPU parent", async () => {
  const memory = new ManagedMemory(limits);
  let ended = false;
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!,
      h = harness();
    const create = h.context.createSurface.bind(h.context);
    vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
      const result = create(...args);
      if (!ended) {
        ended = true;
        memory.endScratch();
      }
      return result;
    });
    memory.beginScratch();
    const borrowed = new Proxy(params, {
      get() {
        throw Error("original parameter Get must not start");
      },
    });
    expect(() => kernel.renderGpu!(h.context, input, borrowed)).toThrow(
      /work owner was disposed/,
    );
    expect(h.context.pass).toHaveBeenCalledTimes(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 12288 });
    memory.dispose();
    empty(memory);
  });
});

it("preserves a known backing alias from the original buffer Get and detaches the actual fresh native curve backing", async () => {
  const memory = new ManagedMemory(limits),
    NativeBytes = Uint8Array;
  const prior = memory.allocate(
    "pixels",
    16,
    () => new ArrayBuffer(16),
    true,
    (v) => v,
    (v) =>
      (v as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }).transfer(0),
  );
  const priorView = new NativeBytes(prior);
  priorView.fill(91);
  let actual: ArrayBuffer | undefined,
    bufferGets = 0;
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.curves")!;
    const replacement = vi.fn(function (length: number) {
      const bytes = new NativeBytes(length);
      actual = bytes.buffer;
      Object.defineProperty(bytes, "buffer", {
        configurable: true,
        get() {
          bufferGets++;
          return prior;
        },
      });
      return bytes;
    });
    Object.defineProperty(replacement, "prototype", {
      value: NativeBytes.prototype,
    });
    vi.stubGlobal("Uint8Array", replacement);
    const h = harness();
    expect(() => kernel.renderGpu!(h.context, input, curveParams)).toThrow(
      /already owned/,
    );
    expect(bufferGets).toBe(1);
    expect(actual!.byteLength).toBe(0);
    expect(prior.byteLength).toBe(16);
    expect([...priorView]).toEqual(Array(16).fill(91));
    expect(memory.owns(prior)).toBe(true);
    expect(memory.statistics.current).toEqual({ pixels: 16, metadata: 12288 });
    expect(h.context.uploadBytes).toHaveBeenCalledTimes(0);
    memory.dispose();
    expect(prior.byteLength).toBe(0);
    empty(memory);
  });
});

it("holds independently released tuples, uniform and curve leases while the actual GPU parent remains active", async () => {
  const memory = new ManagedMemory(limits),
    captured = capture(memory);
  let backing: ArrayBuffer | undefined,
    parent: Captured | undefined,
    entries: [string, unknown][] | undefined;
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.curves")!;
    const h = harness(
      (_shader, _output, actualInputs, actualUniforms) => {
        parent = captured.find((v) => v.lease.bytes === 16384)!;
        const work = parent.owner as Work;
        entries = work.entries!;
        const before = memory.statistics.current;
        const children = [
          work.entries!,
          work.filtered!,
          actualUniforms!,
          backing!,
        ].map((owner) => captured.find((item) => item.owner === owner)!);
        expect(children).toHaveLength(4);
        for (const item of children) {
          expect(item.lease.active).toBe(true);
          item.lease.release();
        }
        expect(parent.lease.active).toBe(true);
        expect(memory.owns(parent.owner)).toBe(true);
        expect(memory.statistics.current).toEqual(before);
        expect(actualInputs).toHaveLength(2);
        expect(actualUniforms).toEqual({ amount: 1 });
        expect(entries).toEqual([
          ["curve", curveParams.curve],
          ["amount", 1],
        ]);
        expect(work.filtered).toEqual([["amount", 1]]);
        expect(backing!.byteLength).toBe(1024);
        expect(memory.owns(backing!)).toBe(true);
        for (const item of children) {
          expect(item.lease.active).toBe(false);
          expect(resources(memory).get(item.lease)?.value).toBe(item.owner);
          expect(memory.owns(item.owner)).toBe(true);
        }
      },
      (_surface, bytes) => {
        backing = (bytes as Uint8Array<ArrayBuffer>).buffer;
      },
    );
    expect(kernel.renderGpu!(h.context, input, curveParams)).toBe(h.output());
    expect(parent!.owner).toEqual({});
    expect(entries).toEqual([]);
    expect(backing!.byteLength).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 12288 });
    memory.dispose();
    empty(memory);
  });
});

it("holds actual curve production through a middle Math.round disposal and preserves a middle null over cleanup", async () => {
  const originalRound = Math.round;
  for (const fail of [false, true]) {
    const memory = new ManagedMemory(limits),
      captured = capture(memory);
    let rounds = 0,
      backing: ArrayBuffer | undefined,
      disposed = false;
    await withManagedMemory(memory, async () => {
      const kernel = colorEffectKernel("color.curves")!;
      vi.spyOn(Math, "round").mockImplementation((value) => {
        rounds++;
        if (rounds === 128) {
          const parent = captured.find((v) => v.lease.bytes === 16384)!;
          const work = parent.owner as Work;
          backing = captured.find(
            (item) =>
              item.lease.bytes === 1024 && item.owner instanceof ArrayBuffer,
          )!.owner as ArrayBuffer;
          memory.dispose();
          disposed = true;
          expect(memory.owns(parent.owner)).toBe(true);
          expect(memory.owns(backing)).toBe(true);
          expect(memory.statistics.current.pixels).toBe(1024);
          expect(backing.byteLength).toBe(1024);
          expect(work.bytes![126 * 4]).toBe(126);
          expect(work.entries).toHaveLength(2);
          expect(work.uniforms).toEqual({ amount: 1 });
          if (fail) throw null;
        }
        if (disposed) {
          expect(memory.statistics.current.pixels).toBe(1024);
          expect(backing!.byteLength).toBe(1024);
        }
        return originalRound(value);
      });
      const h = harness(
        (_shader, _output, _inputs, uniforms) => {
          expect(uniforms).toEqual({ amount: 1 });
          expect(backing!.byteLength).toBe(1024);
        },
        (_surface, bytes) => {
          expect((bytes as Uint8Array<ArrayBuffer>)[1020]).toBe(255);
        },
      );
      let failed = false,
        reason: unknown,
        output: Surface | undefined;
      try {
        output = kernel.renderGpu!(h.context, input, curveParams);
      } catch (error) {
        failed = true;
        reason = error;
      }
      expect(disposed).toBe(true);
      if (fail) {
        expect(failed).toBe(true);
        expect(reason).toBe(null);
        expect(rounds).toBe(128);
        expect(h.context.uploadBytes).toHaveBeenCalledTimes(0);
      } else {
        expect(failed).toBe(false);
        expect(output).toBe(h.output());
        expect(rounds).toBe(256);
        expect(h.context.uploadBytes).toHaveBeenCalledTimes(1);
      }
      expect(backing!.byteLength).toBe(0);
      empty(memory);
    });
    vi.restoreAllMocks();
  }
});

it("keeps scratch-retired GPU child backing alive through the already-started native pass and clears it after", async () => {
  const memory = new ManagedMemory(limits),
    captured = capture(memory);
  let backing: ArrayBuffer | undefined;
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.curves")!;
    memory.beginScratch();
    const h = harness(
      (_shader, _output, inputs, uniforms) => {
        const parent = captured.find((v) => v.lease.bytes === 16384)!;
        const before = memory.statistics.current;
        memory.endScratch();
        expect(parent.lease.active).toBe(false);
        expect(memory.owns(parent.owner)).toBe(true);
        expect(memory.statistics.current).toEqual(before);
        expect(inputs).toHaveLength(2);
        expect(uniforms).toEqual({ amount: 1 });
        expect(backing!.byteLength).toBe(1024);
        expect(memory.owns(backing!)).toBe(true);
      },
      (_surface, bytes) => {
        backing = (bytes as Uint8Array<ArrayBuffer>).buffer;
      },
    );
    expect(kernel.renderGpu!(h.context, input, curveParams)).toBe(h.output());
    expect(backing!.byteLength).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 12288 });
    memory.dispose();
    empty(memory);
  });
});
