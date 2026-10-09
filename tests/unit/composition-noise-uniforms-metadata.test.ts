import { afterEach, expect, it, vi } from "vitest";
import { noiseFieldUniforms } from "../../packages/renderer-core/src/composition/render/noise-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
type Controls = Parameters<typeof noiseFieldUniforms>[0];
type Uniforms = ReturnType<typeof noiseFieldUniforms>;
type Row = { controls: Controls; uniforms: Uniforms; accesses: string[] };
const originals = JSON.parse(
  '[{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"uniforms":{"inverseScale":16384,"octaves":4,"seedParts":[1,0],"zParts":[0,0,0]},"accesses":["inverseScale","octaves","seed","seed","z","z","zWeight"]},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"uniforms":{"inverseScale":1048576,"octaves":1,"seedParts":[0,0],"zParts":[46144,65532,0]},"accesses":["inverseScale","octaves","seed","seed","z","z","zWeight"]},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"uniforms":{"inverseScale":14315,"octaves":8,"seedParts":[65535,32767],"zParts":[46144,65532,224]},"accesses":["inverseScale","octaves","seed","seed","z","z","zWeight"]},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"uniforms":{"inverseScale":105,"octaves":8,"seedParts":[65535,32767],"zParts":[19392,3,0]},"accesses":["inverseScale","octaves","seed","seed","z","z","zWeight"]},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"uniforms":{"inverseScale":419430,"octaves":3,"seedParts":[32768,0],"zParts":[0,0,8]},"accesses":["inverseScale","octaves","seed","seed","z","z","zWeight"]},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"uniforms":{"inverseScale":8252,"octaves":7,"seedParts":[12345,0],"zParts":[19,0,224]},"accesses":["inverseScale","octaves","seed","seed","z","z","zWeight"]}]',
) as Row[];
const limits = { pixels: 1048576, metadata: 2097152 };
type Phase = {
  managed?: boolean;
  uniformBase?: Uniforms;
  seedParts?: number[];
  zParts?: number[];
  producer?: () => Uniforms;
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
it("preserves six independently frozen original complete uniform records and exact control getter order active and inactive without changing borrowed controls", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        accesses: string[] = [],
        raw = structuredClone(row.controls),
        traced = new Proxy(raw, {
          get(t, k, r) {
            accesses.push(String(k));
            return Reflect.get(t, k, r);
          },
        });
      let result: Uniforms | undefined;
      const produce = async () => {
        result = noiseFieldUniforms(traced);
      };
      if (active) await withManagedMemory(memory, produce);
      else await produce();
      expect(result).toEqual(row.uniforms);
      expect(accesses).toEqual(row.accesses);
      expect(memory.owns(result!)).toBe(active);
      const seed = result!.seedParts,
        z = result!.zParts;
      if (active) {
        expect(memory.statistics.current.metadata).toBe(1536);
        releaseRenderMetadata(result!);
        expect(result).toEqual({});
        expect(seed).toEqual([]);
        expect(z).toEqual([]);
      } else expect(result).toEqual(row.uniforms);
      expect(raw).toEqual(row.controls);
      empty(memory);
      memory.dispose();
    }
});
it("rejects exact temporary-header and uniform-result capacity cuts before borrowed getters or record/vector factories", async () => {
  for (const quota of [1023, 2559]) {
    const memory = new ManagedMemory({ ...limits, metadata: quota }),
      getPhase = observe(memory),
      get = vi.fn((t: object, k: PropertyKey, r: unknown) =>
        Reflect.get(t, k, r),
      );
    await withManagedMemory(memory, async () => {
      const reserve = vi.spyOn(memory, "reserve");
      expect(() =>
        noiseFieldUniforms(
          new Proxy<Controls>(originals[0]!.controls, { get }),
        ),
      ).toThrow(/metadata/);
      expect(get).not.toHaveBeenCalled();
      expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual(
        quota === 1023
          ? [["metadata", 1024]]
          : [
              ["metadata", 1024],
              ["metadata", 1536],
            ],
      );
      if (getPhase()) expect(getPhase()).toEqual({});
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("captures actual partial record and vectors before each original getter, holds one producer under admitted capacity then retains result with both vectors outside scope and under another active allocator", async () => {
  const memory = new ManagedMemory(limits),
    second = new ManagedMemory(limits),
    getPhase = observe(memory),
    accesses: string[] = [],
    raw = structuredClone(originals[0]!.controls);
  let result: Uniforms | undefined,
    base: Uniforms | undefined,
    seed: number[] | undefined,
    z: number[] | undefined;
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve");
    result = noiseFieldUniforms(
      new Proxy(raw, {
        get(t, k, r) {
          const index = accesses.length;
          accesses.push(String(k));
          const phase = getPhase()!;
          expect(memory.owns(phase)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(2560);
          expect(memory.statistics.reservations).toBe(2);
          expect(typeof phase.producer).toBe("function");
          base = phase.uniformBase;
          expect(base).toBeDefined();
          if (index === 0) expect(base).toEqual({});
          if (index === 1) expect(base).toEqual({ inverseScale: 16384 });
          if (index === 2) {
            seed = phase.seedParts;
            expect(seed).toEqual([]);
          }
          if (index === 3) expect(seed).toEqual([1]);
          if (index === 4) {
            z = phase.zParts;
            expect(z).toEqual([]);
            expect(base!.seedParts).toBe(seed);
          }
          if (index === 5) expect(z).toEqual([0]);
          if (index === 6) expect(z).toEqual([0, 0]);
          return Reflect.get(t, k, r);
        },
      }),
    );
    expect(result).toBe(base);
    expect(result.seedParts).toBe(seed);
    expect(result.zParts).toBe(z);
    expect(result).toEqual(originals[0]!.uniforms);
    expect(getPhase()).toEqual({});
    expect(memory.owns(result)).toBe(true);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 1024],
      ["metadata", 1536],
    ]);
    expect(memory.statistics.current.metadata).toBe(1536);
  });
  expect(accesses).toEqual(originals[0]!.accesses);
  await withManagedMemory(second, async () => {
    expect(memory.owns(result!)).toBe(true);
    expect(second.owns(result!)).toBe(false);
    expect(result).toEqual(originals[0]!.uniforms);
    releaseRenderMetadata(result!);
    expect(result).toEqual({});
    expect(seed).toEqual([]);
    expect(z).toEqual([]);
    empty(memory);
    empty(second);
  });
  expect(raw).toEqual(originals[0]!.controls);
  memory.dispose();
  second.dispose();
});
it("clears actual record and partial seed/z vectors after every original early or mid getter null, preserves null over secondary phase/result cleanup and permits exact retry", async () => {
  for (let cut = 0; cut < 7; cut++) {
    const memory = new ManagedMemory(limits),
      getPhase = observe(memory),
      reserve = memory.reserve.bind(memory),
      raw = structuredClone(originals[0]!.controls);
    let base: Uniforms | undefined,
      seed: number[] | undefined,
      z: number[] | undefined,
      calls = 0;
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
      let failure: unknown = "unset";
      try {
        noiseFieldUniforms(
          new Proxy(raw, {
            get(t, k, r) {
              if (calls++ === cut) {
                const phase = getPhase()!;
                base = phase.uniformBase;
                seed = phase.seedParts;
                z = phase.zParts;
                if (cut === 3) expect(seed).toEqual([1]);
                if (cut === 5) expect(z).toEqual([0]);
                if (cut === 6) expect(z).toEqual([0, 0]);
                throw null;
              }
              return Reflect.get(t, k, r);
            },
          }),
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(base).toEqual({});
      if (seed) expect(seed).toEqual([]);
      if (z) expect(z).toEqual([]);
      expect(getPhase()).toEqual({});
      expect(raw).toEqual(originals[0]!.controls);
      empty(memory);
      vi.restoreAllMocks();
      const retry = noiseFieldUniforms(raw);
      expect(retry).toEqual(originals[0]!.uniforms);
      releaseRenderMetadata(retry);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual temporary header or completed uniform record and both vectors after adoption null preserving first null over secondary cleanup and borrowed controls", async () => {
  for (const cut of [1024, 1536]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory),
      raw = structuredClone(originals[0]!.controls),
      get = vi.fn((t: object, k: PropertyKey, r: unknown) =>
        Reflect.get(t, k, r),
      );
    let phase: Phase | undefined,
      actual: object | undefined,
      seed: unknown,
      z: unknown;
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
          if (cut === 1536) {
            expect(actual).toBe(phase!.uniformBase);
            expect(actual).toEqual(originals[0]!.uniforms);
            seed = phase!.seedParts;
            z = phase!.zParts;
          }
          throw null;
        }
        return adopt(...args);
      });
      let failure: unknown = "unset";
      try {
        noiseFieldUniforms(new Proxy<Controls>(raw, { get }));
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(actual).toEqual({});
      expect(phase).toEqual({});
      if (cut === 1536) {
        expect(seed).toEqual([]);
        expect(z).toEqual([]);
      }
      expect(get.mock.calls.map((x) => String(x[1]))).toEqual(
        cut === 1024 ? [] : originals[0]!.accesses,
      );
      expect(raw).toEqual(originals[0]!.controls);
      empty(memory);
      vi.restoreAllMocks();
      const retry = noiseFieldUniforms(raw);
      expect(retry).toEqual(originals[0]!.uniforms);
      releaseRenderMetadata(retry);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires independently adopted actual uniform record and both vectors if successful temporary-phase cleanup throws null, then permits exact retry", async () => {
  const memory = new ManagedMemory(limits),
    adopt = memory.adopt.bind(memory),
    reserve = memory.reserve.bind(memory);
  let phase: Phase | undefined,
    result: Uniforms | undefined,
    seed: unknown,
    z: unknown;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      if (args[1].bytes === 1024) phase = args[0] as Phase;
      else {
        result = args[0] as Uniforms;
        seed = result.seedParts;
        z = result.zParts;
      }
      return adopt(...args);
    });
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args);
      if (args[1] === 1024) {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          expect(phase!.uniformBase).toBeUndefined();
          expect(phase!.seedParts).toBeUndefined();
          expect(phase!.zParts).toBeUndefined();
          expect(memory.owns(result!)).toBe(true);
          release();
          throw null;
        });
      }
      return lease;
    });
    let failure: unknown = "unset";
    try {
      noiseFieldUniforms(originals[0]!.controls);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(phase).toEqual({});
    expect(result).toEqual({});
    expect(seed).toEqual([]);
    expect(z).toEqual([]);
    empty(memory);
    vi.restoreAllMocks();
    const retry = noiseFieldUniforms(originals[0]!.controls);
    expect(retry).toEqual(originals[0]!.uniforms);
    releaseRenderMetadata(retry);
    empty(memory);
  });
  memory.dispose();
});
it("clears actual uniform record and vectors during consumer/scratch/allocator cleanup outside scope before propagating first cleanup null", async () => {
  for (const route of ["consumer", "scratch", "allocator"]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory);
    let result: Uniforms | undefined, seed: unknown, z: unknown;
    await withManagedMemory(memory, async () => {
      if (route === "scratch") memory.beginScratch();
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
        adopt(
          value,
          lease,
          lease.bytes === 1536
            ? (v) => {
                destroy?.(v);
                throw null;
              }
            : destroy,
        ),
      );
      result = noiseFieldUniforms(originals[0]!.controls);
      seed = result.seedParts;
      z = result.zParts;
      expect(result).toEqual(originals[0]!.uniforms);
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
    expect(seed).toEqual([]);
    expect(z).toEqual([]);
    empty(memory);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("uses an actual admitted caller owner through original record/vector factories and consumer with no extra standalone phase/result leases", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      work = allocateRenderMetadata<Phase>(
        2560,
        () => ({}),
        false,
        (value) => {
          if (value.seedParts) value.seedParts.length = 0;
          if (value.zParts) value.zParts.length = 0;
          if (value.uniformBase)
            for (const key in value.uniformBase) delete value.uniformBase[key];
          for (const key in value) delete value[key as keyof Phase];
        },
      );
    const accesses: string[] = [];
    const result = noiseFieldUniforms(
        new Proxy(originals[0]!.controls, {
          get(t, k, r) {
            accesses.push(String(k));
            expect(memory.owns(work)).toBe(true);
            expect(memory.statistics.current.metadata).toBe(2560);
            expect(work.uniformBase).toBeDefined();
            return Reflect.get(t, k, r);
          },
        }),
        work,
      ),
      seed = result.seedParts,
      z = result.zParts;
    expect(work.uniformBase).toBe(result);
    expect(work.seedParts).toBe(seed);
    expect(work.zParts).toBe(z);
    expect(result).toEqual(originals[0]!.uniforms);
    expect(accesses).toEqual(originals[0]!.accesses);
    expect(memory.owns(result)).toBe(false);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 2560],
    ]);
    releaseRenderMetadata(work);
    expect(work).toEqual({});
    expect(result).toEqual({});
    expect(seed).toEqual([]);
    expect(z).toEqual([]);
    expect(originals[0]!.controls).toEqual({
      seed: 1,
      inverseScale: 16384,
      octaves: 4,
      z: 0,
      zWeight: 0,
    });
    empty(memory);
  });
  memory.dispose();
});
