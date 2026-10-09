import { afterEach, expect, it, vi } from "vitest";
import {
  registerCompositionEffect,
  renderGpuEffect,
  renderCanvasEffect,
  type CompositionEffectPlugin,
  type GpuEffectContext,
} from "../../packages/renderer-core/src/composition/render/effect-plugins.ts";
import type { RenderEffect } from "../../packages/renderer-core/src/composition/render/graph.ts";
import type { CanvasSurface } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import type { CanvasEffectContext } from "../../packages/renderer-core/src/composition/render/effects.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { createHash } from "node:crypto";
import { defineCompositionEffect } from "@still-shift/scene-contract";
export const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const effect: RenderEffect = {
  id: "selected",
  effect: "test.ce15-controls",
  version: "1.0.0",
  enabled: true,
  params: { amount: 1 },
};
export const definition = defineCompositionEffect({
  version: "1.0.0",
  requiresLayers: ["foreground", "backdrop"],
  properties: { amount: { type: "scalar", default: 1, min: 0, max: 1 } },
});
export function harness() {
  let id = 1;
  const records: unknown[] = [];
  const call = (name: string, ...args: unknown[]) => {
    records.push([name, ...args]);
  };
  const surface = (value: number, width = 2, height = 2) => ({
    id: value,
    width,
    height,
    opaque: false,
    floating: false,
    screen: false,
    texture: { id: value },
    framebuffer: { id: value },
    canvas: { id: value },
    ctx: {
      drawImage: (image: { id: number }, ...v: unknown[]) =>
        call("draw", value, image.id, ...v),
    },
  });
  const target = surface(1),
    layers = new Map([
      ["foreground", surface(8)],
      ["backdrop", surface(9)],
    ]);
  const create = (w: number, h: number) => {
    const value = surface(++id, w, h);
    call("create", value.id, w, h);
    return value;
  };
  const release = (v: { id: number }) => call("release", v.id);
  const device = {
    surface: create,
    release,
    pass: (
      shader: string,
      out: { id: number },
      inputs: readonly { id: number }[],
      uniforms?: unknown,
    ) =>
      call(
        "pass",
        shader,
        out.id,
        inputs.map((x) => x.id),
        uniforms,
      ),
    uploadBytes: (out: { id: number }, bytes: Uint8Array) =>
      call("upload", out.id, [...bytes]),
  };
  const canvas = {
    createSurface: create,
    releaseSurface: release,
    clear: (out: { id: number }, background: unknown) =>
      call("clear", out.id, background),
  };
  return { records, target, layers, device, canvas };
}
export const plugin: CompositionEffectPlugin = {
  id: effect.effect,
  definition,
  renderGpu(context: GpuEffectContext, input: WebglSurface) {
    const output = context.createSurface(input.width, input.height);
    context.uploadBytes(output, new Uint8Array(16));
    context.pass(
      "original callback shader",
      output,
      [
        input,
        context.layers!.get("foreground")!,
        context.layers!.get("backdrop")!,
      ],
      { amount: 1 },
    );
    context.releaseSurface(context.layers!.get("foreground")!);
    return output;
  },
  renderCanvas(context: CanvasEffectContext, input: CanvasSurface) {
    const output = context.createSurface(input.width, input.height);
    context.clear(output, null);
    output.ctx.drawImage(input.canvas, 0, 0);
    output.ctx.drawImage(context.layers!.get("foreground")!.canvas, 0, 0);
    context.releaseSurface(context.layers!.get("foreground")!);
    return output;
  },
};
const limits = { pixels: 1024 * 1024, metadata: 65536 };
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function render(
  h: ReturnType<typeof harness>,
  gpu: boolean,
  selected = effect,
) {
  return gpu
    ? renderGpuEffect(
        h.device as unknown as WebglDevice,
        h.target as unknown as WebglSurface,
        selected,
        h.layers as unknown as ReadonlyMap<string, WebglSurface>,
      )
    : renderCanvasEffect(
        h.canvas as unknown as CanvasEffectContext,
        h.target as unknown as CanvasSurface,
        selected,
        h.layers as unknown as ReadonlyMap<string, CanvasSurface>,
      );
}
type Control = {
  surfaces?: {
    owned?: Set<unknown>;
    snapshot?: unknown[];
    dimensions?: number[];
    allocate?: unknown;
    release?: unknown;
    create?: unknown;
    remove?: unknown;
  };
  inputs?: Map<string, unknown>;
  context?: GpuEffectContext | CanvasEffectContext;
  copy?: unknown[];
  input?: unknown;
  output?: unknown;
};
function owner(memory: ManagedMemory) {
  return [
    ...(
      memory as unknown as { resources: Map<object, { value: object }> }
    ).resources.values(),
  ].find((x) => "managed" in x.value)?.value as Control;
}
afterEach(() => vi.restoreAllMocks());
it("preserves complete original GPU and Canvas callback native traces including copied layers and partial explicit release", async () => {
  for (const [gpu, calls, hash] of [
    [
      true,
      14,
      "ea6cdabbcfd6a3b0422a7d65f3f3867d1923fd51b4017ef893a25edd67dce47b",
    ],
    [
      false,
      16,
      "553f86d919d6a35973db834dd8ce7cd5520362b5f64039be14dc27a9eb1b6694",
    ],
  ] as const) {
    for (const active of [false, true]) {
      const release = registerCompositionEffect(plugin),
        memory = new ManagedMemory(limits);
      try {
        const work = async () => {
          const h = harness();
          expect(render(h, gpu)).toBe(true);
          expect(h.records).toHaveLength(calls);
          expect(sha(h.records)).toBe(hash);
        };
        if (active) await withManagedMemory(memory, work);
        else await work();
        empty(memory);
      } finally {
        release();
        memory.dispose();
      }
    }
  }
});
it("rejects actual controller/Set/Map/context factories before any native callback surface or callback execution", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory({ ...limits, metadata: 8191 });
    const callback = vi.fn((_ctx: unknown, input: WebglSurface) => input);
    const release = registerCompositionEffect({
      ...plugin,
      renderGpu: callback,
      renderCanvas: callback as unknown as NonNullable<
        CompositionEffectPlugin["renderCanvas"]
      >,
    });
    try {
      await withManagedMemory(memory, async () => {
        const h = harness();
        expect(() => render(h, gpu)).toThrow(/metadata/);
        expect(h.records).toEqual([]);
        expect(callback).not.toHaveBeenCalled();
        empty(memory);
      });
    } finally {
      release();
      memory.dispose();
    }
  }
});
it("captures actual controller/context/layer Map through consumers then clears their refs, arrays and callback methods", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits);
    let phase: Control | undefined,
      controller: Control["surfaces"],
      ctx: GpuEffectContext | CanvasEffectContext | undefined,
      inputs: Map<string, unknown> | undefined;
    const checked = (
      context: GpuEffectContext | CanvasEffectContext,
      input: WebglSurface | CanvasSurface,
    ) => {
      phase = owner(memory);
      controller = phase.surfaces;
      ctx = context;
      inputs = phase.inputs;
      expect(memory.statistics.current.metadata).toBe(8192);
      expect(memory.owns(phase)).toBe(true);
      expect(phase.context).toBe(context);
      expect(inputs).toBe(context.layers);
      expect(inputs!.size).toBe(2);
      expect(controller!.owned!.size).toBe(3);
      expect(controller!.dimensions).toBeUndefined();
      return input;
    };
    const release = registerCompositionEffect({
      ...plugin,
      renderGpu: checked as CompositionEffectPlugin["renderGpu"],
      renderCanvas: checked as NonNullable<
        CompositionEffectPlugin["renderCanvas"]
      >,
    });
    try {
      await withManagedMemory(memory, async () => {
        const h = harness();
        expect(render(h, gpu)).toBe(true);
        expect(inputs!.size).toBe(0);
        expect(Object.keys(ctx!)).toEqual([]);
        expect(controller!.owned).toBeUndefined();
        expect(controller!.snapshot).toBeUndefined();
        expect(controller!.allocate).toBeUndefined();
        expect(controller!.release).toBeUndefined();
        expect(controller!.create).toBeUndefined();
        expect(controller!.remove).toBeUndefined();
        expect(phase!.surfaces).toBeUndefined();
        expect(phase!.context).toBeUndefined();
        expect(phase!.input).toBeUndefined();
        expect(memory.owns(phase!)).toBe(false);
        expect(h.layers.size).toBe(2);
        empty(memory);
      });
    } finally {
      release();
      memory.dispose();
    }
  }
});
it("holds actual original GPU COPY input array until pass consumer and clears only that fresh array afterward", async () => {
  const memory = new ManagedMemory(limits),
    release = registerCompositionEffect(plugin);
  try {
    await withManagedMemory(memory, async () => {
      const h = harness();
      const arrays: unknown[][] = [];
      const pass = h.device.pass;
      vi.spyOn(h.device, "pass").mockImplementation(
        (shader, out, inputs, uniforms) => {
          if (shader.includes("texelFetch")) {
            const phase = owner(memory);
            expect(phase.copy).toBe(inputs);
            expect(memory.owns(phase)).toBe(true);
            arrays.push(inputs as unknown[]);
          }
          pass(shader, out, inputs, uniforms);
        },
      );
      expect(render(h, true)).toBe(true);
      expect(arrays).toHaveLength(4);
      for (const array of arrays) expect(array).toHaveLength(0);
      empty(memory);
    });
  } finally {
    release();
    memory.dispose();
  }
});
it("preserves native producer null before first surface adoption and permits same-scope retry", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits),
      release = registerCompositionEffect(plugin);
    try {
      await withManagedMemory(memory, async () => {
        const h = harness();
        const key = gpu ? h.device : h.canvas;
        vi.spyOn(
          key as unknown as Record<string, () => unknown>,
          gpu ? "surface" : "createSurface",
        ).mockImplementationOnce(() => {
          throw null;
        });
        let failure: unknown = "unset";
        try {
          render(h, gpu);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        empty(memory);
        expect(render(h, gpu)).toBe(true);
        empty(memory);
      });
    } finally {
      release();
      memory.dispose();
    }
  }
});
it("preserves callback null while native cleanup visits every captured surface despite each release failing", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits);
    const failed = (_context: unknown, _input: unknown) => {
      throw null;
    };
    const release = registerCompositionEffect({
      ...plugin,
      renderGpu: failed,
      renderCanvas: failed,
    });
    try {
      await withManagedMemory(memory, async () => {
        const h = harness();
        const native = gpu ? h.device : h.canvas;
        const key = gpu ? "release" : "releaseSurface";
        const original = (
          native as unknown as Record<string, (v: unknown) => void>
        )[key]!;
        vi.spyOn(
          native as unknown as Record<string, (v: unknown) => void>,
          key,
        ).mockImplementation((v) => {
          original(v);
          throw Error("secondary");
        });
        let failure: unknown = "unset";
        try {
          render(h, gpu);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(
          (h.records as unknown[][])
            .filter((x) => x[0] === "release")
            .map((x) => x[1]),
        ).toEqual([2, 3, 4]);
        empty(memory);
      });
    } finally {
      release();
      memory.dispose();
    }
  }
});
it("preserves first cleanup null after successful publication while retiring every surface and control", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits),
      release = registerCompositionEffect(plugin);
    try {
      await withManagedMemory(memory, async () => {
        const h = harness();
        const native = gpu ? h.device : h.canvas;
        const key = gpu ? "release" : "releaseSurface";
        const original = (
          native as unknown as Record<string, (v: unknown) => void>
        )[key]!;
        let count = 0;
        vi.spyOn(
          native as unknown as Record<string, (v: unknown) => void>,
          key,
        ).mockImplementation((v) => {
          original(v);
          if (++count === 2) throw null;
        });
        let failure: unknown = "unset";
        try {
          render(h, gpu);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(
          (h.records as unknown[][])
            .filter((x) => x[0] === "release")
            .map((x) => x[1]),
        ).toEqual([3, 2, 4, 5]);
        empty(memory);
      });
    } finally {
      release();
      memory.dispose();
    }
  }
});
it("cleans original missing-layer validation failure after partial input copies and leaves borrowed layer maps intact", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits),
      release = registerCompositionEffect(plugin);
    try {
      await withManagedMemory(memory, async () => {
        const h = harness();
        h.layers.delete("backdrop");
        expect(() => render(h, gpu)).toThrow(/missing or incompatible input/);
        expect(
          (h.records as unknown[][])
            .filter((x) => x[0] === "release")
            .map((x) => x[1]),
        ).toEqual([2, 3]);
        expect(h.layers.size).toBe(1);
        empty(memory);
      });
    } finally {
      release();
      memory.dispose();
    }
  }
});
it("retains original version and unavailable-Canvas guards before native controller allocation", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1 }),
    release = registerCompositionEffect({
      id: plugin.id,
      definition,
      renderGpu: plugin.renderGpu,
    });
  try {
    await withManagedMemory(memory, async () => {
      const h = harness();
      expect(() => render(h, true, { ...effect, version: "2.0.0" })).toThrow(
        /comp-effect-version/,
      );
      expect(() => render(h, false)).toThrow(/has no Canvas implementation/);
      expect(h.records).toEqual([]);
      empty(memory);
    });
  } finally {
    release();
    memory.dispose();
  }
});
it("preserves original 32-surface limit and releases all entries after rejection", async () => {
  const memory = new ManagedMemory(limits),
    release = registerCompositionEffect({
      ...plugin,
      definition: { ...definition, requiresLayers: [] },
      renderGpu(context, input) {
        for (let i = 0; i < 32; i++) context.createSurface(2, 2);
        return input;
      },
    });
  try {
    await withManagedMemory(memory, async () => {
      const h = harness();
      expect(() => render(h, true)).toThrow(/budget exceeded/);
      expect(
        (h.records as unknown[][]).filter((x) => x[0] === "create"),
      ).toHaveLength(32);
      expect(
        (h.records as unknown[][]).filter((x) => x[0] === "release"),
      ).toHaveLength(32);
      empty(memory);
    });
  } finally {
    release();
    memory.dispose();
  }
});
it("cleans an actual partial surface Set insertion null after native production despite release failure", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits),
      release = registerCompositionEffect(plugin);
    try {
      await withManagedMemory(memory, async () => {
        const h = harness();
        const native = gpu ? h.device : h.canvas;
        const key = gpu ? "surface" : "createSurface";
        const create = gpu ? h.device.surface : h.canvas.createSurface;
        vi.spyOn(
          native as unknown as Record<string, typeof create>,
          key,
        ).mockImplementationOnce((w, h) => {
          const value = create(w, h);
          const set = owner(memory).surfaces!.owned!;
          const add = set.add.bind(set);
          vi.spyOn(set, "add").mockImplementationOnce((v) => {
            add(v);
            throw null;
          });
          return value;
        });
        const cleanup = gpu ? "release" : "releaseSurface";
        const original = (
          native as unknown as Record<string, (v: unknown) => void>
        )[cleanup]!;
        vi.spyOn(
          native as unknown as Record<string, (v: unknown) => void>,
          cleanup,
        ).mockImplementation((v) => {
          original(v);
          throw Error("secondary release");
        });
        let failure: unknown = "unset";
        try {
          render(h, gpu);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(
          (h.records as unknown[][])
            .filter((x) => x[0] === "release")
            .map((x) => x[1]),
        ).toEqual([2]);
        empty(memory);
      });
    } finally {
      release();
      memory.dispose();
    }
  }
});
it("retires partial layer Map insertion null and every owned copy then permits retry", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits),
      release = registerCompositionEffect(plugin);
    try {
      await withManagedMemory(memory, async () => {
        const h = harness();
        const native = gpu ? h.device : h.canvas,
          key = gpu ? "surface" : "createSurface",
          create = gpu ? h.device.surface : h.canvas.createSurface;
        let injected = false;
        vi.spyOn(
          native as unknown as Record<string, typeof create>,
          key,
        ).mockImplementation((w, h) => {
          const value = create(w, h);
          const map = owner(memory).inputs;
          if (map && !injected) {
            injected = true;
            const set = map.set.bind(map);
            vi.spyOn(map, "set").mockImplementationOnce((k, v) => {
              set(k, v);
              throw null;
            });
          }
          return value;
        });
        let failure: unknown = "unset";
        try {
          render(h, gpu);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(
          (h.records as unknown[][])
            .filter((x) => x[0] === "release")
            .map((x) => x[1]),
        ).toEqual([2, 3]);
        empty(memory);
        expect(render(h, gpu)).toBe(true);
        empty(memory);
      });
    } finally {
      release();
      memory.dispose();
    }
  }
});
it("preserves publication null over cleanup and clears all captured output/context references", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits),
      release = registerCompositionEffect(plugin);
    try {
      await withManagedMemory(memory, async () => {
        const h = harness();
        if (gpu) {
          const pass = h.device.pass;
          vi.spyOn(h.device, "pass").mockImplementation(
            (shader, out, inputs, uniforms) => {
              if (out === h.target) throw null;
              pass(shader, out, inputs, uniforms);
            },
          );
        } else {
          const clear = h.canvas.clear;
          vi.spyOn(h.canvas, "clear").mockImplementation((out, bg) => {
            if (out === h.target) throw null;
            clear(out, bg);
          });
        }
        let failure: unknown = "unset";
        try {
          render(h, gpu);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(
          (h.records as unknown[][])
            .filter((x) => x[0] === "release")
            .map((x) => x[1]),
        ).toEqual([3, 2, 4, 5]);
        empty(memory);
      });
    } finally {
      release();
      memory.dispose();
    }
  }
});
