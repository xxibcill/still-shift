import { afterEach, expect, it, vi } from "vitest";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import {
  allocateManagedRenderMetadata,
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

type ResourceRecord = { value?: object; destroy?: (value: object) => void };
const limits = { pixels: 1, metadata: 64 };
function current(memory: ManagedMemory, bytes: number, reservations: number) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: bytes });
  expect(memory.statistics.reservations).toBe(reservations);
}
function records(memory: ManagedMemory) {
  const map = Reflect.get(memory, "resources") as Map<
      MemoryLease,
      ResourceRecord
    >,
    set = map.set.bind(map),
    actual: ResourceRecord[] = [];
  vi.spyOn(map, "set").mockImplementation((key, value) => {
    actual.push(value);
    return set(key, value);
  });
  return actual;
}
function registry(memory: ManagedMemory, owner: () => object | undefined) {
  const ownership = Reflect.get(memory, "ownership") as WeakMap<
      object,
      MemoryLease
    >,
    set = WeakMap.prototype.set;
  let actual: WeakMap<object, MemoryLease> | undefined;
  const spy = vi.spyOn(WeakMap.prototype, "set").mockImplementation(function (
    this: WeakMap<object, MemoryLease>,
    key,
    value,
  ) {
    if (key === owner() && this !== ownership)
      actual = this as WeakMap<object, MemoryLease>;
    return set.call(this, key, value);
  });
  return { actual: () => actual, spy, set, ownership };
}
function failure(run: () => unknown): unknown {
  try {
    run();
    return "not thrown";
  } catch (error) {
    return error;
  }
}
function detach(value: ArrayBuffer) {
  if (value.byteLength)
    (value as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }).transfer(
      0,
    );
}
afterEach(() => vi.restoreAllMocks());

it("denies metadata before its admitted hook or actual factory and preserves a prior native backing and its mapping", () => {
  const memory = new ManagedMemory({ ...limits, metadata: 16 });
  let owner: ArrayBuffer | undefined;
  const map = registry(memory, () => owner),
    prior = allocateManagedRenderMetadata(
      memory,
      16,
      () => (owner = new ArrayBuffer(16)),
      true,
      detach,
    ),
    previous = map.actual()!.get(prior),
    admitted = vi.fn(),
    factory = vi.fn(() => new ArrayBuffer(1));
  expect(() =>
    allocateManagedRenderMetadata(memory, 1, factory, false, detach, admitted),
  ).toThrow(/quota/);
  expect(admitted).not.toHaveBeenCalled();
  expect(factory).not.toHaveBeenCalled();
  expect(prior.byteLength).toBe(16);
  expect(memory.owns(prior)).toBe(true);
  expect(map.actual()!.get(prior)).toBe(previous);
  current(memory, 16, 1);
  memory.dispose();
  expect(prior.byteLength).toBe(0);
  expect(map.actual()!.get(prior)).toBeUndefined();
  current(memory, 0, 0);
});

it("preserves inactive factory identity and original borrowed getter order without adding metadata ownership", () => {
  const accesses: string[] = [],
    borrowed = {
      get first() {
        accesses.push("first");
        return 17;
      },
      get second() {
        accesses.push("second");
        return 29;
      },
    },
    factory = vi.fn(() => ({ values: [borrowed.first, borrowed.second] })),
    destroy = vi.fn(),
    result = allocateRenderMetadata(16, factory, false, destroy);
  expect(accesses).toEqual(["first", "second"]);
  expect(result).toEqual({ values: [17, 29] });
  expect(result).toBe(factory.mock.results[0]!.value);
  expect(factory).toHaveBeenCalledOnce();
  releaseRenderMetadata(result);
  expect(destroy).not.toHaveBeenCalled();
});

it("preserves admitted factory borrowed Get adopt and registry order while retaining captured ownership through reentrant cleanup under another allocator", async () => {
  const memory = new ManagedMemory(limits),
    other = new ManagedMemory(limits),
    actual = records(memory),
    adopt = memory.adopt.bind(memory),
    order: string[] = [];
  let owner: { values: number[] } | undefined,
    lease: MemoryLease | undefined,
    calls = 0;
  const map = registry(memory, () => owner),
    original = map.spy.getMockImplementation()!;
  map.spy.mockImplementation(function (
    this: WeakMap<object, MemoryLease>,
    key,
    value,
  ) {
    if (key === owner && this !== map.ownership) order.push("registry");
    return original.call(this, key, value);
  });
  vi.spyOn(memory, "adopt").mockImplementation((...args) => {
    order.push("adopt");
    return adopt(...args);
  });
  const borrowed = {
    get value() {
      order.push("get");
      return 23;
    },
  };
  const result = allocateManagedRenderMetadata(
    memory,
    16,
    () => {
      order.push("factory");
      current(memory, 32, 1);
      return (owner = { values: [borrowed.value] });
    },
    true,
    (value) => {
      calls++;
      expect(value).toBe(result);
      expect(value.values).toEqual([23]);
      expect(map.actual()!.get(value)).toBe(lease);
      expect(lease!.active).toBe(false);
      expect(memory.owns(value)).toBe(true);
      current(memory, 32, 1);
      expect(actual[0]!.value).toBe(value);
      releaseRenderMetadata(value);
      expect(map.actual()!.get(value)).toBe(lease);
      value.values.length = 0;
      throw null;
    },
    (admitted) => {
      order.push("admitted");
      lease = admitted;
      current(memory, 16, 1);
      admitted.resize(32);
    },
  );
  expect(order).toEqual(["admitted", "factory", "get", "adopt", "registry"]);
  expect(map.actual()!.get(result)).toBe(lease);
  await withManagedMemory(other, async () => {
    expect(failure(() => releaseRenderMetadata(result))).toBeNull();
    current(other, 0, 0);
  });
  expect(calls).toBe(1);
  expect(result.values).toEqual([]);
  expect(map.actual()!.get(result)).toBeUndefined();
  expect(actual).toEqual([{}]);
  current(memory, 0, 0);
  releaseRenderMetadata(result);
  expect(calls).toBe(1);
  memory.dispose();
  other.dispose();
});

it("releases immediate admission after admitted or factory null despite secondary release failure and preserves the original one-time producer order", () => {
  for (const cut of ["admitted", "factory", "hold"]) {
    const memory = new ManagedMemory(limits),
      reserve = memory.reserve.bind(memory),
      order: string[] = [];
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw Error("secondary release");
      });
      if (cut === "hold")
        vi.spyOn(lease, "deferRelease").mockImplementation(() => {
          throw null;
        });
      return lease;
    });
    expect(
      failure(() =>
        allocateManagedRenderMetadata(
          memory,
          16,
          () => {
            order.push("factory");
            current(memory, 16, 1);
            throw null;
          },
          false,
          undefined,
          () => {
            order.push("admitted");
            current(memory, 16, 1);
            if (cut === "admitted") throw null;
          },
        ),
      ),
    ).toBeNull();
    expect(order).toEqual(
      cut === "hold"
        ? []
        : cut === "admitted"
          ? ["admitted"]
          : ["admitted", "factory"],
    );
    current(memory, 0, 0);
    vi.restoreAllMocks();
    const retry = allocateManagedRenderMetadata(
      memory,
      16,
      () => new ArrayBuffer(16),
      false,
      detach,
    );
    expect(retry.byteLength).toBe(16);
    releaseRenderMetadata(retry);
    expect(retry.byteLength).toBe(0);
    current(memory, 0, 0);
    memory.dispose();
  }
});

it("holds the original reservation through factory disposal and a subsequent original null without publishing a resource or running fresh cleanup", () => {
  const memory = new ManagedMemory(limits),
    actual = records(memory),
    destroy = vi.fn();
  expect(
    failure(() =>
      allocateManagedRenderMetadata(
        memory,
        16,
        () => {
          memory.dispose();
          current(memory, 16, 1);
          throw null;
        },
        false,
        destroy,
      ),
    ),
  ).toBeNull();
  expect(destroy).not.toHaveBeenCalled();
  expect(actual).toEqual([]);
  current(memory, 0, 0);
});

it("keeps fresh native backing cleanup charged after factory scratch or allocator retirement and preserves the original adoption rejection over destructor null", () => {
  for (const route of ["scratch", "allocator"]) {
    const memory = new ManagedMemory(limits),
      actual = records(memory);
    let owner: ArrayBuffer | undefined,
      calls = 0;
    memory.beginScratch();
    expect(() =>
      allocateManagedRenderMetadata(
        memory,
        16,
        () => {
          owner = new ArrayBuffer(16);
          if (route === "scratch") memory.endScratch();
          else memory.dispose();
          expect(owner.byteLength).toBe(16);
          current(memory, 16, 1);
          return owner;
        },
        false,
        (value) => {
          calls++;
          current(memory, 16, 1);
          expect(memory.owns(value)).toBe(false);
          detach(value);
          throw null;
        },
      ),
    ).toThrow(/no active owner/);
    expect(calls).toBe(1);
    expect(owner!.byteLength).toBe(0);
    expect(actual).toEqual([]);
    current(memory, 0, 0);
    memory.dispose();
    vi.restoreAllMocks();
  }
});

it("destroys fresh native metadata exactly once after pre or post adoption null while preserving prior backing and first null over secondary cleanup", () => {
  for (const after of [false, true]) {
    const memory = new ManagedMemory(limits),
      actual = records(memory),
      prior = allocateManagedRenderMetadata(
        memory,
        16,
        () => new ArrayBuffer(16),
        true,
        detach,
      ),
      adopt = memory.adopt.bind(memory);
    let owner: ArrayBuffer | undefined,
      calls = 0;
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      if (args[0] === owner) {
        if (after) adopt(...args);
        throw null;
      }
      return adopt(...args);
    });
    expect(
      failure(() =>
        allocateManagedRenderMetadata(
          memory,
          16,
          () => (owner = new ArrayBuffer(16)),
          false,
          (value) => {
            calls++;
            current(memory, 32, 2);
            expect(memory.owns(value)).toBe(after);
            expect(prior.byteLength).toBe(16);
            detach(value);
            throw Error("secondary cleanup");
          },
        ),
      ),
    ).toBeNull();
    expect(calls).toBe(1);
    expect(owner!.byteLength).toBe(0);
    expect(prior.byteLength).toBe(16);
    expect(memory.owns(prior)).toBe(true);
    expect(memory.owns(owner!)).toBe(false);
    expect(actual).toHaveLength(after ? 2 : 1);
    if (after) expect(actual[1]).toEqual({});
    current(memory, 16, 1);
    vi.restoreAllMocks();
    memory.dispose();
    expect(prior.byteLength).toBe(0);
    expect(actual[0]).toEqual({});
    current(memory, 0, 0);
  }
});

it("rolls back pre and post registry registration null through the captured owned destructor while its actual charge and post-mutated mapping remain live", () => {
  for (const after of [false, true]) {
    const memory = new ManagedMemory(limits),
      actual = records(memory),
      prior = allocateManagedRenderMetadata(
        memory,
        16,
        () => new ArrayBuffer(16),
        true,
        detach,
      );
    let owner: ArrayBuffer | undefined,
      lease: MemoryLease | undefined,
      target: WeakMap<object, MemoryLease> | undefined,
      calls = 0;
    const map = registry(memory, () => owner);
    map.spy.mockImplementation(function (
      this: WeakMap<object, MemoryLease>,
      key,
      value,
    ) {
      if (key === owner && this !== map.ownership) {
        target = this as WeakMap<object, MemoryLease>;
        if (after) map.set.call(this, key, value);
        throw null;
      }
      return map.set.call(this, key, value);
    });
    expect(
      failure(() =>
        allocateManagedRenderMetadata(
          memory,
          16,
          () => (owner = new ArrayBuffer(16)),
          false,
          (value) => {
            calls++;
            current(memory, 32, 2);
            expect(memory.owns(value)).toBe(true);
            expect(actual[1]!.value).toBe(value);
            expect(target!.get(value)).toBe(after ? lease : undefined);
            releaseRenderMetadata(value);
            expect(target!.get(value)).toBe(after ? lease : undefined);
            detach(value);
            throw Error("secondary native cleanup");
          },
          (admitted) => {
            lease = admitted;
          },
        ),
      ),
    ).toBeNull();
    expect(calls).toBe(1);
    expect(target!.get(owner!)).toBeUndefined();
    expect(target!.get(prior)?.active).toBe(true);
    expect(owner!.byteLength).toBe(0);
    expect(prior.byteLength).toBe(16);
    expect(actual[1]).toEqual({});
    current(memory, 16, 1);
    map.spy.mockRestore();
    const retry = allocateManagedRenderMetadata(
      memory,
      16,
      () => new ArrayBuffer(16),
      false,
      detach,
    );
    expect(retry.byteLength).toBe(16);
    releaseRenderMetadata(retry);
    expect(retry.byteLength).toBe(0);
    memory.dispose();
    expect(prior.byteLength).toBe(0);
    current(memory, 0, 0);
    vi.restoreAllMocks();
  }
});

it("rejects a successful adoption or pre and post registry publication that retires ownership while retaining backing through the actual one-time destructor", () => {
  for (const cut of ["adopt", "registry-before", "registry-after"]) {
    const memory = new ManagedMemory(limits),
      actual = records(memory),
      adopt = memory.adopt.bind(memory);
    let owner: ArrayBuffer | undefined,
      lease: MemoryLease | undefined,
      calls = 0;
    const map = registry(memory, () => owner);
    if (cut === "adopt")
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        adopt(...args);
        memory.dispose();
        expect(memory.owns(owner!)).toBe(true);
        current(memory, 16, 1);
        expect(owner!.byteLength).toBe(16);
      });
    else
      map.spy.mockImplementation(function (
        this: WeakMap<object, MemoryLease>,
        key,
        value,
      ) {
        if (key === owner && this !== map.ownership) {
          if (cut === "registry-before") lease!.release();
          const result = map.set.call(this, key, value);
          if (cut === "registry-after") lease!.release();
          expect(memory.owns(owner!)).toBe(true);
          expect(owner!.byteLength).toBe(16);
          current(memory, 16, 1);
          return result;
        }
        return map.set.call(this, key, value);
      });
    expect(() =>
      allocateManagedRenderMetadata(
        memory,
        16,
        () => (owner = new ArrayBuffer(16)),
        false,
        (value) => {
          calls++;
          expect(memory.owns(value)).toBe(true);
          expect(actual[0]!.value).toBe(value);
          current(memory, 16, 1);
          detach(value);
        },
        (admitted) => {
          lease = admitted;
        },
      ),
    ).toThrow(/metadata allocation owner was disposed/);
    expect(calls).toBe(1);
    expect(owner!.byteLength).toBe(0);
    expect(actual).toEqual([{}]);
    expect(map.actual()?.get(owner!)).toBeUndefined();
    current(memory, 0, 0);
    vi.restoreAllMocks();
    memory.dispose();
  }
});

it("preserves original destructor null over a synthetic retired-publication rejection without manually destroying an already adopted and retired owner again", () => {
  const memory = new ManagedMemory(limits),
    actual = records(memory),
    adopt = memory.adopt.bind(memory);
  let owner: ArrayBuffer | undefined,
    calls = 0;
  const map = registry(memory, () => owner);
  vi.spyOn(memory, "adopt").mockImplementation((...args) => {
    adopt(...args);
    memory.dispose();
    current(memory, 16, 1);
    expect(owner!.byteLength).toBe(16);
  });
  expect(
    failure(() =>
      allocateManagedRenderMetadata(
        memory,
        16,
        () => (owner = new ArrayBuffer(16)),
        false,
        (value) => {
          calls++;
          current(memory, 16, 1);
          detach(value);
          throw null;
        },
      ),
    ),
  ).toBeNull();
  expect(calls).toBe(1);
  expect(owner!.byteLength).toBe(0);
  expect(map.actual()!.get(owner!)).toBeUndefined();
  expect(actual).toEqual([{}]);
  current(memory, 0, 0);
});

it("keeps failed post-mutating registration discoverable while an admitted consumer hold defers actual retirement then clears the mapping under another allocator", async () => {
  const memory = new ManagedMemory(limits),
    other = new ManagedMemory(limits),
    actual = records(memory);
  let owner: ArrayBuffer | undefined,
    lease: MemoryLease | undefined,
    finish: (() => void) | undefined,
    target: WeakMap<object, MemoryLease> | undefined,
    calls = 0;
  const map = registry(memory, () => owner);
  map.spy.mockImplementation(function (
    this: WeakMap<object, MemoryLease>,
    key,
    value,
  ) {
    if (key === owner && this !== map.ownership) {
      target = this as WeakMap<object, MemoryLease>;
      map.set.call(this, key, value);
      throw null;
    }
    return map.set.call(this, key, value);
  });
  expect(
    failure(() =>
      allocateManagedRenderMetadata(
        memory,
        16,
        () => (owner = new ArrayBuffer(16)),
        false,
        (value) => {
          calls++;
          current(memory, 16, 1);
          expect(target!.get(value)).toBe(lease);
          releaseRenderMetadata(value);
          expect(target!.get(value)).toBe(lease);
          detach(value);
        },
        (admitted) => {
          lease = admitted;
          finish = admitted.deferRelease();
        },
      ),
    ),
  ).toBeNull();
  expect(calls).toBe(0);
  expect(owner!.byteLength).toBe(16);
  expect(memory.owns(owner!)).toBe(true);
  expect(lease!.active).toBe(false);
  expect(target!.get(owner!)).toBe(lease);
  current(memory, 16, 1);
  map.spy.mockRestore();
  await withManagedMemory(other, async () => {
    finish!();
    current(other, 0, 0);
  });
  expect(calls).toBe(1);
  expect(owner!.byteLength).toBe(0);
  expect(target!.get(owner!)).toBeUndefined();
  expect(actual).toEqual([{}]);
  current(memory, 0, 0);
  finish!();
  expect(calls).toBe(1);
  memory.dispose();
  other.dispose();
});

it("attempts actual registry deletion after original destructor null and preserves it over a post-deletion secondary registry error", () => {
  const memory = new ManagedMemory(limits),
    actual = records(memory);
  let owner: ArrayBuffer | undefined,
    lease: MemoryLease | undefined,
    calls = 0;
  const map = registry(memory, () => owner),
    result = allocateManagedRenderMetadata(
      memory,
      16,
      () => (owner = new ArrayBuffer(16)),
      false,
      (value) => {
        calls++;
        expect(map.actual()!.get(value)).toBe(lease);
        current(memory, 16, 1);
        detach(value);
        throw null;
      },
      (admitted) => {
        lease = admitted;
      },
    ),
    remove = WeakMap.prototype.delete;
  vi.spyOn(WeakMap.prototype, "delete").mockImplementation(function (
    this: WeakMap<object, MemoryLease>,
    key,
  ) {
    const result = remove.call(this, key);
    if (this === map.actual() && key === owner)
      throw Error("secondary registry cleanup");
    return result;
  });
  expect(failure(() => releaseRenderMetadata(result))).toBeNull();
  expect(calls).toBe(1);
  expect(result.byteLength).toBe(0);
  expect(map.actual()!.get(result)).toBeUndefined();
  expect(actual).toEqual([{}]);
  current(memory, 0, 0);
  vi.restoreAllMocks();
  memory.dispose();
});

it("preserves a prior actual backing and original registry association after duplicate owner rejection then permits native backing retry", () => {
  const memory = new ManagedMemory(limits);
  let owner: ArrayBuffer | undefined,
    calls = 0;
  const map = registry(memory, () => owner),
    prior = allocateManagedRenderMetadata(
      memory,
      16,
      () => (owner = new ArrayBuffer(16)),
      true,
      (value) => {
        calls++;
        detach(value);
      },
    ),
    previous = map.actual()!.get(prior),
    freshCleanup = vi.fn(detach);
  expect(() =>
    allocateManagedRenderMetadata(memory, 16, () => prior, false, freshCleanup),
  ).toThrow(/already owned resource/);
  expect(freshCleanup).not.toHaveBeenCalled();
  expect(calls).toBe(0);
  expect(prior.byteLength).toBe(16);
  expect(memory.owns(prior)).toBe(true);
  expect(map.actual()!.get(prior)).toBe(previous);
  current(memory, 16, 1);
  const retry = allocateManagedRenderMetadata(
    memory,
    16,
    () => new ArrayBuffer(16),
    false,
    detach,
  );
  resizeRenderMetadata(retry, 24);
  current(memory, 40, 2);
  releaseRenderMetadata(retry);
  expect(retry.byteLength).toBe(0);
  expect(prior.byteLength).toBe(16);
  releaseRenderMetadata(prior);
  expect(prior.byteLength).toBe(0);
  expect(calls).toBe(1);
  expect(map.actual()!.get(prior)).toBeUndefined();
  current(memory, 0, 0);
  memory.dispose();
});

it("refuses a known active or retiring metadata alias under another allocator before adoption and leaves the original actual backing and mapping unchanged", async () => {
  for (const retiring of [false, true]) {
    const first = new ManagedMemory(limits),
      second = new ManagedMemory(limits),
      firstRecords = records(first),
      secondRecords = records(second),
      adopt = vi.spyOn(second, "adopt"),
      rejectedCleanup = vi.fn(detach);
    let owner: ArrayBuffer | undefined,
      lease: MemoryLease | undefined,
      finish: (() => void) | undefined,
      calls = 0;
    const map = registry(first, () => owner),
      prior = allocateManagedRenderMetadata(
        first,
        16,
        () => (owner = new ArrayBuffer(16)),
        true,
        (value) => {
          calls++;
          expect(map.actual()!.get(value)).toBe(lease);
          current(first, 16, 1);
          detach(value);
        },
        (admitted) => {
          lease = admitted;
          if (retiring) finish = admitted.deferRelease();
        },
      );
    if (retiring) releaseRenderMetadata(prior);
    expect(lease!.active).toBe(!retiring);
    await withManagedMemory(second, async () => {
      expect(() =>
        allocateManagedRenderMetadata(
          second,
          16,
          () => prior,
          false,
          rejectedCleanup,
        ),
      ).toThrow(/already owned resource/);
      expect(adopt).not.toHaveBeenCalled();
      expect(rejectedCleanup.mock.calls.length).toBe(0);
      expect(prior.byteLength).toBe(16);
      expect(first.owns(prior)).toBe(true);
      expect(second.owns(prior)).toBe(false);
      expect(map.actual()!.get(prior)).toBe(lease);
      expect(firstRecords[0]!.value).toBe(prior);
      expect(secondRecords).toEqual([]);
      expect(calls).toBe(0);
      current(first, 16, 1);
      current(second, 0, 0);
      if (retiring) finish!();
      else releaseRenderMetadata(prior);
    });
    expect(calls).toBe(1);
    expect(prior.byteLength).toBe(0);
    expect(map.actual()!.get(prior)).toBeUndefined();
    expect(firstRecords).toEqual([{}]);
    current(first, 0, 0);
    const retry = allocateManagedRenderMetadata(
      second,
      16,
      () => new ArrayBuffer(16),
      false,
      detach,
    );
    releaseRenderMetadata(retry);
    expect(retry.byteLength).toBe(0);
    current(second, 0, 0);
    first.dispose();
    second.dispose();
    vi.restoreAllMocks();
  }
});

it("does not manually destroy a metadata owner newly registered under another allocator by an adoption hook before the hook throws original null", () => {
  const first = new ManagedMemory(limits),
    second = new ManagedMemory(limits),
    firstRecords = records(first),
    secondRecords = records(second),
    rejectedCleanup = vi.fn(detach);
  let owner: ArrayBuffer | undefined,
    lease: MemoryLease | undefined,
    calls = 0;
  const map = registry(first, () => owner);
  vi.spyOn(second, "adopt").mockImplementation((value) => {
    allocateManagedRenderMetadata(
      first,
      16,
      () => value as ArrayBuffer,
      true,
      (actual) => {
        calls++;
        expect(map.actual()!.get(actual)).toBe(lease);
        detach(actual);
      },
      (admitted) => {
        lease = admitted;
      },
    );
    throw null;
  });
  expect(
    failure(() =>
      allocateManagedRenderMetadata(
        second,
        16,
        () => (owner = new ArrayBuffer(16)),
        false,
        rejectedCleanup,
      ),
    ),
  ).toBeNull();
  expect(rejectedCleanup.mock.calls.length).toBe(0);
  expect(calls).toBe(0);
  expect(owner!.byteLength).toBe(16);
  expect(first.owns(owner!)).toBe(true);
  expect(second.owns(owner!)).toBe(false);
  expect(map.actual()!.get(owner!)).toBe(lease);
  expect(firstRecords[0]!.value).toBe(owner);
  expect(secondRecords).toEqual([]);
  current(first, 16, 1);
  current(second, 0, 0);
  releaseRenderMetadata(owner!);
  expect(calls).toBe(1);
  expect(owner!.byteLength).toBe(0);
  expect(firstRecords).toEqual([{}]);
  current(first, 0, 0);
  first.dispose();
  second.dispose();
});
