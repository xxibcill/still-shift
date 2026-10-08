import { afterEach, expect, it, vi } from "vitest";
import { mapChannel } from "../../packages/renderer-core/src/composition/render/map-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
type Control = { straight?: ((channel: number) => number) | undefined };
const original = [
  {
    pixel: [0, 0, 0, 0],
    channel: 0,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [0, 0, 0, 0],
    channel: 1,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [0, 0, 0, 0],
    channel: 2,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [0, 0, 0, 0],
    channel: 3,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [0, 0, 0, 0],
    channel: 4,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [1, 0, 1, 1],
    channel: 0,
    value: 255,
    accesses: [3, 0],
  },
  {
    pixel: [1, 0, 1, 1],
    channel: 1,
    value: 0,
    accesses: [3, 1],
  },
  {
    pixel: [1, 0, 1, 1],
    channel: 2,
    value: 255,
    accesses: [3, 2],
  },
  {
    pixel: [1, 0, 1, 1],
    channel: 3,
    value: 1,
    accesses: [3],
  },
  {
    pixel: [1, 0, 1, 1],
    channel: 4,
    value: 73,
    accesses: [3, 0, 1, 2],
  },
  {
    pixel: [13, 47, 31, 64],
    channel: 0,
    value: 52,
    accesses: [3, 0],
  },
  {
    pixel: [13, 47, 31, 64],
    channel: 1,
    value: 187,
    accesses: [3, 1],
  },
  {
    pixel: [13, 47, 31, 64],
    channel: 2,
    value: 124,
    accesses: [3, 2],
  },
  {
    pixel: [13, 47, 31, 64],
    channel: 3,
    value: 64,
    accesses: [3],
  },
  {
    pixel: [13, 47, 31, 64],
    channel: 4,
    value: 154,
    accesses: [3, 0, 1, 2],
  },
  {
    pixel: [8, 119, 31, 128],
    channel: 0,
    value: 16,
    accesses: [3, 0],
  },
  {
    pixel: [8, 119, 31, 128],
    channel: 1,
    value: 237,
    accesses: [3, 1],
  },
  {
    pixel: [8, 119, 31, 128],
    channel: 2,
    value: 62,
    accesses: [3, 2],
  },
  {
    pixel: [8, 119, 31, 128],
    channel: 3,
    value: 128,
    accesses: [3],
  },
  {
    pixel: [8, 119, 31, 128],
    channel: 4,
    value: 177,
    accesses: [3, 0, 1, 2],
  },
  {
    pixel: [200, 7, 243, 255],
    channel: 0,
    value: 200,
    accesses: [3, 0],
  },
  {
    pixel: [200, 7, 243, 255],
    channel: 1,
    value: 7,
    accesses: [3, 1],
  },
  {
    pixel: [200, 7, 243, 255],
    channel: 2,
    value: 243,
    accesses: [3, 2],
  },
  {
    pixel: [200, 7, 243, 255],
    channel: 3,
    value: 255,
    accesses: [3],
  },
  {
    pixel: [200, 7, 243, 255],
    channel: 4,
    value: 65,
    accesses: [3, 0, 1, 2],
  },
  {
    pixel: [251, 16, 93, 0],
    channel: 0,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [251, 16, 93, 0],
    channel: 1,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [251, 16, 93, 0],
    channel: 2,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [251, 16, 93, 0],
    channel: 3,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [251, 16, 93, 0],
    channel: 4,
    value: 0,
    accesses: [3],
  },
  {
    pixel: [32, 32, 32, 64],
    channel: 0,
    value: 128,
    accesses: [3, 0],
  },
  {
    pixel: [32, 32, 32, 64],
    channel: 1,
    value: 128,
    accesses: [3, 1],
  },
  {
    pixel: [32, 32, 32, 64],
    channel: 2,
    value: 128,
    accesses: [3, 2],
  },
  {
    pixel: [32, 32, 32, 64],
    channel: 3,
    value: 64,
    accesses: [3],
  },
  {
    pixel: [32, 32, 32, 64],
    channel: 4,
    value: 128,
    accesses: [3, 0, 1, 2],
  },
  {
    pixel: [255, 255, 255, 255],
    channel: 0,
    value: 255,
    accesses: [3, 0],
  },
  {
    pixel: [255, 255, 255, 255],
    channel: 1,
    value: 255,
    accesses: [3, 1],
  },
  {
    pixel: [255, 255, 255, 255],
    channel: 2,
    value: 255,
    accesses: [3, 2],
  },
  {
    pixel: [255, 255, 255, 255],
    channel: 3,
    value: 255,
    accesses: [3],
  },
  {
    pixel: [255, 255, 255, 255],
    channel: 4,
    value: 255,
    accesses: [3, 0, 1, 2],
  },
] as const;
const limits = { pixels: 1024, metadata: 4096 };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 40 original scalar results and borrowed getter order across inactive and active array and typed-view routes", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits);
    const run = () => {
      for (const row of original) {
        for (const typed of [false, true]) {
          const pixel = typed
            ? new Uint8Array(row.pixel)
            : Array.from(row.pixel);
          expect(mapChannel(pixel, row.channel)).toBe(row.value);
          expect(Array.from(pixel)).toEqual(row.pixel);
          expect(memory.owns(pixel)).toBe(false);
          empty(memory);
        }
        const accesses: number[] = [];
        const pixel = new Proxy(row.pixel, {
          get(t, k, r) {
            if (typeof k === "string" && /^[0-3]$/.test(k))
              accesses.push(Number(k));
            return Reflect.get(t, k, r);
          },
        });
        expect(mapChannel(pixel, row.channel)).toBe(row.value);
        expect(accesses).toEqual(row.accesses);
        empty(memory);
      }
    };
    if (active) await withManagedMemory(memory, async () => run());
    else run();
    memory.dispose();
  }
});
it("rejects 511-byte capacity before the working factory and original round/floor or RGB getters", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 511 });
  await withManagedMemory(memory, async () => {
    const accesses: number[] = [];
    const pixel = new Proxy([13, 47, 31, 64], {
      get(t, k, r) {
        if (typeof k === "string" && /^[0-3]$/.test(k))
          accesses.push(Number(k));
        return Reflect.get(t, k, r);
      },
    });
    const round = vi.spyOn(Math, "round"),
      floor = vi.spyOn(Math, "floor"),
      adopt = vi.spyOn(memory, "adopt");
    expect(() => mapChannel(pixel, 4)).toThrow(/metadata/);
    expect(accesses).toEqual([3]);
    expect(round).not.toHaveBeenCalled();
    expect(floor).not.toHaveBeenCalled();
    expect(adopt).not.toHaveBeenCalled();
    empty(memory);
  });
  memory.dispose();
});
it("keeps the original alpha-channel early return with no admission or producer even with zero available capacity", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1 });
  await withManagedMemory(memory, async () => {
    const held = memory.reserve("metadata", 1);
    const reserve = vi.spyOn(memory, "reserve"),
      round = vi.spyOn(Math, "round");
    expect(mapChannel([13, 47, 31, 64], 3)).toBe(64);
    expect(reserve).not.toHaveBeenCalled();
    expect(round).not.toHaveBeenCalled();
    held.release();
    empty(memory);
  });
  memory.dispose();
});
it("owns the actual straight closure through each original consumer and drops it after scalar publication", async () => {
  const memory = new ManagedMemory(limits),
    adopt = memory.adopt.bind(memory);
  let actual: Control | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      actual = args[0] as Control;
      return adopt(...args);
    });
    const round = Math.round,
      floor = Math.floor;
    let rounds = 0,
      floors = 0;
    vi.spyOn(Math, "round").mockImplementation((value) => {
      rounds++;
      expect(memory.statistics.current.metadata).toBe(512);
      expect(memory.owns(actual!)).toBe(true);
      expect(actual!.straight).toBeTypeOf("function");
      return round(value);
    });
    vi.spyOn(Math, "floor").mockImplementation((value) => {
      floors++;
      expect(memory.statistics.current.metadata).toBe(512);
      expect(actual!.straight).toBeTypeOf("function");
      return floor(value);
    });
    expect(mapChannel([13, 47, 31, 64], 4)).toBe(154);
    expect(rounds).toBe(3);
    expect(floors).toBe(1);
    expect(actual!.straight).toBeUndefined();
    expect(memory.owns(actual!)).toBe(false);
    empty(memory);
  });
  memory.dispose();
});
it("preserves early/mid round and final floor null over secondary lease failure, clears the actual closure and permits retry", async () => {
  for (const failAt of [1, 2, 4]) {
    const memory = new ManagedMemory(limits),
      reserve = memory.reserve.bind(memory),
      adopt = memory.adopt.bind(memory);
    let actual: Control | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary retirement");
        });
        return lease;
      });
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        actual = args[0] as Control;
        return adopt(...args);
      });
      const round = Math.round,
        floor = Math.floor;
      let calls = 0;
      vi.spyOn(Math, "round").mockImplementation((value) => {
        if (++calls === failAt) throw null;
        return round(value);
      });
      vi.spyOn(Math, "floor").mockImplementation((value) => {
        if (++calls === failAt) throw null;
        return floor(value);
      });
      let failure: unknown = "unset";
      try {
        mapChannel([13, 47, 31, 64], 4);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(actual!.straight).toBeUndefined();
      empty(memory);
      vi.restoreAllMocks();
      expect(mapChannel([13, 47, 31, 64], 4)).toBe(154);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears the actual controller when adoption throws null before any straight producer or math", async () => {
  const memory = new ManagedMemory(limits);
  let actual: Control | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value) => {
      actual = value as Control;
      throw null;
    });
    const round = vi.spyOn(Math, "round");
    let failure: unknown = "unset";
    try {
      mapChannel([13, 47, 31, 64], 4);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual).toEqual({ straight: undefined });
    expect(round).not.toHaveBeenCalled();
    empty(memory);
    vi.restoreAllMocks();
    expect(mapChannel([13, 47, 31, 64], 4)).toBe(154);
    empty(memory);
  });
  memory.dispose();
});
it("propagates successful-consumer cleanup null after the actual closure and capacity retire", async () => {
  const memory = new ManagedMemory(limits),
    reserve = memory.reserve.bind(memory),
    adopt = memory.adopt.bind(memory);
  let actual: Control | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw null;
      });
      return lease;
    });
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      actual = args[0] as Control;
      return adopt(...args);
    });
    let failure: unknown = "unset";
    try {
      mapChannel([13, 47, 31, 64], 4);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual!.straight).toBeUndefined();
    empty(memory);
  });
  memory.dispose();
});
