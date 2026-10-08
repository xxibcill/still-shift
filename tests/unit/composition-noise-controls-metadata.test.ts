import { afterEach, expect, it, vi } from "vitest";
import {
  noiseControls,
  noiseField,
  noiseFieldUniforms,
} from "../../packages/renderer-core/src/composition/render/noise-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
type Row = {
  params: { seed: number; scale: number; octaves: number; evolution: number };
  controls: ReturnType<typeof noiseControls>;
  uniforms: Record<string, number | readonly number[]>;
  values: number[];
  accesses: string[];
};
const originals = JSON.parse(
  '[{"kind":"controls","params":{"seed":1,"scale":64,"octaves":4,"evolution":0},"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"uniforms":{"inverseScale":16384,"octaves":4,"seedParts":[1,0],"zParts":[0,0,0]},"values":[28054,29179,30818,20732,15911],"accesses":["evolution","seed","scale","octaves"],"sha256":"224c5b312d0e0b7683af05a698153801da21475ead2bacd7bfff5b19b6af6081"},{"kind":"controls","params":{"seed":0,"scale":1,"octaves":1,"evolution":-216000},"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"uniforms":{"inverseScale":1048576,"octaves":1,"seedParts":[0,0],"zParts":[46144,65532,0]},"values":[25154,50069,25665,35260,77641],"accesses":["evolution","seed","scale","octaves"],"sha256":"8eb72f1320efd9d89857f94bdde35b41abdc30441101826440cf11cf86f748b1"},{"kind":"controls","params":{"seed":2147483647,"scale":73.25,"octaves":8,"evolution":-215999.123},"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"uniforms":{"inverseScale":14315,"octaves":8,"seedParts":[65535,32767],"zParts":[46144,65532,224]},"values":[27675,27661,21890,30483,31966],"accesses":["evolution","seed","scale","octaves"],"sha256":"929e1544dc9a539248afc1e76ec3c52f04dac39fd7548b5b3fcc0f5292f5402a"},{"kind":"controls","params":{"seed":2147483647,"scale":10000,"octaves":8,"evolution":216000},"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"uniforms":{"inverseScale":105,"octaves":8,"seedParts":[65535,32767],"zParts":[19392,3,0]},"values":[37143,37146,37116,16516,26749],"accesses":["evolution","seed","scale","octaves"],"sha256":"c45846a6e52cfa7d22422e7330c1db0defeb9c4af38283a49beacb0864cf82ba"},{"kind":"controls","params":{"seed":32768,"scale":2.5,"octaves":3,"evolution":0.03125},"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"uniforms":{"inverseScale":419430,"octaves":3,"seedParts":[32768,0],"zParts":[0,0,8]},"values":[24545,17232,37424,34420,-9066],"accesses":["evolution","seed","scale","octaves"],"sha256":"1f7ffe0dca1601058681650be1fcc534f5fb30b9889634f8d8ac79028ddede48"},{"kind":"controls","params":{"seed":12345,"scale":127.0625,"octaves":7,"evolution":19.875},"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"uniforms":{"inverseScale":8252,"octaves":7,"seedParts":[12345,0],"zParts":[19,0,224]},"values":[26565,26846,26025,31060,39399],"accesses":["evolution","seed","scale","octaves"],"sha256":"427b22a116c700bad7db22d68b34859edc584e2c68abbe786c8be606a67d9984"}]',
) as Row[];
const limits = { pixels: 1048576, metadata: 2097152 },
  params = { seed: 1, scale: 64, octaves: 4, evolution: 0 };
type Phase = {
  managed?: boolean;
  controls?: Partial<ReturnType<typeof noiseControls>>;
  producer?: () => ReturnType<typeof noiseControls>;
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let phase: Phase | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((...args) => {
    if (args[1].bytes === 1024) phase = args[0] as Phase;
    return adopt(...args);
  });
  return () => phase;
}
afterEach(() => vi.restoreAllMocks());
it("preserves all six original complete control/uniform tables, 30 original fields and exact original getter order active and inactive", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        accesses: string[] = [],
        raw = structuredClone(row.params),
        traced = new Proxy(raw, {
          get(t, k, r) {
            accesses.push(String(k));
            return Reflect.get(t, k, r);
          },
        });
      let result: ReturnType<typeof noiseControls> | undefined;
      const produce = async () => {
        result = noiseControls(traced);
      };
      if (active) await withManagedMemory(memory, produce);
      else await produce();
      expect(result).toEqual(row.controls);
      expect(accesses).toEqual(row.accesses);
      expect(noiseFieldUniforms(result!)).toEqual(row.uniforms);
      expect(
        [
          [0.5, 0.5],
          [1.5, 1.5],
          [20.5, 12.5],
          [8191.5, 8191.5],
          [-0.5, -0.5],
        ].map(([x, y]) => noiseField(result!, x!, y!)),
      ).toEqual(row.values);
      expect(memory.owns(result!)).toBe(active);
      if (active) {
        expect(memory.statistics.current.metadata).toBe(512);
        releaseRenderMetadata(result!);
        expect(result).toEqual({});
      } else expect(result).toEqual(row.controls);
      expect(raw).toEqual(row.params);
      empty(memory);
      memory.dispose();
    }
});
it("rejects exact header and result quota before original borrowed getters, math or control-record factories", async () => {
  for (const quota of [1023, 1535]) {
    const memory = new ManagedMemory({ ...limits, metadata: quota }),
      getPhase = observe(memory),
      get = vi.fn((t: object, k: PropertyKey, r: unknown) =>
        Reflect.get(t, k, r),
      );
    await withManagedMemory(memory, async () => {
      const reserve = vi.spyOn(memory, "reserve"),
        floor = vi.spyOn(Math, "floor"),
        round = vi.spyOn(Math, "round");
      expect(() =>
        noiseControls(new Proxy<typeof params>(params, { get })),
      ).toThrow(/metadata/);
      expect(get).not.toHaveBeenCalled();
      expect(floor).not.toHaveBeenCalled();
      expect(round).not.toHaveBeenCalled();
      expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual(
        quota === 1023
          ? [["metadata", 1024]]
          : [
              ["metadata", 1024],
              ["metadata", 512],
            ],
      );
      if (getPhase()) expect(getPhase()).toEqual({});
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("holds actual partial record/producer under admitted phase and result capacity, transfers actual result outside scope and keeps captured allocator ownership with another scope active", async () => {
  const memory = new ManagedMemory(limits),
    second = new ManagedMemory(limits),
    getPhase = observe(memory),
    accesses: string[] = [];
  let partial: Phase["controls"],
    result: ReturnType<typeof noiseControls> | undefined;
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      raw = new Proxy(params, {
        get(t, k, r) {
          accesses.push(String(k));
          const phase = getPhase()!;
          expect(memory.owns(phase)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(1536);
          expect(memory.statistics.reservations).toBe(2);
          expect(typeof phase.producer).toBe("function");
          if (k === "seed") {
            partial = phase.controls;
            expect(partial).toEqual({});
          }
          if (k === "scale") expect(partial).toEqual({ seed: 1 });
          if (k === "octaves")
            expect(partial).toEqual({ seed: 1, inverseScale: 16384 });
          return Reflect.get(t, k, r);
        },
      });
    result = noiseControls(raw);
    expect(result).toBe(partial);
    expect(result).toEqual(originals[0]!.controls);
    expect(memory.owns(result)).toBe(true);
    expect(getPhase()).toEqual({});
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 1024],
      ["metadata", 512],
    ]);
    expect(memory.statistics.current.metadata).toBe(512);
  });
  expect(accesses).toEqual(originals[0]!.accesses);
  await withManagedMemory(second, async () => {
    expect(memory.owns(result!)).toBe(true);
    expect(second.owns(result!)).toBe(false);
    expect(result).toEqual(originals[0]!.controls);
    releaseRenderMetadata(result!);
    expect(result).toEqual({});
    empty(memory);
    empty(second);
  });
  memory.dispose();
  second.dispose();
});
it("clears actual partial controls after original early/mid getter or floor/round null preserving first null over secondary cleanup and exact retry", async () => {
  for (const cut of [
    "evolution",
    "seed",
    "scale",
    "octaves",
    "epoch",
    "z-weight",
    "round",
  ]) {
    const memory = new ManagedMemory(limits),
      getPhase = observe(memory),
      reserve = memory.reserve.bind(memory);
    let partial: Phase["controls"];
    const capture = () => {
      partial = getPhase()!.controls;
      throw null;
    };
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
      const raw = new Proxy(params, {
        get(t, k, r) {
          if (k === cut) return capture();
          return Reflect.get(t, k, r);
        },
      });
      if (cut === "epoch" || cut === "z-weight") {
        const floor = Math.floor;
        let calls = 0;
        vi.spyOn(Math, "floor").mockImplementation((v) => {
          if (++calls === (cut === "epoch" ? 1 : 2)) return capture();
          return floor(v);
        });
      }
      if (cut === "round") vi.spyOn(Math, "round").mockImplementation(capture);
      let failure: unknown = "unset";
      try {
        noiseControls(raw);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      if (partial) expect(partial).toEqual({});
      expect(getPhase()).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      const result = noiseControls(params);
      expect(result).toEqual(originals[0]!.controls);
      releaseRenderMetadata(result);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual header or completed result after adoption null without altering borrowed params and preserves null over secondary release", async () => {
  for (const cut of [1024, 512]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory),
      get = vi.fn((t: object, k: PropertyKey, r: unknown) =>
        Reflect.get(t, k, r),
      );
    let phase: Phase | undefined, actual: object | undefined;
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
        if (args[1].bytes === 1024) phase = args[0] as Phase;
        if (args[1].bytes === cut) {
          actual = args[0];
          if (cut === 512) {
            expect(actual).toBe(phase!.controls);
            expect(actual).toEqual(originals[0]!.controls);
          }
          throw null;
        }
        return adopt(...args);
      });
      let failure: unknown = "unset";
      try {
        noiseControls(new Proxy<typeof params>(params, { get }));
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(actual).toEqual({});
      expect(phase).toEqual({});
      expect(get.mock.calls.map((x) => String(x[1]))).toEqual(
        cut === 1024 ? [] : originals[0]!.accesses,
      );
      expect(params).toEqual(originals[0]!.params);
      empty(memory);
      vi.restoreAllMocks();
      const result = noiseControls(params);
      expect(result).toEqual(originals[0]!.controls);
      releaseRenderMetadata(result);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires independently adopted actual result after successful temporary-phase cleanup null and permits exact retry", async () => {
  const memory = new ManagedMemory(limits),
    adopt = memory.adopt.bind(memory),
    reserve = memory.reserve.bind(memory);
  let phase: Phase | undefined, result: object | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      if (args[1].bytes === 1024) phase = args[0] as Phase;
      else result = args[0];
      return adopt(...args);
    });
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args);
      if (args[1] === 1024) {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          expect(phase!.controls).toBeUndefined();
          expect(memory.owns(result!)).toBe(true);
          release();
          throw null;
        });
      }
      return lease;
    });
    let failure: unknown = "unset";
    try {
      noiseControls(params);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(phase).toEqual({});
    expect(result).toEqual({});
    empty(memory);
    vi.restoreAllMocks();
    const retry = noiseControls(params);
    expect(retry).toEqual(originals[0]!.controls);
    releaseRenderMetadata(retry);
    empty(memory);
  });
  memory.dispose();
});
it("clears actual result at consumer/scratch/allocator cleanup outside scope before propagating first result cleanup null", async () => {
  for (const route of ["consumer", "scratch", "allocator"]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory);
    let result: ReturnType<typeof noiseControls> | undefined;
    await withManagedMemory(memory, async () => {
      if (route === "scratch") memory.beginScratch();
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
        adopt(
          value,
          lease,
          lease.bytes === 512
            ? (v) => {
                destroy?.(v);
                throw null;
              }
            : destroy,
        ),
      );
      result = noiseControls(params);
      expect(result).toEqual(originals[0]!.controls);
      expect(memory.owns(result)).toBe(true);
    });
    let failure: unknown = "unset";
    try {
      if (route === "consumer") releaseRenderMetadata(result!);
      else if (route === "scratch") memory.endScratch();
      else memory.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(result).toEqual({});
    empty(memory);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("reuses actual admitted caller control/record through original producer and consumer with no fresh standalone phase or result lease", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      work = allocateRenderMetadata<{
        controls?: ReturnType<typeof noiseControls>;
      }>(
        512,
        () => ({}),
        false,
        (value) => {
          if (value.controls)
            for (const key in value.controls)
              delete (
                value.controls as Partial<ReturnType<typeof noiseControls>>
              )[key as keyof ReturnType<typeof noiseControls>];
          delete value.controls;
        },
      ),
      round = Math.round;
    vi.spyOn(Math, "round").mockImplementation((v) => {
      expect(memory.owns(work)).toBe(true);
      expect(memory.statistics.current.metadata).toBe(512);
      return round(v);
    });
    const result = noiseControls(params, work);
    expect(work.controls).toBe(result);
    expect(result).toEqual(originals[0]!.controls);
    expect(memory.owns(result)).toBe(false);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 512],
    ]);
    releaseRenderMetadata(work);
    expect(work).toEqual({});
    expect(result).toEqual({});
    expect(params).toEqual(originals[0]!.params);
    empty(memory);
  });
  memory.dispose();
});
