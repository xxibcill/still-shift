import { afterEach, expect, it, vi } from "vitest";
import { shadowEffectKernel } from "../../packages/renderer-core/src/composition/render/shadow-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import type { WebglSurface } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
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
export const params = {
  blur: 1.7,
  offset: [1.3, -0.9],
  color: [0.7, 0.2, 0.1, 0.6],
  opacity: 0.8,
};

const originalNative = [
  {
    id: "light.drop-shadow",
    gpu: true,
    calls: 8,
    sha256: "bd687a1c69020d8d0e2dc732fc74e9c47cb17772f6fc965c2f8c839860307286",
  },
  {
    id: "light.drop-shadow",
    gpu: false,
    calls: 3,
    sha256: "6c05fe4a327b2ea0e52ef097cf984c6a55f9244dc2d7d1e9ce642507c2436e8d",
  },
  {
    id: "light.inner-shadow",
    gpu: true,
    calls: 8,
    sha256: "ccf5f618d0b713a71bce8203824682fa5e6f70870425a05cee36637329323f7b",
  },
  {
    id: "light.inner-shadow",
    gpu: false,
    calls: 3,
    sha256: "d7f15fbbe883ffad954af776ca9e6ad0448104c3a70b2acca3f4aacf58e95cfa",
  },
] as const;
const limits = { pixels: 1024 * 1024, metadata: 65536 };
type Work = {
  memory?: ManagedMemory;
  offset?: number[];
  rows?: [unknown, unknown, number[] | undefined][];
  data?: Uint8Array;
  kernel?: { weights?: number[] };
  shader?: string;
  references: WebglSurface[];
  inputs: WebglSurface[][];
  uniforms: Record<string, unknown>[];
};
function owner(memory: ManagedMemory) {
  return [
    ...(
      memory as unknown as { resources: Map<object, { value: object }> }
    ).resources.values(),
  ].find((x) => "references" in x.value)?.value as Work;
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function render(
  h: ReturnType<typeof shadowHarness>,
  id = "light.drop-shadow",
  p = params,
) {
  return shadowEffectKernel(id)!.renderGpu(
    h.context as never,
    h.input as never,
    p as never,
  );
}
afterEach(() => vi.restoreAllMocks());
it("preserves complete original inner/drop-shadow native traces and shader/weight bytes in both inactive and managed scopes", async () => {
  for (const original of originalNative.filter((x) => x.gpu)) {
    for (const active of [false, true]) {
      const memory = new ManagedMemory(limits);
      const run = async () => {
        const h = shadowHarness();
        render(h, original.id);
        expect(h.records).toHaveLength(original.calls);
        expect(sha(h.records)).toBe(original.sha256);
        empty(memory);
      };
      if (active) await withManagedMemory(memory, run);
      else await run();
      memory.dispose();
    }
  }
});
it("rejects actual shadow shader/vector/tuple/input/uniform/native-ref/view factories before Gaussian math or native production", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 8191 });
  await withManagedMemory(memory, async () => {
    const h = shadowHarness(),
      round = vi.spyOn(Math, "round");
    expect(() => render(h)).toThrow(/metadata/);
    expect(round).not.toHaveBeenCalled();
    expect(h.records).toEqual([]);
    empty(memory);
  });
  memory.dispose();
});
it("preserves original opacity/alpha no-op guards before arena or native producers", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1 });
  await withManagedMemory(memory, async () => {
    for (const p of [
      { ...params, opacity: 0 },
      { ...params, color: [0.7, 0.2, 0.1, 0] },
    ]) {
      const h = shadowHarness();
      expect(render(h, "light.drop-shadow", p)).toBe(h.input);
      expect(h.records).toEqual([]);
      empty(memory);
    }
  });
  memory.dispose();
});
it("captures actual offset/native refs/upload view before consumers and actual shader/input/uniform/tuple/direction values through passes then clears them", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    let work: Work | undefined,
      data: Uint8Array | undefined,
      offset: number[] | undefined,
      rows: Work["rows"],
      directions: number[][] = [];
    const inputs: readonly WebglSurface[][] = [],
      uniforms: Record<string, unknown>[] = [];
    const upload = h.context.uploadBytes;
    vi.spyOn(h.context, "uploadBytes").mockImplementation((surface, value) => {
      work = owner(memory);
      data = work.data;
      offset = work.offset;
      expect(memory.owns(work)).toBe(true);
      expect(value).toBe(data);
      expect(offset).toEqual([1.3125, -0.875]);
      expect(work.references).toHaveLength(3);
      expect(memory.owns(value.buffer)).toBe(true);
      upload(surface, value);
    });
    const pass = h.context.pass;
    vi.spyOn(h.context, "pass").mockImplementation(
      (body, out, values, record) => {
        work = owner(memory);
        expect(work.inputs).toContain(values);
        expect(work.uniforms).toContain(record);
        (inputs as WebglSurface[][]).push(values as unknown as WebglSurface[]);
        uniforms.push(record as Record<string, unknown>);
        if (body.length === 708) expect(work.shader).toBe(body);
        if (work.rows) {
          rows = work.rows;
          directions = rows.map((x) => x[2]!);
        }
        pass(body, out, values, record);
      },
    );
    render(h);
    expect(data!.byteLength).toBe(0);
    expect(offset).toHaveLength(0);
    expect(rows).toHaveLength(0);
    for (const v of directions) expect(v).toHaveLength(0);
    for (const v of inputs) expect(v).toHaveLength(0);
    for (const v of uniforms) expect(Object.keys(v)).toEqual([]);
    expect(work!.memory).toBeUndefined();
    expect(work!.shader).toBeUndefined();
    expect(work!.kernel).toBeUndefined();
    expect(work!.references).toHaveLength(0);
    expect(memory.owns(work!)).toBe(false);
    expect(params.color).toEqual([0.7, 0.2, 0.1, 0.6]);
    expect(params.offset).toEqual([1.3, -0.9]);
    empty(memory);
  });
  memory.dispose();
});
it("cleans Gaussian quota failure beneath admitted arena and permits neutral result retry", async () => {
  const memory = new ManagedMemory({
    ...limits,
    metadata: 8192 + 1024 + 8 * 13 - 1,
  });
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    expect(() => render(h)).toThrow(/metadata/);
    expect(h.records).toEqual([]);
    empty(memory);
    render(h, "light.drop-shadow", { ...params, blur: 0 });
    empty(memory);
  });
  memory.dispose();
});
it("cleans actual offset Math.round null before native surfaces and retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    const original = Math.round;
    let count = 0;
    vi.spyOn(Math, "round").mockImplementation((v) => {
      if (++count === 14) throw null;
      return original(v);
    });
    let failure: unknown = "unset";
    try {
      render(h);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(h.records).toEqual([]);
    empty(memory);
    vi.restoreAllMocks();
    render(h);
    empty(memory);
  });
  memory.dispose();
});
it("cleans actual partial native reference producers after each surface creation null without owning borrowed context payloads", async () => {
  for (const failed of [1, 2, 3]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = shadowHarness();
      const create = h.context.createSurface;
      let count = 0;
      vi.spyOn(h.context, "createSurface").mockImplementation((w, h) => {
        if (++count === failed) throw null;
        return create(w, h);
      });
      let failure: unknown = "unset";
      try {
        render(h);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(
        (h.records as unknown[][]).filter((x) => x[0] === "create"),
      ).toHaveLength(failed - 1);
      empty(memory);
      vi.restoreAllMocks();
      render(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("rejects upload pixel quota before typed-view factory and cleans all admitted metadata", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 51 });
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    expect(() => render(h)).toThrow(/pixels/);
    expect(
      (h.records as unknown[][]).filter((x) => x[0] === "upload"),
    ).toHaveLength(0);
    empty(memory);
  });
  memory.dispose();
});
it("preserves upload/pass null across every consumer and detaches actual backing while clearing all captured controls then retries", async () => {
  for (const fail of [0, 1, 2, 3, 4]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = shadowHarness();
      let work: Work | undefined, data: Uint8Array | undefined;
      const upload = h.context.uploadBytes;
      vi.spyOn(h.context, "uploadBytes").mockImplementation((out, v) => {
        work = owner(memory);
        data = v;
        if (fail === 0) throw null;
        upload(out, v);
      });
      const pass = h.context.pass;
      let count = 0;
      vi.spyOn(h.context, "pass").mockImplementation(
        (body, out, inputs, uniforms) => {
          if (++count === fail) throw null;
          pass(body, out, inputs, uniforms);
        },
      );
      let failure: unknown = "unset";
      try {
        render(h);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(data!.byteLength).toBe(0);
      expect(work!.inputs).toHaveLength(0);
      expect(work!.uniforms).toHaveLength(0);
      expect(work!.kernel).toBeUndefined();
      empty(memory);
      vi.restoreAllMocks();
      render(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("preserves first pass null over secondary pixel retirement null while still retiring Gaussian/container references", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    vi.spyOn(h.context, "pass").mockImplementationOnce(() => {
      throw Error("original pass");
    });
    const release = memory.release.bind(memory);
    vi.spyOn(memory, "release").mockImplementation((value) => {
      release(value);
      if (value instanceof ArrayBuffer) throw null;
    });
    expect(() => render(h)).toThrow("original pass");
    empty(memory);
  });
  memory.dispose();
});
it("propagates first successful-return pixel retirement null and still drops all actual metadata/kernel refs", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = shadowHarness();
    const release = memory.release.bind(memory);
    vi.spyOn(memory, "release").mockImplementation((value) => {
      release(value);
      if (value instanceof ArrayBuffer) throw null;
    });
    let failure: unknown = "unset";
    try {
      render(h);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    empty(memory);
  });
  memory.dispose();
});
