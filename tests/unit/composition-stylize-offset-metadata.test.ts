import { afterEach, expect, it, vi } from "vitest";
import { chromaticOffset } from "../../packages/renderer-core/src/composition/render/stylize-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
const originals = [
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 0,
      offset: [2.5, -1.25],
    },
    kind: "offset",
    value: [2.5, -1.25],
    accesses: ["params.offset", "offset.0", "offset.1"],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 0.5,
      offset: [0, 0],
    },
    kind: "offset",
    value: [0, 0],
    accesses: ["params.offset", "offset.0", "offset.1"],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 1,
      offset: [0.03125, -0.03125],
    },
    kind: "offset",
    value: [0.0625, 0],
    accesses: ["params.offset", "offset.0", "offset.1"],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 0.7,
      offset: [2.5, -1.25],
    },
    kind: "offset",
    value: [2.5, -1.25],
    accesses: ["params.offset", "offset.0", "offset.1"],
  },
  {
    id: "stylize.chromatic-aberration",
    params: {
      amount: 1,
      offset: [-1000, 1000],
    },
    kind: "offset",
    value: [-1000, 1000],
    accesses: ["params.offset", "offset.0", "offset.1"],
  },
] as const;
const limits = { pixels: 1048576, metadata: 2097152 };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function traced(raw: { offset: readonly number[] }, accesses: string[]) {
  return new Proxy(
    {
      ...raw,
      offset: new Proxy(raw.offset, {
        get(t, k, r) {
          accesses.push("offset." + String(k));
          return Reflect.get(t, k, r);
        },
      }),
    },
    {
      get(t, k, r) {
        accesses.push("params." + String(k));
        return Reflect.get(t, k, r);
      },
    },
  );
}
afterEach(() => vi.restoreAllMocks());
it("preserves all five original offset values, positive zero and exact original getter order in inactive and owned active routes", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        accesses: string[] = [],
        p = traced(row.params, accesses);
      let output: readonly [number, number] | undefined;
      const produce = async () => {
        output = chromaticOffset(p as never);
      };
      if (active) await withManagedMemory(memory, produce);
      else await produce();
      expect(output).toEqual(row.value);
      expect(accesses).toEqual(row.accesses);
      for (let i = 0; i < 2; i++)
        expect(Object.is(output![i], row.value[i])).toBe(true);
      expect(memory.owns(output!)).toBe(active);
      if (active) {
        expect(memory.statistics.current.metadata).toBe(272);
        releaseRenderMetadata(output!);
        expect(output).toHaveLength(0);
      } else expect(output).toHaveLength(2);
      expect(row.params.offset).toHaveLength(2);
      empty(memory);
      memory.dispose();
    }
});
it("rejects exact 271-byte result quota before borrowed root/child getters and original math factory", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 271 }),
    accesses: string[] = [],
    p = traced(originals[0]!.params, accesses);
  await withManagedMemory(memory, async () => {
    const round = vi.spyOn(Math, "round");
    expect(() => chromaticOffset(p as never)).toThrow(/metadata/);
    expect(accesses).toEqual([]);
    expect(round).not.toHaveBeenCalled();
    empty(memory);
  });
  memory.dispose();
});
it("holds actual 272-byte admission during both original round/getter producers and keeps the actual returned array owned by captured allocator outside scope even while another scope is active", async () => {
  const first = new ManagedMemory(limits),
    second = new ManagedMemory(limits),
    accesses: string[] = [],
    p = traced(originals[3]!.params, accesses);
  let output: readonly [number, number] | undefined;
  await withManagedMemory(first, async () => {
    const round = Math.round,
      reserve = vi.spyOn(first, "reserve");
    let calls = 0;
    vi.spyOn(Math, "round").mockImplementation((v) => {
      calls++;
      expect(first.statistics.current.metadata).toBe(272);
      expect(first.statistics.reservations).toBe(1);
      return round(v);
    });
    output = chromaticOffset(p as never);
    expect(calls).toBe(2);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 272],
    ]);
    expect(first.owns(output)).toBe(true);
  });
  vi.restoreAllMocks();
  expect(output).toEqual(originals[3]!.value);
  expect(accesses).toEqual(originals[3]!.accesses);
  await withManagedMemory(second, async () => {
    expect(first.owns(output!)).toBe(true);
    expect(second.owns(output!)).toBe(false);
    expect(first.statistics.current.metadata).toBe(272);
    releaseRenderMetadata(output!);
    expect(output).toHaveLength(0);
    empty(first);
    empty(second);
  });
  first.dispose();
  second.dispose();
});
it("preserves original early/mid round or child getter null over secondary admission cleanup and permits exact retry", async () => {
  for (const cut of ["getter", 1, 2] as const) {
    const memory = new ManagedMemory(limits),
      reserve = memory.reserve.bind(memory);
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary metadata cleanup");
        });
        return lease;
      });
      const p: { offset: [number, number] } = {
        offset:
          cut === "getter"
            ? new Proxy([2.5, -1.25] as [number, number], {
                get(t, k, r) {
                  if (k === "1") throw null;
                  return Reflect.get(t, k, r);
                },
              })
            : [2.5, -1.25],
      };
      if (cut !== "getter") {
        const round = Math.round;
        let calls = 0;
        vi.spyOn(Math, "round").mockImplementation((v) => {
          if (++calls === cut) throw null;
          return round(v);
        });
      }
      let failure: unknown = "unset";
      try {
        chromaticOffset(p);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      empty(memory);
      vi.restoreAllMocks();
      const output = chromaticOffset({ offset: [2.5, -1.25] });
      expect(output).toEqual([2.5, -1.25]);
      releaseRenderMetadata(output);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual completed offset array after adoption null and preserves null over secondary lease cleanup with original borrowed vectors intact", async () => {
  const memory = new ManagedMemory(limits),
    reserve = memory.reserve.bind(memory),
    params = { offset: [2.5, -1.25] as [number, number] };
  let actual: object | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw Error("secondary metadata cleanup");
      });
      return lease;
    });
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      actual = args[0];
      expect(actual).toEqual([2.5, -1.25]);
      expect(memory.statistics.current.metadata).toBe(272);
      throw null;
    });
    let failure: unknown = "unset";
    try {
      chromaticOffset(params);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual).toEqual([]);
    expect(params.offset).toEqual([2.5, -1.25]);
    empty(memory);
    vi.restoreAllMocks();
    const output = chromaticOffset(params);
    expect(output).toEqual([2.5, -1.25]);
    releaseRenderMetadata(output);
    empty(memory);
  });
  memory.dispose();
});
it("retires actual output through consumer, scratch and allocator lifetimes and propagates first cleanup null after the actual array clears", async () => {
  for (const route of ["consumer", "scratch", "allocator"]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory);
    let output: readonly [number, number] | undefined;
    await withManagedMemory(memory, async () => {
      if (route === "scratch") memory.beginScratch();
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
        adopt(value, lease, (v) => {
          destroy?.(v);
          throw null;
        }),
      );
      output = chromaticOffset({ offset: [0.03125, -0.03125] });
      expect(output).toEqual([0.0625, 0]);
      expect(Object.is(output[1], 0)).toBe(true);
      expect(memory.owns(output)).toBe(true);
    });
    let failure: unknown = "unset";
    try {
      if (route === "consumer") releaseRenderMetadata(output!);
      else if (route === "scratch") memory.endScratch();
      else memory.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(output).toHaveLength(0);
    empty(memory);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("reuses the actual admitted caller control through original math and actual offset consumer without a second output lease", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      work = allocateRenderMetadata<{ offset?: [number, number] }>(
        512,
        () => ({}),
        false,
        (value) => {
          if (value.offset) (value.offset as number[]).length = 0;
          delete value.offset;
        },
      ),
      params = { offset: [2.5, -1.25] as [number, number] },
      round = Math.round;
    vi.spyOn(Math, "round").mockImplementation((v) => {
      expect(memory.owns(work)).toBe(true);
      expect(memory.statistics.current.metadata).toBe(512);
      return round(v);
    });
    const output = chromaticOffset(params, work);
    expect(work.offset).toBe(output);
    expect(output).toEqual([2.5, -1.25]);
    expect(memory.owns(output)).toBe(false);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 512],
    ]);
    releaseRenderMetadata(work);
    expect(work).toEqual({});
    expect(output).toHaveLength(0);
    expect(params.offset).toEqual([2.5, -1.25]);
    empty(memory);
  });
  memory.dispose();
});
