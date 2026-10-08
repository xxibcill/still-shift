import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { colorEffectKernel } from "../../packages/renderer-core/src/composition/render/color-effects.ts";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
type Row = {
  id: string;
  params: Parameters<
    NonNullable<ReturnType<typeof colorEffectKernel>>["renderGpu"]
  >[2];
  accesses: string[];
  inputAccesses: string[];
  sha256: string;
};
const originals = JSON.parse(
  '[{"id":"color.curves","params":{"curve":[[0,0],[1,1]],"amount":1},"accesses":["curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"d7c2c3d8a3c66e3f4af1bc483e736d06533f1be0cce306393fa0bcb91fae9bc4"},{"id":"color.levels","params":{"inputBlack":0,"inputWhite":1,"gamma":1,"outputBlack":0,"outputWhite":1},"accesses":["inputBlack","inputWhite","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","inputBlack","inputWhite","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","inputBlack","inputWhite","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","inputBlack","inputWhite","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"282162db5f8c8010c3b5f71d3331cffbff5f0a960387807e3c2ed2fe8673b876"},{"id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"accesses":["black","white","amount","black","white","amount","black","white","amount","black","white","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"6795d57c5dfb059623f8283d2f3ea2b96f82b3905766f368bb62f524e4b32bb3"},{"id":"color.hue-saturation","params":{"hue":0,"saturation":0,"lightness":0},"accesses":["hue","saturation","lightness","hue","saturation","lightness","hue","saturation","lightness","hue","saturation","lightness"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"cc39f8186fe8bbeecf207683a1236ef59dff5d30a82914ce8e38a10b12d24289"},{"id":"color.exposure","params":{"exposure":0,"offset":0,"gamma":1},"accesses":["exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"1f02885ee8f385887d15480c2dca2b1b22da4af426b964772a168901df89d4ec"},{"id":"color.brightness-contrast","params":{"brightness":0,"contrast":0},"accesses":["contrast","brightness","brightness","brightness","contrast","brightness","brightness","brightness","contrast","brightness","brightness","brightness","contrast","brightness","brightness","brightness"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"5e11039d4ac5268ef02f2e68ee419ee905800033fd7f124af288fed91127585e"},{"id":"color.fill","params":{"color":[1,1,1,1],"amount":1},"accesses":["color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"4304cdc4409d539ff92ccab544dbe3ec5979ce98034c89d354286eb11c2800f3"},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[100,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"accesses":["start","end","startColor","endColor","amount","amount","amount","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"3eabd01dbfdb0c0a1fded041effe0c07b97a504249c84d91da562a327c93e93b"},{"id":"color.invert","params":{"amount":1},"accesses":["amount","amount","amount","amount","amount","amount","amount","amount","amount","amount","amount","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"9f6a756515e7754d4b00b136ce260511cb8492d9f9d011431bdb3010a724912e"},{"id":"color.posterize","params":{"levels":8},"accesses":["levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"104580a38bc96bcb3073ed7c09b52835ffae49692d7f39b81f0d488b27ed39a0"},{"id":"color.curves","params":{"curve":[[0,0.2],[0.37,0.8],[0.5,0.1],[1,0.9]],"amount":1},"accesses":["curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"68294a7a14275e9afdd7c3afe37f9e1475d34a158185226cb9d103816e5991ed"},{"id":"color.levels","params":{"inputBlack":0.4,"inputWhite":0.4,"gamma":2.75,"outputBlack":0.15,"outputWhite":0.85},"accesses":["inputBlack","inputWhite","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","inputBlack","inputWhite","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","inputBlack","inputWhite","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","inputBlack","inputWhite","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma","outputBlack","outputWhite","gamma"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"545821f834800cf26b8d5c8d0149c32daf8407f0f9bdc47893b2ea169cc624c3"},{"id":"color.tint","params":{"black":[0.7,0.2,0.9,0.3],"white":[0.1,0.8,0.2,0.6],"amount":0.7},"accesses":["black","white","amount","black","white","amount","black","white","amount","black","white","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"71cfc58ae94cfb8f75ec8cddbc1a3766dbdd9e09be449a9f2309b8b21c223e11"},{"id":"color.hue-saturation","params":{"hue":-247.5,"saturation":133.25,"lightness":-42.5},"accesses":["hue","saturation","lightness","hue","saturation","lightness","hue","saturation","lightness","hue","saturation","lightness"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"2dda619721706605e20011489fbc727d9309dd3fa13c725b51b72ae1f79e3bb6"},{"id":"color.exposure","params":{"exposure":-3.5,"offset":0.25,"gamma":2.3},"accesses":["exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma","exposure","offset","gamma"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"ca966bca68db8b551c754e5b41f97ad1af3c795c0d2db2e4c5e3f66dbc976e01"},{"id":"color.brightness-contrast","params":{"brightness":-0.2,"contrast":0.75},"accesses":["contrast","brightness","brightness","brightness","contrast","brightness","brightness","brightness","contrast","brightness","brightness","brightness","contrast","brightness","brightness","brightness"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"1835007ba5eed9de67335d61e184e371002928347c5f91f4287bc1337c0b73fa"},{"id":"color.brightness-contrast","params":{"brightness":0.3,"contrast":-0.8},"accesses":["contrast","brightness","brightness","brightness","contrast","brightness","brightness","brightness","contrast","brightness","brightness","brightness","contrast","brightness","brightness","brightness"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"6d245d29b248f857430d4f1974168454c3c144b627898c1aeb9d27f433146454"},{"id":"color.fill","params":{"color":[0.8,0.2,0.4,0.6],"amount":0.7},"accesses":["color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color","color","amount","color"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"81ebfabf30ea4247ebae76954a4e69bab1f8479ec8699b4af494f5f6ec99c026"},{"id":"color.gradient-ramp","params":{"start":[10,3],"end":[-7,-2],"startColor":[0.2,0.8,0.1,0.3],"endColor":[0.7,0.1,0.9,0.8],"amount":0.7},"accesses":["start","end","startColor","endColor","amount","amount","amount","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"73a335c916ff57e67ce30503a622c4af8cfd5e22363e1d6e0569a20342370201"},{"id":"color.gradient-ramp","params":{"start":[1,2],"end":[1,2],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"accesses":["start","end","startColor","endColor","amount","amount","amount","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"738cf5886863b30087b5e5668c43ee080493eefe66949450dc3a7d5baec93533"},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[0.001953125,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"accesses":["start","end","startColor","endColor","amount","amount","amount","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"9aedc0558d0e21073affae69f049adf5c3001ebab03a35a1a32766215dd043f6"},{"id":"color.invert","params":{"amount":0.5},"accesses":["amount","amount","amount","amount","amount","amount","amount","amount","amount","amount","amount","amount"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"106fb86992fde9fb2908acb095373a78784c2dfc7c6065f9e33b9706b7233572"},{"id":"color.posterize","params":{"levels":7.25},"accesses":["levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels","levels"],"inputAccesses":["width","height","ctx","width","height","height","width","width","width","width","width","height","width","width","width","width","width","height"],"sha256":"5bac049fd86a93c6bda761134d5778f4c163741c90e53ed0b4f5c11bb806b095"}]',
) as Row[];
const limits = { pixels: 4194304, metadata: 2097152 };
type Pixel = {
  rgb?: number[];
  output?: number[];
  unitOutput?: number[];
  hslKeys?: number[];
  hslOutput?: number[];
  colorOutput?: number[];
  sliceArgs?: number[];
};
type Work = {
  managed?: boolean;
  memory?: ManagedMemory;
  pixel: Pixel;
  input?: object;
  output?: object;
  image?: { data: Uint8ClampedArray<ArrayBuffer> };
  imageProducer?: () => unknown;
  backing?: ArrayBuffer;
  pixelLease?: MemoryLease;
  gradient?: Record<string, number>;
  table?: Uint8Array<ArrayBuffer>;
  source?: number[];
  gradientKeys?: number[];
  gradientMapper?: (c: number) => number;
  gradientMapped?: number[];
  gradientResult?: number[];
};
const kernelMetadata = 4096 + 8192;
const constructorHeadroom = 32768 + kernelMetadata;
function kernelOnly(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({
    pixels: 0,
    metadata: kernelMetadata,
  });
  expect(memory.statistics.reservations).toBe(2);
}
function prewarmWithFiller(memory: ManagedMemory, id: string) {
  // Charge a real backing after construction to restore the original callback quota.
  expect(colorEffectKernel(id)).toBeDefined();
  const filler = memory.allocate(
    "metadata",
    32768,
    () => new ArrayBuffer(32768),
    true,
    (value) => value,
    (value) =>
      (
        value as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
      ).transfer(0),
  );
  expect(memory.owns(filler)).toBe(true);
  expect(filler.byteLength).toBe(32768);
  expect(memory.statistics.current).toEqual({
    pixels: 0,
    metadata: constructorHeadroom,
  });
  expect(memory.statistics.reservations).toBe(3);
  return filler;
}
function releaseFiller(memory: ManagedMemory, filler: ArrayBuffer) {
  memory.release(filler);
  expect(filler.byteLength).toBe(0);
  kernelOnly(memory);
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let work: Work | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((...v) => {
    if (v[1].bytes === 16384) work = v[0] as Work;
    return adopt(...v);
  });
  return () => work;
}
function arrays(work: Work) {
  return [
    work.source,
    work.gradientKeys,
    work.gradientMapped,
    work.gradientResult,
    work.pixel.rgb,
    work.pixel.output,
    work.pixel.unitOutput,
    work.pixel.hslKeys,
    work.pixel.hslOutput,
    work.pixel.colorOutput,
    work.pixel.sliceArgs,
  ].filter((v): v is number[] => !!v);
}
function trace(
  row: Row,
  h: ReturnType<typeof shadowHarness>,
  before?: (key: string, index: number) => void,
) {
  const accesses: string[] = [],
    inputAccesses: string[] = [],
    raw = structuredClone(row.params),
    params = new Proxy(raw, {
      get(t, k, r) {
        const key = String(k),
          index = accesses.length;
        accesses.push(key);
        before?.(key, index);
        return Reflect.get(t, k, r);
      },
    }),
    input = new Proxy(h.input, {
      get(t, k, r) {
        inputAccesses.push(String(k));
        return Reflect.get(t, k, r);
      },
    });
  return { raw, params, input, accesses, inputAccesses };
}
function canvas(
  row: Row,
  h: ReturnType<typeof shadowHarness>,
  params: Row["params"],
  input = h.input,
) {
  return colorEffectKernel(row.id)!.renderCanvas!(
    h.context as never,
    input as never,
    params,
  );
}
function exact(
  row: Row,
  h: ReturnType<typeof shadowHarness>,
  t: ReturnType<typeof trace>,
) {
  expect(sha([h.records, t.accesses, t.inputAccesses])).toBe(row.sha256);
  expect(t.accesses).toEqual(row.accesses);
  expect(t.inputAccesses).toEqual(row.inputAccesses);
  expect(t.raw).toEqual(row.params);
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 23 independently original complete Canvas pixels/parameter and input getter traces active/inactive while retiring actual callback image backing", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        getWork = observe(memory),
        h = shadowHarness(),
        t = trace(row, h);
      const run = async () => canvas(row, h, t.params, t.input);
      if (active) await withManagedMemory(memory, run);
      else await run();
      exact(row, h, t);
      if (active) expect(getWork()).toEqual({});
      if (active && row.id === "color.gradient-ramp") {
        expect(
          memory.statistics.current.metadata - kernelMetadata,
        ).toBeGreaterThanOrEqual(6144);
        expect(
          memory.statistics.current.metadata - kernelMetadata,
        ).toBeLessThan(8192);
        expect(memory.statistics.current.pixels).toBe(262144);
      } else if (active) kernelOnly(memory);
      else empty(memory);
      memory.dispose();
      empty(memory);
      vi.restoreAllMocks();
    }
});
it("rejects exact parent and image backing quotas before original input getters or native image factory", async () => {
  const row = originals.find((r) => r.id === "color.tint")!;
  for (const cut of ["header", "pixels"]) {
    const memory = new ManagedMemory({
        ...limits,
        metadata:
          (cut === "header" ? 16383 : limits.metadata) + constructorHeadroom,
        pixels: cut === "pixels" ? 15 : limits.pixels,
      }),
      getWork = observe(memory),
      h = shadowHarness(),
      t = trace(row, h);
    await withManagedMemory(memory, async () => {
      const filler = prewarmWithFiller(memory, row.id);
      expect(() => canvas(row, h, t.params, t.input)).toThrow(
        cut === "header" ? /metadata/ : /pixels/,
      );
      expect(h.records).toHaveLength(cut === "header" ? 0 : 1);
      expect(t.accesses).toEqual([]);
      expect(t.inputAccesses).toEqual(
        cut === "header" ? [] : row.inputAccesses.slice(0, 5),
      );
      if (getWork()) expect(getWork()).toEqual({});
      releaseFiller(memory, filler);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("captures actual empty and partial source before each original channel conversion round and clears it after null without publishing or losing the first null", async () => {
  const row = originals.find((r) => r.id === "color.tint")!;
  for (const cut of [0, 1, 2]) {
    const memory = new ManagedMemory(limits),
      getWork = observe(memory),
      adopt = memory.adopt.bind(memory),
      h = shadowHarness(),
      round = Math.round;
    let source: number[] | undefined,
      image: Work["image"],
      calls = 0;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
        adopt(
          value,
          lease,
          lease.bytes === 16384
            ? (v) => {
                destroy?.(v);
                throw Error("secondary parent");
              }
            : destroy,
        ),
      );
      vi.spyOn(Math, "round").mockImplementation((v) => {
        const work = getWork();
        if (work?.source && work.source.length < 4 && calls++ === cut) {
          source = work.source;
          image = work.image;
          expect(source).toHaveLength(cut);
          expect(memory.owns(work)).toBe(true);
          expect(memory.owns(image!.data.buffer)).toBe(true);
          throw null;
        }
        return round(v);
      });
      let failure: unknown = "unset";
      try {
        canvas(row, h, row.params);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(source).toEqual([]);
      expect(image!.data.byteLength).toBe(0);
      expect(getWork()).toEqual({});
      expect(h.records).toHaveLength(2);
      kernelOnly(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("reuses one actual admitted pixel child across four original non-gradient pixels with no standalone result leases and keeps image backing owned through native publication", async () => {
  const row = originals.find((r) => r.id === "color.tint")!,
    memory = new ManagedMemory(limits),
    getWork = observe(memory),
    h = shadowHarness(),
    round = Math.round,
    t = trace(row, h);
  let child: Pixel | undefined,
    image: Work["image"],
    calls = 0;
  const actual: number[][] = [];
  await withManagedMemory(memory, async () => {
    expect(colorEffectKernel(row.id)).toBeDefined();
    const reserve = vi.spyOn(memory, "reserve"),
      create = h.context.createSurface;
    vi.spyOn(h.context, "createSurface").mockImplementation((...v) => {
      const output = create(...v),
        put = output.ctx.putImageData;
      vi.spyOn(output.ctx, "putImageData").mockImplementation((...p) => {
        const work = getWork()!;
        image = work.image;
        expect(p[0]).toBe(image);
        expect(memory.owns(image!.data.buffer)).toBe(true);
        expect(work.source).toBeUndefined();
        expect(work.pixel).toEqual({});
        return put(...p);
      });
      return output;
    });
    vi.spyOn(Math, "round").mockImplementation((v) => {
      const work = getWork();
      if (work?.pixel.colorOutput) {
        child ??= work.pixel;
        expect(work.pixel).toBe(child);
        expect(work.source).toHaveLength(4);
        expect(work.pixel.colorOutput).toHaveLength(4);
        expect(memory.owns(work)).toBe(true);
        expect(memory.owns(work.pixel.colorOutput)).toBe(false);
        actual.push(...arrays(work));
        calls++;
      }
      return round(v);
    });
    canvas(row, h, t.params, t.input);
    expect(calls).toBe(16);
    expect(reserve.mock.calls.map((v) => [v[0], v[1]])).toEqual([
      ["metadata", 16384],
      ["pixels", 16],
    ]);
    expect(child).toEqual({});
    for (const value of actual) expect(value).toEqual([]);
    expect(image!.data.byteLength).toBe(0);
    expect(getWork()).toEqual({});
    kernelOnly(memory);
  });
  exact(row, h, t);
  memory.dispose();
});
it("holds actual gradient keys/mapper/mapped/result under callback through original byte consumers and controls/cache through publication then clears arrays without retiring the cached table", async () => {
  const row = originals.find((r) => r.id === "color.gradient-ramp")!,
    memory = new ManagedMemory(limits),
    getWork = observe(memory),
    h = shadowHarness(),
    round = Math.round,
    t = trace(row, h);
  let calls = 0,
    controls: Work["gradient"],
    table: Work["table"],
    image: Work["image"];
  const actual: number[][] = [];
  await withManagedMemory(memory, async () => {
    const create = h.context.createSurface;
    vi.spyOn(h.context, "createSurface").mockImplementation((...v) => {
      const output = create(...v),
        put = output.ctx.putImageData;
      vi.spyOn(output.ctx, "putImageData").mockImplementation((...p) => {
        const work = getWork()!;
        controls = work.gradient;
        table = work.table;
        image = work.image;
        expect(memory.owns(controls!)).toBe(true);
        expect(memory.owns(table!.buffer)).toBe(true);
        expect(memory.owns(image!.data.buffer)).toBe(true);
        expect(work.gradientResult).toBeUndefined();
        return put(...p);
      });
      return output;
    });
    vi.spyOn(Math, "round").mockImplementation((v) => {
      const work = getWork();
      if (work?.gradientResult) {
        expect(work.source).toHaveLength(4);
        expect(work.gradientKeys).toEqual([0, 1, 2]);
        expect(work.gradientMapped).toHaveLength(3);
        expect(work.gradientResult).toHaveLength(4);
        expect(typeof work.gradientMapper).toBe("function");
        expect(memory.owns(work)).toBe(true);
        expect(memory.owns(work.gradientResult)).toBe(false);
        actual.push(...arrays(work));
        calls++;
      }
      return round(v);
    });
    canvas(row, h, t.params, t.input);
    expect(calls).toBe(16);
    for (const value of actual) expect(value).toEqual([]);
    expect(controls).toEqual({});
    expect(image!.data.byteLength).toBe(0);
    expect(table!.byteLength).toBe(262144);
    expect(getWork()).toEqual({});
    expect(
      memory.statistics.current.metadata - kernelMetadata,
    ).toBeGreaterThanOrEqual(6144);
    expect(memory.statistics.current.metadata - kernelMetadata).toBeLessThan(
      8192,
    );
    expect(memory.statistics.current.pixels).toBe(262144);
  });
  exact(row, h, t);
  memory.dispose();
  expect(table!.byteLength).toBe(0);
  empty(memory);
});
it("retires actual partial source/helper/gradient arrays and image backing after all 464 original parameter getter cuts with first null over secondary cleanup and exact retry", async () => {
  for (const row of originals)
    for (let cut = 0; cut < row.accesses.length; cut++) {
      const memory = new ManagedMemory(limits),
        getWork = observe(memory),
        reserve = memory.reserve.bind(memory),
        h = shadowHarness();
      let producerFailed = false,
        image: Work["image"],
        child: Pixel | undefined;
      const actual: number[][] = [];
      const t = trace(row, h, (_key, index) => {
        if (index === cut) {
          const work = getWork()!;
          image = work.image;
          child = work.pixel;
          actual.push(...arrays(work));
          producerFailed = true;
          throw null;
        }
      });
      await withManagedMemory(memory, async () => {
        vi.spyOn(memory, "reserve").mockImplementation((...v) => {
          const lease = reserve(...v),
            release = lease.release.bind(lease);
          vi.spyOn(lease, "release").mockImplementation(() => {
            release();
            if (producerFailed) throw Error("secondary cleanup");
          });
          return lease;
        });
        let failure: unknown = "unset";
        try {
          canvas(row, h, t.params, t.input);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(getWork()).toEqual({});
        expect(child).toEqual({});
        for (const value of actual) expect(value).toEqual([]);
        expect(image!.data.byteLength).toBe(0);
        expect(t.raw).toEqual(row.params);
        vi.restoreAllMocks();
        const retry = shadowHarness(),
          r = trace(row, retry);
        canvas(row, retry, r.params, r.input);
        exact(row, retry, r);
      });
      memory.dispose();
      empty(memory);
    }
});
it("retires actual empty/partial/complete samples after early/mid/late original source or byte rounds, preserves first null and clears transient backing for tint and gradient", async () => {
  for (const id of ["color.tint", "color.gradient-ramp"])
    for (const cut of [0, 6, 15, 24]) {
      const row = originals.find((r) => r.id === id)!,
        memory = new ManagedMemory(limits),
        getWork = observe(memory),
        adopt = memory.adopt.bind(memory),
        h = shadowHarness(),
        round = Math.round;
      let calls = 0,
        image: Work["image"];
      const actual: number[][] = [];
      await withManagedMemory(memory, async () => {
        vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
          adopt(
            value,
            lease,
            lease.bytes === 16384
              ? (v) => {
                  destroy?.(v);
                  throw Error("secondary parent");
                }
              : destroy,
          ),
        );
        vi.spyOn(Math, "round").mockImplementation((v) => {
          const work = getWork();
          if (work?.source && calls++ === cut) {
            image = work.image;
            actual.push(...arrays(work));
            throw null;
          }
          return round(v);
        });
        let failure: unknown = "unset";
        try {
          canvas(row, h, row.params);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(calls).toBe(cut + 1);
        expect(getWork()).toEqual({});
        for (const value of actual) expect(value).toEqual([]);
        expect(image!.data.byteLength).toBe(0);
      });
      vi.restoreAllMocks();
      memory.dispose();
      empty(memory);
    }
});
it("clears actual header or constructed native image backing after adoption null, preserving first null over secondary release", async () => {
  const row = originals.find((r) => r.id === "color.tint")!;
  for (const cut of ["header", "pixels"]) {
    const memory = new ManagedMemory(limits),
      getWork = observe(memory),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory),
      h = shadowHarness();
    let work: Work | undefined,
      image: Work["image"],
      producerFailed = false;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          if (producerFailed) throw Error("secondary release");
        });
        return lease;
      });
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
        if (lease.bytes === 16384) work = value as Work;
        if (lease.bytes === (cut === "header" ? 16384 : 16)) {
          image = work!.image;
          producerFailed = true;
          throw null;
        }
        return adopt(value, lease, destroy);
      });
      let failure: unknown = "unset";
      try {
        canvas(row, h, row.params);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(work).toEqual({});
      if (image) expect(image.data.byteLength).toBe(0);
      expect(getWork()).toEqual(cut === "header" ? undefined : {});
      kernelOnly(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
    empty(memory);
  }
});
it("preserves original native create/read/publication null over secondary parent cleanup and retires actual image and gradient controls", async () => {
  for (const id of ["color.tint", "color.gradient-ramp"])
    for (const cut of ["create", "read", "put"]) {
      const row = originals.find((r) => r.id === id)!,
        memory = new ManagedMemory(limits),
        getWork = observe(memory),
        adopt = memory.adopt.bind(memory),
        h = shadowHarness();
      let image: Work["image"], gradient: Work["gradient"];
      await withManagedMemory(memory, async () => {
        vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
          adopt(
            value,
            lease,
            lease.bytes === 16384
              ? (v) => {
                  destroy?.(v);
                  throw Error("secondary parent");
                }
              : destroy,
          ),
        );
        if (cut === "create")
          vi.spyOn(h.context, "createSurface").mockImplementation(() => {
            throw null;
          });
        if (cut === "read")
          vi.spyOn(h.input.ctx, "getImageData").mockImplementation(() => {
            throw null;
          });
        if (cut === "put") {
          const create = h.context.createSurface;
          vi.spyOn(h.context, "createSurface").mockImplementation((...v) => {
            const output = create(...v);
            vi.spyOn(output.ctx, "putImageData").mockImplementation(() => {
              const work = getWork()!;
              image = work.image;
              gradient = work.gradient;
              expect(memory.owns(image!.data.buffer)).toBe(true);
              if (gradient) expect(memory.owns(gradient)).toBe(true);
              throw null;
            });
            return output;
          });
        }
        let failure: unknown = "unset";
        try {
          canvas(row, h, row.params);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(getWork()).toEqual({});
        if (image) expect(image.data.byteLength).toBe(0);
        if (gradient) expect(gradient).toEqual({});
      });
      vi.restoreAllMocks();
      memory.dispose();
      empty(memory);
    }
});
it("attempts actual image and control retirement after successful native publication despite pixel cleanup null and secondary control error", async () => {
  const row = originals.find((r) => r.id === "color.gradient-ramp")!,
    memory = new ManagedMemory(limits),
    getWork = observe(memory),
    adopt = memory.adopt.bind(memory),
    h = shadowHarness();
  let image: Work["image"], gradient: Work["gradient"], table: Work["table"];
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
      if (lease.bytes === 16 && value instanceof ArrayBuffer) {
        image = getWork()!.image;
        return adopt(value, lease, (v) => {
          destroy?.(v);
          throw null;
        });
      }
      if (lease.bytes === 512 && !Array.isArray(value)) {
        gradient = value as Work["gradient"];
        return adopt(value, lease, (v) => {
          destroy?.(v);
          throw Error("secondary control cleanup");
        });
      }
      return adopt(value, lease, destroy);
    });
    const create = h.context.createSurface;
    vi.spyOn(h.context, "createSurface").mockImplementation((...v) => {
      const output = create(...v),
        put = output.ctx.putImageData;
      vi.spyOn(output.ctx, "putImageData").mockImplementation((...p) => {
        table = getWork()!.table;
        return put(...p);
      });
      return output;
    });
    let failure: unknown = "unset";
    try {
      canvas(row, h, row.params);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(getWork()).toEqual({});
    expect(image!.data.byteLength).toBe(0);
    expect(gradient).toEqual({});
    expect(table!.byteLength).toBe(262144);
    expect(h.records).toHaveLength(3);
  });
  vi.restoreAllMocks();
  memory.dispose();
  expect(table!.byteLength).toBe(0);
  empty(memory);
});
it("retires actual callback/image after successful parent cleanup null and retries the complete original native pixels/getter traces", async () => {
  const row = originals.find((r) => r.id === "color.tint")!,
    memory = new ManagedMemory(limits),
    getWork = observe(memory),
    reserve = memory.reserve.bind(memory),
    h = shadowHarness();
  let image: Work["image"], child: Pixel | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...v) => {
      const lease = reserve(...v);
      if (v[1] === 16384) {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          image = getWork()!.image;
          child = getWork()!.pixel;
          release();
          throw null;
        });
      }
      return lease;
    });
    let failure: unknown = "unset";
    try {
      canvas(row, h, row.params);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(getWork()).toEqual({});
    expect(child).toEqual({});
    expect(image!.data.byteLength).toBe(0);
    kernelOnly(memory);
    vi.restoreAllMocks();
    const retry = shadowHarness(),
      t = trace(row, retry);
    canvas(row, retry, t.params, t.input);
    exact(row, retry, t);
    kernelOnly(memory);
  });
  memory.dispose();
});
it("retires actual callback and image after every one of the 18 original input getter cuts with first null and no extra original getter", async () => {
  const row = originals.find((r) => r.id === "color.tint")!;
  for (let cut = 0; cut < row.inputAccesses.length; cut++) {
    const memory = new ManagedMemory(limits),
      getWork = observe(memory),
      adopt = memory.adopt.bind(memory),
      h = shadowHarness(),
      accesses: string[] = [];
    let image: Work["image"];
    const input = new Proxy(h.input, {
      get(t, k, r) {
        accesses.push(String(k));
        if (accesses.length - 1 === cut) {
          image = getWork()!.image;
          throw null;
        }
        return Reflect.get(t, k, r);
      },
    });
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
        adopt(
          value,
          lease,
          lease.bytes === 16384
            ? (v) => {
                destroy?.(v);
                throw Error("secondary parent");
              }
            : destroy,
        ),
      );
      let failure: unknown = "unset";
      try {
        canvas(row, h, row.params, input);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(accesses).toEqual(row.inputAccesses.slice(0, cut + 1));
      expect(getWork()).toEqual({});
      if (image) expect(image.data.byteLength).toBe(0);
      kernelOnly(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
    empty(memory);
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
