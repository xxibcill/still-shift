import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  gradientUniforms,
  type GradientControls,
} from "../../packages/renderer-core/src/composition/render/gradient-controls.ts";
import { colorEffectKernel } from "../../packages/renderer-core/src/composition/render/color-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
type Uniforms = ReturnType<typeof gradientUniforms>;
type Row = {
  controls: GradientControls;
  uniforms: Uniforms;
  uniformAccesses: string[];
};
type NativeRow = {
  id: string;
  params: Parameters<
    NonNullable<ReturnType<typeof colorEffectKernel>>["renderGpu"]
  >[2];
  accesses: string[];
  sha256: string;
};
const originals = JSON.parse(
  '[{"params":{"start":[0,0],"end":[100,0]},"controls":{"a":5368709,"b":0,"translation":0,"mode":1,"divisorBits":14},"uniforms":{"gradientRow":[5368709,0],"gradientTranslation":[0,0,0,0],"gradientMode":1,"gradientDivisors":[65536,64,0.0625,6.103515625e-05]},"accesses":["p.start","p.end","end.0","start.0","end.1","start.1","start.0","start.1"],"uniformAccesses":["translation","a","b","mode","divisorBits","divisorBits","divisorBits","divisorBits"],"points":[[0.5,0.5],[5.25,-3.5],[8191.5,8191.5],[-0.5,-0.5],[0,0]],"ranks":[327,3440,65535,0,0]},{"params":{"start":[0,0],"end":[16,0]},"controls":{"a":8388608,"b":0,"translation":0,"mode":1,"divisorBits":12},"uniforms":{"gradientRow":[8388608,0],"gradientTranslation":[0,0,0,0],"gradientMode":1,"gradientDivisors":[262144,256,0.25,0.000244140625]},"accesses":["p.start","p.end","end.0","start.0","end.1","start.1","start.0","start.1"],"uniformAccesses":["translation","a","b","mode","divisorBits","divisorBits","divisorBits","divisorBits"],"points":[[0.5,0.5],[5.25,-3.5],[8191.5,8191.5],[-0.5,-0.5],[0,0]],"ranks":[2048,21504,65535,0,0]},{"params":{"start":[1,2],"end":[1,2]},"controls":{"a":0,"b":0,"translation":0,"mode":0,"divisorBits":0},"uniforms":{"gradientRow":[0,0],"gradientTranslation":[0,0,0,0],"gradientMode":0,"gradientDivisors":[1073741824,1048576,1024,1]},"accesses":["p.start","p.end","end.0","start.0","end.1","start.1"],"uniformAccesses":["translation","a","b","mode","divisorBits","divisorBits","divisorBits","divisorBits"],"points":[[0.5,0.5],[5.25,-3.5],[8191.5,8191.5],[-0.5,-0.5],[0,0]],"ranks":[0,0,0,0,0]},{"params":{"start":[0,0],"end":[0.001953125,0]},"controls":{"a":65536,"b":0,"translation":-128,"mode":2,"divisorBits":1},"uniforms":{"gradientRow":[65536,0],"gradientTranslation":[896,1023,1023,-1],"gradientMode":2,"gradientDivisors":[536870912,524288,512,0.5]},"accesses":["p.start","p.end","end.0","start.0","end.1","start.1","start.0","end.0","start.1","end.1"],"uniformAccesses":["translation","a","b","mode","divisorBits","divisorBits","divisorBits","divisorBits"],"points":[[0.5,0.5],[5.25,-3.5],[8191.5,8191.5],[-0.5,-0.5],[0,0]],"ranks":[65535,65535,65535,0,0]},{"params":{"start":[10,3],"end":[-7,-2]},"controls":{"a":-7266565,"b":-2137225,"translation":158154650,"mode":1,"divisorBits":12},"uniforms":{"gradientRow":[-7266565,-2137225],"gradientTranslation":[922,847,150,0],"gradientMode":1,"gradientDivisors":[262144,256,0.25,0.000244140625]},"accesses":["p.start","p.end","end.0","start.0","end.1","start.1","start.0","start.1"],"uniformAccesses":["translation","a","b","mode","divisorBits","divisorBits","divisorBits","divisorBits"],"points":[[0.5,0.5],[5.25,-3.5],[8191.5,8191.5],[-0.5,-0.5],[0,0]],"ranks":[36316,23636,0,40907,38611]},{"params":{"start":[-1000000,1000000],"end":[1000000,-1000000]},"controls":{"a":4398047,"b":-4398047,"translation":17592188000000,"mode":1,"divisorBits":29},"uniforms":{"gradientRow":[4398047,-4398047],"gradientTranslation":[768,885,1,16384],"gradientMode":1,"gradientDivisors":[2,0.001953125,1.9073486328125e-06,1.862645149230957e-09]},"accesses":["p.start","p.end","end.0","start.0","end.1","start.1","start.0","start.1"],"uniformAccesses":["translation","a","b","mode","divisorBits","divisorBits","divisorBits","divisorBits"],"points":[[0.5,0.5],[5.25,-3.5],[8191.5,8191.5],[-0.5,-0.5],[0,0]],"ranks":[32768,32768,32768,32768,32768]},{"params":{"start":[8191.9375,8191.875],"end":[8191.9375625,8191.875125]},"controls":{"a":29309,"b":58617,"translation":-1440561275,"mode":2,"divisorBits":1},"uniforms":{"gradientRow":[29309,58617],"gradientTranslation":[901,177,674,-2],"gradientMode":2,"gradientDivisors":[536870912,524288,512,0.5]},"accesses":["p.start","p.end","end.0","start.0","end.1","start.1","start.0","end.0","start.1","end.1"],"uniformAccesses":["translation","a","b","mode","divisorBits","divisorBits","divisorBits","divisorBits"],"points":[[0.5,0.5],[5.25,-3.5],[8191.5,8191.5],[-0.5,-0.5],[0,0]],"ranks":[0,0,0,0,0]},{"params":{"start":[-0.03125,0.03125],"end":[-0.03125,10.0625]},"controls":{"a":0,"b":6689980,"translation":-418124,"mode":1,"divisorBits":11},"uniforms":{"gradientRow":[0,6689980],"gradientTranslation":[692,615,1023,-1],"gradientMode":1,"gradientDivisors":[524288,512,0.5,0.00048828125]},"accesses":["p.start","p.end","end.0","start.0","end.1","start.1","start.0","start.1"],"uniformAccesses":["translation","a","b","mode","divisorBits","divisorBits","divisorBits","divisorBits"],"points":[[0.5,0.5],[5.25,-3.5],[8191.5,8191.5],[-0.5,-0.5],[0,0]],"ranks":[3062,0,65535,0,0]}]',
) as Row[];
const nativeRows = JSON.parse(
  '[{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[100,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"accesses":["start","end","startColor","endColor","amount","startColor","endColor","start","end"],"sha256":"d16254758742e9952d7a74aa237e40073f67cfa412110715b2c570ae3c058541"},{"id":"color.gradient-ramp","params":{"start":[10,3],"end":[-7,-2],"startColor":[0.2,0.8,0.1,0.3],"endColor":[0.7,0.1,0.9,0.8],"amount":0.7},"accesses":["start","end","startColor","endColor","amount","startColor","endColor","start","end"],"sha256":"0ebcde3396624f08d7aa257461ff6056d4395644d7b384c635332b3aa5eeb3aa"},{"id":"color.gradient-ramp","params":{"start":[1,2],"end":[1,2],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"accesses":["start","end","startColor","endColor","amount","startColor","endColor","start","end"],"sha256":"a47b9a4856806fe2a4276e7273c08125de2e9e7f6e2ef727af9870eea369d271"},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[0.001953125,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"accesses":["start","end","startColor","endColor","amount","startColor","endColor","start","end"],"sha256":"bf496f1a6b7e11ba9eaf362e7c6a14ed21b7c3cd4bcb5e6bd1b912bdbb1d35c2"}]',
) as NativeRow[];
const originalSigns = [
  {
    index: 0,
    controls: ["translation"],
    uniforms: [["gradientTranslation", 3]],
    ranks: [],
  },
  {
    index: 1,
    controls: ["translation"],
    uniforms: [["gradientTranslation", 3]],
    ranks: [],
  },
  { index: 2, controls: [], uniforms: [], ranks: [] },
  { index: 3, controls: [], uniforms: [], ranks: [] },
  { index: 4, controls: [], uniforms: [], ranks: [] },
  { index: 5, controls: [], uniforms: [], ranks: [] },
  { index: 6, controls: [], uniforms: [], ranks: [] },
  { index: 7, controls: [], uniforms: [], ranks: [] },
];
for (const signs of originalSigns) {
  const row = originals[signs.index]!;
  for (const key of signs.controls)
    row.controls[key as keyof GradientControls] = -0;
  for (const [key, index] of signs.uniforms)
    (row.uniforms[key as string] as number[])[index as number] = -0;
}
const limits = { pixels: 4194304, metadata: 2097152 };
type Phase = {
  managed?: boolean;
  uniforms?: Uniforms;
  row?: number[];
  translation?: number[];
  divisors?: number[];
  producer?: () => Uniforms;
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function clearWork(work: Phase) {
  for (const vector of [work.row, work.translation, work.divisors])
    if (vector) vector.length = 0;
  if (work.uniforms) for (const key in work.uniforms) delete work.uniforms[key];
  for (const key in work) delete work[key as keyof Phase];
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let phase: Phase | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((...v) => {
    if (v[1].bytes === 1024) phase = v[0] as Phase;
    return adopt(...v);
  });
  return () => phase;
}
function vectors(result: Uniforms) {
  return [
    result.gradientRow,
    result.gradientTranslation,
    result.gradientDivisors,
  ];
}
afterEach(() => vi.restoreAllMocks());
it("preserves eight independently frozen original complete uniform records, signed zeros, eight control reads and six original floor calls active and inactive without mutating borrowed controls", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        accesses: string[] = [],
        raw = structuredClone(row.controls);
      let result: Uniforms | undefined;
      const run = async () => {
        const floor = vi.spyOn(Math, "floor");
        result = gradientUniforms(
          new Proxy(raw, {
            get(t, k, r) {
              accesses.push(String(k));
              return Reflect.get(t, k, r);
            },
          }),
        );
        expect(floor).toHaveBeenCalledTimes(6);
      };
      if (active) await withManagedMemory(memory, run);
      else await run();
      expect(result).toEqual(row.uniforms);
      expect(accesses).toEqual(row.uniformAccesses);
      expect(memory.owns(result!)).toBe(active);
      const actual = vectors(result!);
      if (active) {
        expect(memory.statistics.current.metadata).toBe(2048);
        releaseRenderMetadata(result!);
        expect(result).toEqual({});
        for (const v of actual) expect(v).toEqual([]);
      }
      expect(raw).toEqual(row.controls);
      empty(memory);
      memory.dispose();
      vi.restoreAllMocks();
    }
});
it("rejects exact header and uniform result capacity cuts before original getters, floor calls or record/vector factories", async () => {
  for (const quota of [1023, 3071]) {
    const memory = new ManagedMemory({ ...limits, metadata: quota }),
      getPhase = observe(memory),
      get = vi.fn((t: object, k: PropertyKey, r: unknown) =>
        Reflect.get(t, k, r),
      );
    await withManagedMemory(memory, async () => {
      const reserve = vi.spyOn(memory, "reserve"),
        floor = vi.spyOn(Math, "floor");
      expect(() =>
        gradientUniforms(
          new Proxy<GradientControls>(originals[0]!.controls, { get }),
        ),
      ).toThrow(/metadata/);
      expect(get).not.toHaveBeenCalled();
      expect(floor).not.toHaveBeenCalled();
      expect(reserve.mock.calls.map((v) => [v[0], v[1]])).toEqual(
        quota === 1023
          ? [["metadata", 1024]]
          : [
              ["metadata", 1024],
              ["metadata", 2048],
            ],
      );
      if (getPhase()) expect(getPhase()).toEqual({});
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("captures actual partial record and all three vectors before original reads/math and retains independent result outside its scope while another allocator is active", async () => {
  const memory = new ManagedMemory(limits),
    second = new ManagedMemory(limits),
    getPhase = observe(memory),
    raw = structuredClone(originals[0]!.controls),
    accesses: string[] = [],
    floor = Math.floor;
  let result: Uniforms | undefined,
    actual: Uniforms | undefined,
    row: number[] | undefined,
    translation: number[] | undefined,
    divisors: number[] | undefined,
    floors = 0;
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve");
    vi.spyOn(Math, "floor").mockImplementation((v) => {
      const phase = getPhase()!;
      translation = phase.translation;
      expect(memory.owns(phase)).toBe(true);
      expect(memory.statistics.current.metadata).toBe(3072);
      expect(phase.uniforms).toBe(actual);
      expect(phase.row).toBe(row);
      expect(translation).toEqual(
        originals[0]!.uniforms.gradientTranslation instanceof Array
          ? (originals[0]!.uniforms.gradientTranslation as number[]).slice(
              0,
              [0, 1, 1, 2, 2, 3][floors]!,
            )
          : [],
      );
      floors++;
      return floor(v);
    });
    result = gradientUniforms(
      new Proxy(raw, {
        get(t, k, r) {
          const index = accesses.length;
          accesses.push(String(k));
          const phase = getPhase()!;
          expect(memory.owns(phase)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(3072);
          expect(memory.statistics.reservations).toBe(2);
          expect(typeof phase.producer).toBe("function");
          if (index === 0) {
            expect(phase.uniforms).toBeUndefined();
            expect(phase.row).toBeUndefined();
          }
          if (index === 1) {
            actual = phase.uniforms;
            row = phase.row;
            expect(actual).toEqual({});
            expect(row).toEqual([]);
          }
          if (index === 2) expect(row).toEqual([raw.a]);
          if (index === 3) {
            expect(actual!.gradientRow).toBe(row);
            expect(actual!.gradientTranslation).toBe(translation);
            expect(translation).toEqual(
              originals[0]!.uniforms.gradientTranslation,
            );
          }
          if (index >= 4) {
            divisors = phase.divisors;
            expect(divisors).toEqual(
              (originals[0]!.uniforms.gradientDivisors as number[]).slice(
                0,
                index - 4,
              ),
            );
          }
          return Reflect.get(t, k, r);
        },
      }),
    );
    expect(floors).toBe(6);
    expect(result).toBe(actual);
    expect(result).toEqual(originals[0]!.uniforms);
    expect(result.gradientRow).toBe(row);
    expect(result.gradientTranslation).toBe(translation);
    expect(result.gradientDivisors).toBe(divisors);
    expect(getPhase()).toEqual({});
    expect(memory.statistics.current.metadata).toBe(2048);
    expect(reserve.mock.calls.map((v) => [v[0], v[1]])).toEqual([
      ["metadata", 1024],
      ["metadata", 2048],
    ]);
  });
  expect(accesses).toEqual(originals[0]!.uniformAccesses);
  await withManagedMemory(second, async () => {
    expect(memory.owns(result!)).toBe(true);
    expect(second.owns(result!)).toBe(false);
    releaseRenderMetadata(result!);
    expect(result).toEqual({});
    for (const v of [row, translation, divisors]) expect(v).toEqual([]);
    empty(memory);
    empty(second);
  });
  expect(raw).toEqual(originals[0]!.controls);
  memory.dispose();
  second.dispose();
});
it("clears actual partial uniform record/vectors after every original getter and all six floor nulls, preserves first null over secondary cleanup and permits exact retry", async () => {
  for (const cut of [
    ...originals[0]!.uniformAccesses.map((_, i) => i),
    ...Array.from({ length: 6 }, (_, i) => `floor-${i + 1}`),
  ]) {
    const memory = new ManagedMemory(limits),
      getPhase = observe(memory),
      reserve = memory.reserve.bind(memory),
      raw = structuredClone(originals[0]!.controls);
    let actual: Uniforms | undefined,
      row: number[] | undefined,
      translation: number[] | undefined,
      divisors: number[] | undefined,
      reads = 0;
    const capture = () => {
      const phase = getPhase()!;
      actual = phase.uniforms;
      row = phase.row;
      translation = phase.translation;
      divisors = phase.divisors;
      throw null;
    };
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary cleanup");
        });
        return lease;
      });
      if (typeof cut === "string") {
        const floor = Math.floor;
        let calls = 0;
        vi.spyOn(Math, "floor").mockImplementation((v) =>
          ++calls === Number(cut.split("-")[1]) ? capture() : floor(v),
        );
      }
      let failure: unknown = "unset";
      try {
        gradientUniforms(
          new Proxy(raw, {
            get(t, k, r) {
              if (reads++ === cut) capture();
              return Reflect.get(t, k, r);
            },
          }),
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      if (actual) expect(actual).toEqual({});
      for (const v of [row, translation, divisors])
        if (v) expect(v).toEqual([]);
      expect(getPhase()).toEqual({});
      expect(raw).toEqual(originals[0]!.controls);
      empty(memory);
      vi.restoreAllMocks();
      const retry = gradientUniforms(raw);
      expect(retry).toEqual(originals[0]!.uniforms);
      releaseRenderMetadata(retry);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual header or completed uniform record and all three vectors after adoption null with first null and exact retry", async () => {
  for (const cut of [1024, 2048]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory),
      raw = structuredClone(originals[0]!.controls),
      accesses: string[] = [];
    let phase: Phase | undefined,
      actual: object | undefined,
      refs: unknown[] = [];
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary cleanup");
        });
        return lease;
      });
      vi.spyOn(memory, "adopt").mockImplementation((...v) => {
        if (v[1].bytes === 1024) phase = v[0] as Phase;
        if (v[1].bytes === cut) {
          actual = v[0];
          if (cut === 2048) {
            expect(actual).toBe(phase!.uniforms);
            expect(actual).toEqual(originals[0]!.uniforms);
            refs = vectors(actual as Uniforms);
          }
          throw null;
        }
        return adopt(...v);
      });
      let failure: unknown = "unset";
      try {
        gradientUniforms(
          new Proxy(raw, {
            get(t, k, r) {
              accesses.push(String(k));
              return Reflect.get(t, k, r);
            },
          }),
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(actual).toEqual({});
      expect(phase).toEqual({});
      for (const v of refs) expect(v).toEqual([]);
      expect(accesses).toEqual(
        cut === 1024 ? [] : originals[0]!.uniformAccesses,
      );
      expect(raw).toEqual(originals[0]!.controls);
      empty(memory);
      vi.restoreAllMocks();
      const retry = gradientUniforms(raw);
      expect(retry).toEqual(originals[0]!.uniforms);
      releaseRenderMetadata(retry);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires adopted independent record and three vectors if successful temporary cleanup throws null then permits exact retry", async () => {
  const memory = new ManagedMemory(limits),
    adopt = memory.adopt.bind(memory),
    reserve = memory.reserve.bind(memory);
  let phase: Phase | undefined,
    result: Uniforms | undefined,
    refs: unknown[] = [];
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...v) => {
      if (v[1].bytes === 1024) phase = v[0] as Phase;
      else {
        result = v[0] as Uniforms;
        refs = vectors(result);
      }
      return adopt(...v);
    });
    vi.spyOn(memory, "reserve").mockImplementation((...v) => {
      const lease = reserve(...v);
      if (v[1] === 1024) {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          for (const key of [
            "uniforms",
            "row",
            "translation",
            "divisors",
          ] as const)
            expect(phase![key]).toBeUndefined();
          expect(memory.owns(result!)).toBe(true);
          release();
          throw null;
        });
      }
      return lease;
    });
    let failure: unknown = "unset";
    try {
      gradientUniforms(originals[0]!.controls);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(phase).toEqual({});
    expect(result).toEqual({});
    for (const v of refs) expect(v).toEqual([]);
    empty(memory);
    vi.restoreAllMocks();
    const retry = gradientUniforms(originals[0]!.controls);
    expect(retry).toEqual(originals[0]!.uniforms);
    releaseRenderMetadata(retry);
    empty(memory);
  });
  memory.dispose();
});
it("clears independent result record and vectors at consumer/scratch/allocator retirement outside scope before first cleanup null", async () => {
  for (const route of ["consumer", "scratch", "allocator"]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory);
    let result: Uniforms | undefined,
      refs: unknown[] = [];
    await withManagedMemory(memory, async () => {
      if (route === "scratch") memory.beginScratch();
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
        adopt(
          value,
          lease,
          lease.bytes === 2048
            ? (v) => {
                destroy?.(v);
                throw null;
              }
            : destroy,
        ),
      );
      result = gradientUniforms(originals[0]!.controls);
      refs = vectors(result);
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
    for (const v of refs) expect(v).toEqual([]);
    empty(memory);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("uses one actual admitted caller owner for original partial record/vector factories and consumer without standalone leases or borrowed control mutation", async () => {
  const memory = new ManagedMemory(limits),
    raw = structuredClone(originals[0]!.controls);
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      work = allocateRenderMetadata<Phase>(4096, () => ({}), false, clearWork),
      accesses: string[] = [],
      result = gradientUniforms(
        new Proxy(raw, {
          get(t, k, r) {
            accesses.push(String(k));
            expect(memory.owns(work)).toBe(true);
            expect(memory.statistics.current.metadata).toBe(4096);
            return Reflect.get(t, k, r);
          },
        }),
        work,
      ),
      refs = vectors(result);
    expect(work.uniforms).toBe(result);
    expect(work.row).toBe(refs[0]);
    expect(work.translation).toBe(refs[1]);
    expect(work.divisors).toBe(refs[2]);
    expect(result).toEqual(originals[0]!.uniforms);
    expect(accesses).toEqual(originals[0]!.uniformAccesses);
    expect(memory.owns(result)).toBe(false);
    expect(reserve.mock.calls.map((v) => [v[0], v[1]])).toEqual([
      ["metadata", 4096],
    ]);
    releaseRenderMetadata(work);
    expect(work).toEqual({});
    expect(result).toEqual({});
    for (const v of refs) expect(v).toEqual([]);
    expect(raw).toEqual(originals[0]!.controls);
    empty(memory);
  });
  memory.dispose();
});
it("holds actual gradient uniform record and shared vectors through four original native GPU passes, preserves complete upload/getter hashes and retires both results after native or controls cleanup null", async () => {
  for (const active of [false, true])
    for (const row of nativeRows) {
      const memory = new ManagedMemory(limits),
        adopt = memory.adopt.bind(memory),
        h = shadowHarness(),
        accesses: string[] = [],
        raw = structuredClone(row.params);
      let actual: Uniforms | undefined,
        refs: unknown[] = [];
      const run = async () => {
        if (active) {
          vi.spyOn(memory, "adopt").mockImplementation(
            (value, lease, destroy) => {
              if (lease.bytes === 2048) {
                actual = value as Uniforms;
                refs = vectors(actual);
              }
              return adopt(value, lease, destroy);
            },
          );
          const pass = h.context.pass;
          vi.spyOn(h.context, "pass").mockImplementation((...v) => {
            expect(memory.owns(actual!)).toBe(true);
            expect(memory.statistics.current.metadata).toBe(2048);
            const uniforms = v[3] as Uniforms;
            for (const key of [
              "gradientRow",
              "gradientTranslation",
              "gradientDivisors",
            ])
              expect(uniforms[key]).toBe(actual![key]);
            return pass(...v);
          });
        }
        colorEffectKernel(row.id)!.renderGpu(
          h.context as never,
          h.input as never,
          new Proxy(raw, {
            get(t, k, r) {
              accesses.push(String(k));
              return Reflect.get(t, k, r);
            },
          }),
        );
        expect(memory.statistics.current.metadata).toBe(0);
      };
      if (active) await withManagedMemory(memory, run);
      else await run();
      expect(sha([h.records, accesses])).toBe(row.sha256);
      expect(accesses).toEqual(row.accesses);
      expect(raw).toEqual(row.params);
      if (active) {
        expect(actual).toEqual({});
        for (const v of refs) expect(v).toEqual([]);
      }
      memory.dispose();
      empty(memory);
      vi.restoreAllMocks();
    }
  for (const cut of ["native", "uniform-cleanup", "controls-cleanup"]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      h = shadowHarness();
    let controls: object | undefined,
      actual: Uniforms | undefined,
      refs: unknown[] = [];
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
        if (lease.bytes === 512) controls = value;
        if (lease.bytes === 2048) {
          actual = value as Uniforms;
          refs = vectors(actual);
        }
        return adopt(
          value,
          lease,
          lease.bytes === 2048
            ? (v) => {
                destroy?.(v);
                throw cut === "uniform-cleanup"
                  ? null
                  : Error("secondary uniform cleanup");
              }
            : lease.bytes === 512 && cut === "controls-cleanup"
              ? (v) => {
                  expect(memory.owns(actual!)).toBe(true);
                  destroy?.(v);
                  throw null;
                }
              : destroy,
        );
      });
      const pass = vi.spyOn(h.context, "pass");
      if (cut === "native")
        pass.mockImplementation(() => {
          expect(memory.owns(actual!)).toBe(true);
          throw null;
        });
      let failure: unknown = "unset";
      try {
        colorEffectKernel("color.gradient-ramp")!.renderGpu(
          h.context as never,
          h.input as never,
          nativeRows[0]!.params,
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(pass).toHaveBeenCalledTimes(cut === "controls-cleanup" ? 0 : 1);
      expect(controls).toEqual({});
      expect(actual).toEqual({});
      for (const v of refs) expect(v).toEqual([]);
      expect(memory.statistics.current.metadata).toBe(0);
    });
    memory.dispose();
    empty(memory);
    vi.restoreAllMocks();
  }
});

const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function shadowHarness() {
  let id = 1;
  const records: unknown[] = [];
  const call = (name: string, ...v: unknown[]) => {
    records.push([name, ...v]);
  };
  const pixels = [
    23, 41, 199, 213, 201, 7, 143, 81, 33, 192, 9, 151, 241, 59, 73, 0,
  ];
  const surface = (value: number, w = 2, h = 2) => ({
    id: value,
    width: w,
    height: h,
    canvas: { id: value },
    ctx: {
      getImageData: () => {
        call("read", value);
        return { data: new Uint8ClampedArray(pixels) };
      },
      putImageData: (image: { data: Uint8ClampedArray }, ...v: unknown[]) =>
        call("put", value, [...image.data], ...v),
    },
  });
  const input = surface(1),
    context = {
      createSurface: (w: number, h: number) => {
        const v = surface(++id, w, h);
        call("create", v.id, w, h);
        return v;
      },
      uploadBytes: (v: { id: number }, data: Uint8Array) =>
        call("upload", v.id, [...data]),
      pass: (
        body: string,
        out: { id: number },
        inputs: readonly { id: number }[],
        uniforms: unknown,
      ) =>
        call(
          "pass",
          body.length,
          sha(body),
          out.id,
          inputs.map((v) => v.id),
          JSON.parse(JSON.stringify(uniforms)),
        ),
    };
  return { records, input, context };
}
