import { expect, it, vi, afterEach } from "vitest";
import {
  ManagedMemory,
  type MemoryLease,
  type MemoryKind,
} from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  createRenderStorage,
  allocateRenderStorageAsync,
  createRenderStorageAsync,
  releaseRenderStorage,
} from "../../packages/renderer-core/src/managed-memory-context.ts";

type ResourceRecord = { value?: object; destroy?: (value: object) => void };
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
afterEach(() => vi.restoreAllMocks());

it("holds pixel and metadata charges, actual ownership and resource records through both original destructors before retiring actual record refs", () => {
  for (const kind of ["pixels", "metadata"] as MemoryKind[]) {
    const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
      actual = records(memory),
      owner = new ArrayBuffer(16),
      calls: string[] = [];
    const held = () => {
      expect(memory.statistics.current[kind]).toBe(16);
      expect(memory.statistics.reservations).toBe(1);
      expect(memory.owns(owner)).toBe(true);
      expect(lease.active).toBe(false);
      expect(actual[0]!.value).toBe(owner);
      expect(typeof actual[0]!.destroy).toBe("function");
      expect(() => memory.reserve(kind, 1)).toThrow(/quota/);
    };
    const lease = memory.reserve(kind, 16, () => {
      held();
      expect(owner.byteLength).toBe(16);
      calls.push("reservation");
    });
    memory.adopt(owner, lease, (value) => {
      held();
      expect(value).toBe(owner);
      detach(value);
      expect(memory.statistics.current[kind]).toBe(16);
      calls.push("resource");
    });
    memory.release(owner);
    expect(calls).toEqual(["reservation", "resource"]);
    expect(actual).toEqual([{}]);
    expect(owner.byteLength).toBe(0);
    expect(memory.owns(owner)).toBe(false);
    empty(memory);
    memory.dispose();
  }
});

it("keeps ownership and charges through reentrant resource and lease release without invoking either destructor twice", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    owner = new ArrayBuffer(16),
    actual = records(memory);
  let calls = 0;
  const lease = memory.reserve("pixels", 16, () => {
    calls++;
    memory.release(owner);
    lease.release();
    expect(memory.owns(owner)).toBe(true);
    expect(memory.statistics.current.pixels).toBe(16);
    expect(memory.statistics.reservations).toBe(1);
    expect(actual[0]!.value).toBe(owner);
  });
  memory.adopt(owner, lease, (value) => {
    calls++;
    memory.release(owner);
    lease.release();
    expect(memory.owns(owner)).toBe(true);
    expect(memory.statistics.current.pixels).toBe(16);
    detach(value);
  });
  lease.release();
  lease.release();
  memory.release(owner);
  expect(calls).toBe(2);
  expect(actual).toEqual([{}]);
  expect(owner.byteLength).toBe(0);
  empty(memory);
});

it("runs both destructors while charged, clears all actual owners and records and preserves first null at consumer/scratch/allocator retirement", () => {
  for (const route of ["consumer", "scratch", "allocator"]) {
    const memory = new ManagedMemory({ pixels: 32, metadata: 16 }),
      actual = records(memory),
      first = new ArrayBuffer(16),
      second = new ArrayBuffer(16);
    memory.beginScratch();
    let calls = 0;
    const lease = memory.reserve("pixels", 16, () => {
      calls++;
      expect(memory.owns(first)).toBe(true);
      expect(memory.statistics.current.pixels).toBe(32);
      throw null;
    });
    memory.adopt(first, lease, (value) => {
      calls++;
      expect(memory.owns(first)).toBe(true);
      expect(memory.statistics.current.pixels).toBe(32);
      detach(value);
      throw Error("secondary resource error");
    });
    const next = memory.reserve("pixels", 16);
    memory.adopt(second, next, (value) => {
      calls++;
      expect(memory.statistics.current.pixels).toBe(16);
      expect(memory.owns(second)).toBe(true);
      detach(value);
    });
    let failure: unknown = "unset";
    try {
      if (route === "consumer") lease.release();
      else if (route === "scratch") memory.endScratch();
      else memory.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    if (route === "consumer") memory.endScratch();
    expect(calls).toBe(3);
    expect(actual).toEqual([{}, {}]);
    expect(first.byteLength).toBe(0);
    expect(second.byteLength).toBe(0);
    empty(memory);
    memory.dispose();
  }
});

it("clears actual storage and record before zero charge after a lone resource destructor null", () => {
  for (const route of ["consumer", "scratch", "allocator"]) {
    const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
      actual = records(memory);
    memory.beginScratch();
    const owner = memory.allocate(
      "pixels",
      16,
      () => new ArrayBuffer(16),
      false,
      (value) => value,
      (value) => {
        expect(memory.statistics.current.pixels).toBe(16);
        expect(memory.owns(value)).toBe(true);
        detach(value);
        throw null;
      },
    );
    let failure: unknown = "unset";
    try {
      if (route === "consumer") memory.release(owner);
      else if (route === "scratch") memory.endScratch();
      else memory.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(owner.byteLength).toBe(0);
    expect(actual).toEqual([{}]);
    empty(memory);
    if (route === "consumer") memory.endScratch();
    memory.dispose();
  }
});

it("observes retiring ownership while refusing resize, retain, transfer and adoption mutations during cleanup", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    owner = new ArrayBuffer(16),
    next = {},
    lease = memory.reserve("pixels", 16);
  memory.adopt(owner, lease, (value) => {
    expect(memory.owns(owner)).toBe(true);
    expect(() => lease.resize(0)).toThrow(/disposed/);
    expect(() => memory.retain(owner)).toThrow(/no admitted owner/);
    expect(() => memory.transfer(owner, next)).toThrow(
      /no active admitted owner/,
    );
    expect(() => memory.adopt(next, lease)).toThrow(/no active owner/);
    const other = memory.reserve("metadata", 16);
    expect(() => memory.adopt(owner, other)).toThrow(/already owned resource/);
    other.release();
    expect(memory.owns(owner)).toBe(true);
    expect(memory.owns(next)).toBe(false);
    detach(value);
  });
  lease.release();
  expect(memory.owns(owner)).toBe(false);
  empty(memory);
});

it("denies replacement storage before its factory while old storage or its cleanup is live, then admits exact retry after retirement", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    old = new ArrayBuffer(16),
    lease = memory.reserve("pixels", 16);
  let factories = 0;
  const allocate = () =>
    memory.allocate(
      "pixels",
      16,
      () => {
        factories++;
        return new ArrayBuffer(16);
      },
      false,
      (value) => value,
      detach,
    );
  memory.adopt(old, lease, (value) => {
    expect(() => allocate()).toThrow(/quota/);
    expect(factories).toBe(0);
    detach(value);
    expect(() => allocate()).toThrow(/quota/);
    expect(factories).toBe(0);
    expect(memory.statistics.current.pixels).toBe(16);
  });
  lease.release();
  const retry = allocate();
  expect(factories).toBe(1);
  expect(retry.byteLength).toBe(16);
  memory.release(retry);
  expect(retry.byteLength).toBe(0);
  empty(memory);
});

it("keeps actual parent charge and ownership through nested child retirement and drops both actual resource records", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    actual = records(memory),
    child = memory.allocate(
      "pixels",
      16,
      () => new ArrayBuffer(16),
      false,
      (value) => value,
      (value) => {
        expect(memory.statistics.current).toEqual({ pixels: 16, metadata: 16 });
        expect(memory.statistics.reservations).toBe(2);
        expect(memory.owns(parent)).toBe(true);
        expect(memory.owns(child)).toBe(true);
        detach(value);
      },
    ),
    parent = memory.allocate(
      "metadata",
      16,
      () => ({ child }),
      false,
      (value) => value,
      (value) => {
        memory.release(child);
        expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 16 });
        expect(memory.statistics.reservations).toBe(1);
        expect(memory.owns(parent)).toBe(true);
        delete (value as { child?: ArrayBuffer }).child;
      },
    );
  memory.release(parent);
  expect(parent).toEqual({});
  expect(child.byteLength).toBe(0);
  expect(actual).toEqual([{}, {}]);
  empty(memory);
});

it("retains captured allocator charge and actual ownership while a different allocator is active during late retirement", async () => {
  const first = new ManagedMemory({ pixels: 16, metadata: 16 }),
    second = new ManagedMemory({ pixels: 16, metadata: 16 });
  let lease: MemoryLease | undefined;
  const owner = await withManagedMemory(first, async () => {
    lease = first.reserve("pixels", 16);
    const owner = new ArrayBuffer(16);
    first.adopt(owner, lease, (value) => {
      expect(first.statistics.current.pixels).toBe(16);
      expect(first.owns(owner)).toBe(true);
      expect(second.owns(owner)).toBe(false);
      empty(second);
      detach(value);
    });
    return owner;
  });
  await withManagedMemory(second, async () => {
    lease!.release();
    expect(owner.byteLength).toBe(0);
    empty(first);
    empty(second);
  });
  first.dispose();
  second.dispose();
});

it("permits reentrant allocator disposal to drain other owners while the original owner remains charged through its own destructor", () => {
  const memory = new ManagedMemory({ pixels: 32, metadata: 16 }),
    actual = records(memory),
    first = new ArrayBuffer(16),
    second = new ArrayBuffer(16),
    firstLease = memory.reserve("pixels", 16),
    secondLease = memory.reserve("pixels", 16);
  let calls = 0;
  memory.adopt(first, firstLease, (value) => {
    calls++;
    expect(memory.statistics.current.pixels).toBe(32);
    memory.dispose();
    expect(second.byteLength).toBe(0);
    expect(memory.statistics.current.pixels).toBe(16);
    expect(memory.statistics.reservations).toBe(1);
    expect(memory.owns(first)).toBe(true);
    expect(actual[0]!.value).toBe(first);
    expect(actual[1]).toEqual({});
    detach(value);
  });
  memory.adopt(second, secondLease, (value) => {
    calls++;
    expect(memory.statistics.current.pixels).toBe(32);
    expect(memory.owns(first)).toBe(true);
    expect(memory.owns(second)).toBe(true);
    expect(() => memory.reserve("pixels", 1)).toThrow(/disposed/);
    detach(value);
  });
  firstLease.release();
  expect(calls).toBe(2);
  expect(first.byteLength).toBe(0);
  expect(second.byteLength).toBe(0);
  expect(actual).toEqual([{}, {}]);
  empty(memory);
  memory.dispose();
});

it("clears actual resource-record destructor refs before a new admitted factory observes the retired ledger", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    actual = records(memory),
    first = memory.allocate(
      "pixels",
      16,
      () => new ArrayBuffer(16),
      false,
      (value) => value,
      detach,
    );
  memory.release(first);
  const retry = memory.allocate(
    "pixels",
    16,
    () => {
      expect(actual).toEqual([{}]);
      expect(first.byteLength).toBe(0);
      expect(memory.owns(first)).toBe(false);
      return new ArrayBuffer(16);
    },
    false,
    (value) => value,
    detach,
  );
  memory.dispose();
  expect(retry.byteLength).toBe(0);
  expect(actual).toEqual([{}, {}]);
  empty(memory);
});

it("keeps native sync storage lease through destruction to prevent a reentrant fallback under consumer/scratch/allocator retirement", async () => {
  for (const route of ["consumer", "scratch", "allocator"])
    for (const failed of [false, true]) {
      const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
        other = new ManagedMemory({ pixels: 16, metadata: 16 }),
        actual = records(memory);
      let destroyed = 0,
        fallback = 0;
      const owner = await withManagedMemory(memory, async () => {
        memory.beginScratch();
        return createRenderStorage(
          16,
          () => ({}),
          () => {},
          (value) => {
            destroyed++;
            expect(memory.owns(value)).toBe(true);
            expect(memory.statistics.current.pixels).toBe(16);
            releaseRenderStorage(value, () => fallback++);
            expect(fallback).toBe(0);
            expect(memory.owns(value)).toBe(true);
            if (failed) throw null;
          },
          false,
        );
      });
      await withManagedMemory(other, async () => {
        let failure: unknown = "unset";
        try {
          if (route === "consumer")
            releaseRenderStorage(owner, () => fallback++);
          else if (route === "scratch") memory.endScratch();
          else memory.dispose();
        } catch (error) {
          failure = error;
        }
        expect(failure).toBe(failed ? null : "unset");
        expect(destroyed).toBe(1);
        expect(fallback).toBe(0);
        expect(memory.owns(owner)).toBe(false);
        expect(actual).toEqual([{}]);
        empty(memory);
        empty(other);
      });
      if (route === "consumer") memory.endScratch();
      memory.dispose();
      other.dispose();
      vi.restoreAllMocks();
    }
});

it("keeps native async result lease through original destructor null and refuses reentrant fallback after the active scope changes", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    other = new ManagedMemory({ pixels: 16, metadata: 16 }),
    actual = records(memory);
  let destroyed = 0,
    fallback = 0;
  const owner = await withManagedMemory(memory, async () =>
    allocateRenderStorageAsync(
      16,
      async () => ({}),
      (value) => {
        destroyed++;
        expect(memory.owns(value)).toBe(true);
        expect(memory.statistics.current.pixels).toBe(16);
        releaseRenderStorage(value, () => fallback++);
        expect(fallback).toBe(0);
        empty(other);
        throw null;
      },
    ),
  );
  await withManagedMemory(other, async () => {
    let failure: unknown = "unset";
    try {
      releaseRenderStorage(owner, () => fallback++);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(destroyed).toBe(1);
    expect(fallback).toBe(0);
    expect(actual).toEqual([{}]);
    empty(memory);
    empty(other);
  });
  memory.dispose();
  other.dispose();
});

it("preserves async initializer null over later native cleanup while its retiring lease suppresses reentrant fallback", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    actual = records(memory);
  let destroyed = 0,
    fallback = 0;
  await withManagedMemory(memory, async () => {
    let failure: unknown = "unset";
    try {
      await createRenderStorageAsync(
        16,
        () => ({}),
        async (value) => {
          expect(memory.owns(value)).toBe(true);
          throw null;
        },
        (value) => {
          destroyed++;
          expect(memory.owns(value)).toBe(true);
          expect(memory.statistics.current.pixels).toBe(16);
          releaseRenderStorage(value, () => fallback++);
          expect(fallback).toBe(0);
          throw Error("secondary cleanup");
        },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(destroyed).toBe(1);
    expect(fallback).toBe(0);
    expect(actual).toEqual([{}]);
    empty(memory);
  });
  memory.dispose();
});

it("preserves sync initializer retirement null without destroying its already adopted native handle again", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    actual = records(memory);
  let destroyed = 0,
    fallback = 0;
  await withManagedMemory(memory, async () => {
    let failure: unknown = "unset";
    try {
      createRenderStorage(
        16,
        () => ({}),
        (value) => releaseRenderStorage(value, () => fallback++),
        (value) => {
          destroyed++;
          expect(memory.owns(value)).toBe(true);
          expect(memory.statistics.current.pixels).toBe(16);
          throw null;
        },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(destroyed).toBe(1);
    expect(fallback).toBe(0);
    expect(actual).toEqual([{}]);
    empty(memory);
  });
  memory.dispose();
});

it("uses its captured native lease when an asynchronous initializer disposes the owner before completing or failing", async () => {
  for (const failed of [false, true]) {
    const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
      actual = records(memory);
    let destroyed = 0;
    await withManagedMemory(memory, async () => {
      let failure: unknown = "unset";
      try {
        await createRenderStorageAsync(
          16,
          () => ({}),
          async (value) => {
            expect(memory.owns(value)).toBe(true);
            memory.dispose();
            expect(memory.owns(value)).toBe(true);
            expect(memory.statistics.current.pixels).toBe(16);
            expect(memory.statistics.reservations).toBe(1);
            expect(destroyed).toBe(0);
            await Promise.resolve();
            Reflect.set(value, "registered", true);
            if (failed) throw null;
          },
          (value) => {
            destroyed++;
            expect(memory.owns(value)).toBe(true);
            expect(memory.statistics.current.pixels).toBe(16);
            expect(Reflect.get(value, "registered")).toBe(true);
            Reflect.deleteProperty(value, "registered");
          },
        );
      } catch (error) {
        failure = error;
      }
      if (failed) expect(failure).toBeNull();
      else
        expect(failure).toEqual(
          Error("Managed native decode owner was disposed"),
        );
      expect(destroyed).toBe(1);
      expect(actual).toEqual([{}]);
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});

it("preserves native destructor null from async initializer release without a second fallback destruction", async () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    actual = records(memory);
  let destroyed = 0,
    fallback = 0;
  await withManagedMemory(memory, async () => {
    let failure: unknown = "unset";
    try {
      await createRenderStorageAsync(
        16,
        () => ({}),
        async (value) => releaseRenderStorage(value, () => fallback++),
        (value) => {
          destroyed++;
          expect(memory.owns(value)).toBe(true);
          expect(memory.statistics.current.pixels).toBe(16);
          throw null;
        },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(destroyed).toBe(1);
    expect(fallback).toBe(0);
    expect(actual).toEqual([{}]);
    empty(memory);
  });
  memory.dispose();
});

it("holds actual backing and records through multiple deferred release holds and retires once after the last producer settles", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    actual = records(memory),
    owner = new ArrayBuffer(16),
    lease = memory.reserve("pixels", 16),
    first = lease.deferRelease(),
    second = lease.deferRelease();
  let destroyed = 0,
    factories = 0;
  memory.adopt(owner, lease, (value) => {
    destroyed++;
    expect(memory.owns(value)).toBe(true);
    expect(memory.statistics.current.pixels).toBe(16);
    lease.release();
    first();
    second();
    detach(value);
  });
  lease.release();
  expect(lease.active).toBe(false);
  expect(memory.owns(owner)).toBe(true);
  expect(owner.byteLength).toBe(16);
  expect(actual[0]!.value).toBe(owner);
  expect(memory.statistics.current.pixels).toBe(16);
  expect(memory.statistics.reservations).toBe(1);
  expect(() => lease.deferRelease()).toThrow(/disposed/);
  expect(() => lease.resize(0)).toThrow(/disposed/);
  expect(() => memory.retain(owner)).toThrow(/no admitted owner/);
  expect(() => memory.transfer(owner, {})).toThrow(/no active admitted owner/);
  expect(() => memory.adopt({}, lease)).toThrow(/no active owner/);
  expect(() =>
    memory.allocate("pixels", 1, () => {
      factories++;
      return {};
    }),
  ).toThrow(/quota/);
  expect(factories).toBe(0);
  first();
  first();
  expect(destroyed).toBe(0);
  expect(owner.byteLength).toBe(16);
  expect(memory.statistics.current.pixels).toBe(16);
  second();
  second();
  lease.release();
  expect(destroyed).toBe(1);
  expect(owner.byteLength).toBe(0);
  expect(actual).toEqual([{}]);
  empty(memory);
});

it("settles a producer hold without retiring its still active resource and later preserves both original cleanup errors", () => {
  const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
    actual = records(memory),
    owner = new ArrayBuffer(16);
  let destroyed = 0;
  const lease = memory.reserve("pixels", 16, () => {
    destroyed++;
    expect(memory.statistics.current.pixels).toBe(16);
    throw null;
  });
  memory.adopt(owner, lease, (value) => {
    destroyed++;
    expect(memory.owns(value)).toBe(true);
    detach(value);
    throw Error("secondary cleanup");
  });
  const finish = lease.deferRelease();
  finish();
  finish();
  expect(lease.active).toBe(true);
  expect(owner.byteLength).toBe(16);
  expect(memory.owns(owner)).toBe(true);
  expect(memory.statistics.current.pixels).toBe(16);
  let failure: unknown = "unset";
  try {
    lease.release();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeNull();
  expect(destroyed).toBe(2);
  expect(actual).toEqual([{}]);
  expect(owner.byteLength).toBe(0);
  empty(memory);
});

it("keeps scratch and allocator disposal charged until deferred native cleanup attempts both destructors and preserves first null", () => {
  for (const route of ["scratch", "allocator"]) {
    const memory = new ManagedMemory({ pixels: 16, metadata: 16 }),
      actual = records(memory),
      owner = new ArrayBuffer(16);
    memory.beginScratch();
    let destroyed = 0;
    const lease = memory.reserve("pixels", 16, () => {
      destroyed++;
      expect(memory.statistics.current.pixels).toBe(16);
      throw null;
    });
    memory.adopt(owner, lease, (value) => {
      destroyed++;
      expect(memory.owns(value)).toBe(true);
      expect(memory.statistics.current.pixels).toBe(16);
      detach(value);
      throw Error("secondary cleanup");
    });
    const finish = lease.deferRelease();
    if (route === "scratch") memory.endScratch();
    else memory.dispose();
    expect(lease.active).toBe(false);
    expect(destroyed).toBe(0);
    expect(memory.owns(owner)).toBe(true);
    expect(owner.byteLength).toBe(16);
    expect(actual[0]!.value).toBe(owner);
    expect(memory.statistics.current.pixels).toBe(16);
    expect(memory.statistics.reservations).toBe(1);
    let failure: unknown = "unset";
    try {
      finish();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    finish();
    expect(destroyed).toBe(2);
    expect(owner.byteLength).toBe(0);
    expect(actual).toEqual([{}]);
    empty(memory);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
