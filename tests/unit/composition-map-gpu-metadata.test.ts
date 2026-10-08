import { afterEach, expect, it, vi } from "vitest";
import { mapEffectKernel } from "../../packages/renderer-core/src/composition/render/map-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { createHash } from "node:crypto";
export const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function shadowHarness() {
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
export function mapHarness() {
  const h = shadowHarness(),
    field = {
      ...h.input,
      id: 77,
      canvas: { id: 77 },
      ctx: {
        getImageData: () => {
          h.records.push(["read", 77]);
          return {
            data: new Uint8ClampedArray([
              13, 247, 171, 64, 200, 7, 243, 255, 8, 119, 31, 128, 251, 16, 93,
              0,
            ]),
          };
        },
      },
    };
  const context = { ...h.context, layers: new Map([["map", field]]) };
  return { ...h, field, context };
}
const originals = [
  {
    id: "distort.displacement-map",
    params: {
      amount: [0, 0],
      midpoint: 0.5,
      channelX: 0,
      channelY: 1,
    },
    gpu: true,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [0, 0],
      midpoint: 0.5,
      channelX: 0,
      channelY: 1,
    },
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [8.3, -4.7],
      midpoint: 0.5,
      channelX: 0,
      channelY: 1,
    },
    gpu: true,
    calls: 2,
    sha256: "54b84959e67de493ebacc7496f992abd8ddd681425ba659ed6228e2c2a0bb98a",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1756,
        "b92107857077cbf85e499045baedf2fea520c2af2165090778bfc29861bb9138",
        2,
        [1, 77],
        {
          amountFixed: [133, -75],
          midpoint: 128,
          channelX: 0,
          channelY: 1,
        },
      ],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [8.3, -4.7],
      midpoint: 0.5,
      channelX: 0,
      channelY: 1,
    },
    gpu: false,
    calls: 4,
    sha256: "f8af1440f06e590f5e77f108c17afab5c0e67adfaf27e568211bd9aedfefe921",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [0, 9],
      midpoint: 0.5,
      channelX: 2,
      channelY: 3,
    },
    gpu: true,
    calls: 2,
    sha256: "d2bea90b78b93480e363380971e206482a6874c44daa04243832110d76d96543",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1756,
        "b92107857077cbf85e499045baedf2fea520c2af2165090778bfc29861bb9138",
        2,
        [1, 77],
        {
          amountFixed: [0, 144],
          midpoint: 128,
          channelX: 2,
          channelY: 3,
        },
      ],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [0, 9],
      midpoint: 0.5,
      channelX: 2,
      channelY: 3,
    },
    gpu: false,
    calls: 4,
    sha256: "1cf69fca23c531ff6852ce6e35eb3cc63cb8b8008dffd33a53929067a7e1ea9b",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [22, 41, 198, 80, 0, 0, 0, 0, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [-1000, 1000],
      midpoint: 1,
      channelX: 3,
      channelY: 4,
    },
    gpu: true,
    calls: 2,
    sha256: "9b32252ea05debd62b6b2b88d4d5ed82321b2b184c5d22585c73a83ac312dfd1",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1756,
        "b92107857077cbf85e499045baedf2fea520c2af2165090778bfc29861bb9138",
        2,
        [1, 77],
        {
          amountFixed: [-16000, 16000],
          midpoint: 255,
          channelX: 3,
          channelY: 4,
        },
      ],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [-1000, 1000],
      midpoint: 1,
      channelX: 3,
      channelY: 4,
    },
    gpu: false,
    calls: 4,
    sha256: "f8af1440f06e590f5e77f108c17afab5c0e67adfaf27e568211bd9aedfefe921",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [1.0625, -0.9375],
      midpoint: 0,
      channelX: 4,
      channelY: 2,
    },
    gpu: true,
    calls: 2,
    sha256: "e90a9ca3a21dcd90bcecb5678f7af90384b4107e165537d57d3a2abb89349efb",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1756,
        "b92107857077cbf85e499045baedf2fea520c2af2165090778bfc29861bb9138",
        2,
        [1, 77],
        {
          amountFixed: [17, -15],
          midpoint: 0,
          channelX: 4,
          channelY: 2,
        },
      ],
    ],
  },
  {
    id: "distort.displacement-map",
    params: {
      amount: [1.0625, -0.9375],
      midpoint: 0,
      channelX: 4,
      channelY: 2,
    },
    gpu: false,
    calls: 4,
    sha256: "4ee38fe4944658071374820c185ad047ce07061914efe4a141742a4bd5809c6d",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [37, 38, 193, 153, 191, 0, 128, 4, 34, 179, 26, 127, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0,
      softness: 0,
      channel: 4,
      invert: 0,
    },
    gpu: true,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0,
      softness: 0,
      channel: 4,
      invert: 0,
    },
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    records: [],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 1,
      softness: 0,
      channel: 4,
      invert: 0,
    },
    gpu: true,
    calls: 2,
    sha256: "487cc571eddbbafb41b1674c5245288ea52b0f70373fd68364f85ec5e9509205",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1097,
        "0366c4990564098768cc8b7e2b32a1b970d9379fef03fbd58b821ed5abe2e4b9",
        2,
        [1, 77],
        {
          progress: 1,
          softness: 0,
          channel: 4,
          invert: 0,
        },
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 1,
      softness: 0,
      channel: 4,
      invert: 0,
    },
    gpu: false,
    calls: 4,
    sha256: "f8af1440f06e590f5e77f108c17afab5c0e67adfaf27e568211bd9aedfefe921",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.5,
      softness: 0,
      channel: 4,
      invert: 0,
    },
    gpu: true,
    calls: 2,
    sha256: "bdf14be39061d17ef16e7a9bfdd0e10e2ed4e40a561744d0fdd4f3b64b99fed2",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1097,
        "0366c4990564098768cc8b7e2b32a1b970d9379fef03fbd58b821ed5abe2e4b9",
        2,
        [1, 77],
        {
          progress: 0.5,
          softness: 0,
          channel: 4,
          invert: 0,
        },
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.5,
      softness: 0,
      channel: 4,
      invert: 0,
    },
    gpu: false,
    calls: 4,
    sha256: "0f8c6006e40e44df96fb4c85cfa44d0f026c6ccc709fbaa954ee6ab68ea79ff6",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 41, 199, 213, 0, 0, 0, 0, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.5,
      softness: 0.4,
      channel: 0,
      invert: 1,
    },
    gpu: true,
    calls: 2,
    sha256: "24ea196415a6df6446235a4e731c2afb0c87b5d04a492a279e76852187cdf9b5",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1097,
        "0366c4990564098768cc8b7e2b32a1b970d9379fef03fbd58b821ed5abe2e4b9",
        2,
        [1, 77],
        {
          progress: 0.5,
          softness: 0.4,
          channel: 0,
          invert: 1,
        },
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.5,
      softness: 0.4,
      channel: 0,
      invert: 1,
    },
    gpu: false,
    calls: 4,
    sha256: "0f8c6006e40e44df96fb4c85cfa44d0f026c6ccc709fbaa954ee6ab68ea79ff6",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 41, 199, 213, 0, 0, 0, 0, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.5,
      softness: 1,
      channel: 3,
      invert: 0,
    },
    gpu: true,
    calls: 2,
    sha256: "fd4100c9b5d4f826ee57c5fbdadfe796213ccf83bde7987bb919242e9270f86a",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1097,
        "0366c4990564098768cc8b7e2b32a1b970d9379fef03fbd58b821ed5abe2e4b9",
        2,
        [1, 77],
        {
          progress: 0.5,
          softness: 1,
          channel: 3,
          invert: 0,
        },
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.5,
      softness: 1,
      channel: 3,
      invert: 0,
    },
    gpu: false,
    calls: 4,
    sha256: "bb6a449f00708be8e1d1ea88d467cffca1fee2ba48e6bd5275e91714f63bef6e",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [22, 41, 199, 173, 201, 6, 142, 81, 34, 192, 9, 113, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.0001,
      softness: 0.03,
      channel: 1,
      invert: 0,
    },
    gpu: true,
    calls: 2,
    sha256: "922b86be5144560d8afc5e62f30ac8da728a1237471e86c2850b673bc2dbbdff",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1097,
        "0366c4990564098768cc8b7e2b32a1b970d9379fef03fbd58b821ed5abe2e4b9",
        2,
        [1, 77],
        {
          progress: 0.0001,
          softness: 0.03,
          channel: 1,
          invert: 0,
        },
      ],
    ],
  },
  {
    id: "transition.gradient-wipe",
    params: {
      progress: 0.0001,
      softness: 0.03,
      channel: 1,
      invert: 0,
    },
    gpu: false,
    calls: 4,
    sha256: "93b94aab763225b3a72f3e78217fc8c99cba36816f033b6a2ef92de3f729d0c3",
    records: [
      ["read", 1],
      ["read", 77],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 41, 199, 213, 201, 6, 142, 81, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
];
const limits = { pixels: 1048576, metadata: 1048576 },
  params = { amount: [8.3, -4.7], midpoint: 0.5, channelX: 0, channelY: 1 };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
type Work = {
  input?: object;
  field?: object;
  output?: object;
  every?: unknown;
  mapProducer?: unknown;
  amountFixed?: number[];
  uniforms?: Record<string, number | readonly number[]>;
  segment?: string;
  shader?: string;
  inputs?: object[];
};
function owner(memory: ManagedMemory): Work | undefined {
  const resources = (
    memory as unknown as { resources: Map<object, { value: object }> }
  ).resources;
  return [...resources.values()]
    .map((x) => x.value)
    .find(
      (x) =>
        Object.hasOwn(x, "input") &&
        !Object.hasOwn(x, "taps") &&
        !Object.hasOwn(x, "transformWork"),
    ) as Work | undefined;
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 11 whole original map GPU traces in active/inactive routes and all 11 unchanged Canvas native/pixel transactions", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits),
      run = async () => {
        for (const x of originals.filter((x) => x.gpu)) {
          const h = mapHarness(),
            plugin = mapEffectKernel(x.id)!;
          plugin.renderGpu(
            h.context as never,
            h.input as never,
            x.params as never,
          );
          expect(h.records).toHaveLength(x.calls);
          expect(sha(h.records)).toBe(x.sha256);
          empty(memory);
        }
      };
    if (active) await withManagedMemory(memory, run);
    else await run();
    memory.dispose();
  }
  for (const x of originals.filter((x) => !x.gpu)) {
    const h = mapHarness(),
      plugin = mapEffectKernel(x.id)!;
    plugin.renderCanvas!(
      h.context as never,
      h.input as never,
      x.params as never,
    );
    expect(h.records).toHaveLength(x.calls);
    expect(sha(h.records)).toBe(x.sha256);
  }
});
it("rejects GPU work before original neutral/math/layer/native/shader/input/uniform factories for both effect kinds", async () => {
  for (const id of ["distort.displacement-map", "transition.gradient-wipe"]) {
    const memory = new ManagedMemory({ ...limits, metadata: 16383 }),
      h = mapHarness(),
      plugin = mapEffectKernel(id)!;
    await withManagedMemory(memory, async () => {
      const every = vi.spyOn(Array.prototype, "every"),
        round = vi.spyOn(Math, "round"),
        get = vi.spyOn(h.context.layers, "get");
      expect(() =>
        plugin.renderGpu(
          h.context as never,
          h.input as never,
          (id.startsWith("distort")
            ? params
            : { progress: 0.5, softness: 0.4, channel: 4, invert: 0 }) as never,
        ),
      ).toThrow(/metadata/);
      expect(every).not.toHaveBeenCalled();
      expect(round).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(h.records).toHaveLength(0);
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("owns actual neutral every callback before its consumer and retires it at the original neutral return without layer/native allocation", async () => {
  const memory = new ManagedMemory(limits),
    h = mapHarness(),
    plugin = mapEffectKernel("distort.displacement-map")!;
  let work: Work | undefined;
  await withManagedMemory(memory, async () => {
    const every = Array.prototype.every;
    vi.spyOn(Array.prototype, "every").mockImplementation(function (
      this: number[],
      callback,
      ...args
    ) {
      work = owner(memory)!;
      expect(memory.owns(work)).toBe(true);
      expect(work.every).toBe(callback);
      return every.call(this, callback, ...args);
    });
    const get = vi.spyOn(h.context.layers, "get");
    expect(
      plugin.renderGpu(
        h.context as never,
        h.input as never,
        { ...params, amount: [0, 0] } as never,
      ),
    ).toBe(h.input);
    expect(get).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
    expect(work).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
it("holds actual mapped amount/input/uniform/shader/producer/native refs through pass then clears containers and drops refs without mutating borrowed source/map/params", async () => {
  const memory = new ManagedMemory(limits),
    h = mapHarness(),
    plugin = mapEffectKernel("distort.displacement-map")!;
  let work: Work | undefined,
    amount: number[] | undefined,
    inputs: object[] | undefined,
    uniforms: Record<string, number | readonly number[]> | undefined;
  await withManagedMemory(memory, async () => {
    const pass = h.context.pass;
    vi.spyOn(h.context, "pass").mockImplementation((...args) => {
      work = owner(memory)!;
      expect(memory.owns(work)).toBe(true);
      expect(memory.statistics.current.metadata).toBe(16384);
      expect(work.input).toBe(h.input);
      expect(work.field).toBe(h.field);
      expect(work.output).toBe(args[1]);
      expect(work.shader).toBe(args[0]);
      expect(typeof work.every).toBe("function");
      expect(typeof work.mapProducer).toBe("function");
      amount = work.amountFixed;
      inputs = work.inputs;
      uniforms = work.uniforms;
      expect(amount).toEqual([133, -75]);
      expect(inputs).toBe(args[2]);
      expect(uniforms).toBe(args[3]);
      expect(args[0].endsWith(work.segment!)).toBe(true);
      return pass(...args);
    });
    plugin.renderGpu(h.context as never, h.input as never, params as never);
    empty(memory);
  });
  expect(amount).toHaveLength(0);
  expect(inputs).toHaveLength(0);
  expect(uniforms).toEqual({});
  expect(work).toEqual({});
  expect(params.amount).toEqual([8.3, -4.7]);
  expect(h.input.width).toBe(2);
  expect(h.field.width).toBe(2);
  memory.dispose();
});
it("cleans original neutral-every/layer-get/amount-map/math nulls and permits retry", async () => {
  for (const stage of ["every", "get", "map", "round"]) {
    const memory = new ManagedMemory(limits),
      h = mapHarness(),
      plugin = mapEffectKernel("distort.displacement-map")!;
    await withManagedMemory(memory, async () => {
      const fail = () => {
        throw null;
      };
      if (stage === "every")
        vi.spyOn(Array.prototype, "every").mockImplementationOnce(fail);
      if (stage === "get")
        vi.spyOn(h.context.layers, "get").mockImplementationOnce(fail);
      if (stage === "map")
        vi.spyOn(Array.prototype, "map").mockImplementationOnce(fail);
      if (stage === "round")
        vi.spyOn(Math, "round").mockImplementationOnce(fail);
      let failure: unknown = "unset";
      try {
        plugin.renderGpu(h.context as never, h.input as never, params as never);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      empty(memory);
      vi.restoreAllMocks();
      plugin.renderGpu(h.context as never, h.input as never, params as never);
      empty(memory);
    });
    memory.dispose();
  }
});
it("cleans actual GPU refs after native create/pass null and preserves primary null over secondary metadata retirement failure then retries", async () => {
  for (const stage of ["create", "pass"]) {
    const memory = new ManagedMemory(limits),
      h = mapHarness(),
      plugin = mapEffectKernel("distort.displacement-map")!;
    let work: Work | undefined;
    await withManagedMemory(memory, async () => {
      const reserve = memory.reserve.bind(memory);
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary retirement");
        });
        return lease;
      });
      const fail = () => {
        work = owner(memory);
        throw null;
      };
      if (stage === "create")
        vi.spyOn(h.context, "createSurface").mockImplementationOnce(fail);
      else vi.spyOn(h.context, "pass").mockImplementationOnce(fail);
      let failure: unknown = "unset";
      try {
        plugin.renderGpu(h.context as never, h.input as never, params as never);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(work).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      plugin.renderGpu(h.context as never, h.input as never, params as never);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual work when metadata adoption throws null before neutral or native factories", async () => {
  const memory = new ManagedMemory(limits),
    h = mapHarness(),
    plugin = mapEffectKernel("distort.displacement-map")!;
  let work: object | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value) => {
      work = value;
      throw null;
    });
    const every = vi.spyOn(Array.prototype, "every");
    let failure: unknown = "unset";
    try {
      plugin.renderGpu(h.context as never, h.input as never, params as never);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(work).toEqual({});
    expect(every).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
    empty(memory);
  });
  memory.dispose();
});
it("propagates the first successful-pass cleanup null after actual mapped/input/uniform/native refs clear", async () => {
  const memory = new ManagedMemory(limits),
    h = mapHarness(),
    plugin = mapEffectKernel("distort.displacement-map")!;
  let work: Work | undefined, amount: number[] | undefined;
  await withManagedMemory(memory, async () => {
    const reserve = memory.reserve.bind(memory);
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw null;
      });
      return lease;
    });
    const pass = h.context.pass;
    vi.spyOn(h.context, "pass").mockImplementation((...args) => {
      work = owner(memory);
      amount = work!.amountFixed;
      return pass(...args);
    });
    let failure: unknown = "unset";
    try {
      plugin.renderGpu(h.context as never, h.input as never, params as never);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(amount).toHaveLength(0);
    expect(work).toEqual({});
    expect(h.records).toHaveLength(2);
    empty(memory);
  });
  memory.dispose();
});
