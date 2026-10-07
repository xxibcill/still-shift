import { expect, it, vi } from "vitest";
import {
  defineCompositionEffect,
  compositionEffectDefinition,
} from "@still-shift/scene-contract";
import {
  registerCompositionEffect,
  compositionEffectPlugin,
  renderGpuEffect,
  renderCanvasEffect,
} from "../../packages/renderer-core/src/composition/render/effect-plugins.ts";
import type { CanvasSurface } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";

const definition = defineCompositionEffect({
  version: "1.0.0",
  properties: { amount: { type: "scalar", default: 1, min: 0, max: 1 } },
});
const surface = (): WebglSurface => ({
  width: 8,
  height: 8,
  opaque: false,
  floating: false,
  screen: false,
  texture: {} as WebGLTexture,
  framebuffer: {} as WebGLFramebuffer,
});
const effect = {
  id: "custom",
  effect: "test.invert",
  version: "1.0.0",
  enabled: true,
  params: { amount: 1 },
};
const fakeDevice = () => ({
  surface: vi.fn((width = 8, height = 8) => ({ ...surface(), width, height })),
  release: vi.fn(),
  pass: vi.fn(),
  uploadBytes: vi.fn(),
});
it("installs and releases render callbacks with their validated definition", () => {
  const renderGpu = vi.fn((_context, input) => input);
  const release = registerCompositionEffect({
    id: "test.invert",
    definition,
    renderGpu,
  });
  expect(compositionEffectPlugin("test.invert")?.renderGpu).toBe(renderGpu);
  expect(compositionEffectDefinition("test.invert")?.version).toBe("1.0.0");
  expect(() =>
    registerCompositionEffect({ id: "test.invert", definition, renderGpu }),
  ).toThrow(/registration/);
  release();
  release();
  expect(compositionEffectPlugin("test.invert")).toBeUndefined();
  expect(compositionEffectDefinition("test.invert")).toBeUndefined();
});
it.each(["gpu", "canvas"])(
  "retains registered input slots after caller mutation on %s",
  (backend) => {
    const slots = ["map"],
      supplied = {
        ...defineCompositionEffect({
          version: "1.0.0",
          properties: definition.properties,
          requiresLayers: slots,
        }),
        requiresLayers: slots,
      },
      release = registerCompositionEffect({
        id: "test.invert",
        definition: supplied,
        renderGpu(context, input) {
          expect([...context.layers.keys()]).toEqual(["map"]);
          return input;
        },
        renderCanvas(context, input) {
          expect([...context.layers!.keys()]).toEqual(["map"]);
          return input;
        },
      });
    try {
      slots.push("undeclared");
      expect(
        compositionEffectDefinition("test.invert")!.requiresLayers,
      ).toEqual(["map"]);
      if (backend === "gpu") {
        expect(
          renderGpuEffect(
            fakeDevice() as unknown as WebglDevice,
            surface(),
            effect,
            new Map([["map", surface()]]),
          ),
        ).toBe(true);
      } else {
        const makeCanvas = () =>
          ({
            width: 8,
            height: 8,
            canvas: {} as HTMLCanvasElement,
            ctx: { drawImage: vi.fn() },
          }) as unknown as CanvasSurface;
        expect(
          renderCanvasEffect(
            {
              createSurface: makeCanvas,
              releaseSurface: vi.fn(),
              clear: vi.fn(),
            },
            makeCanvas(),
            effect,
            new Map([["map", makeCanvas()]]),
          ),
        ).toBe(true);
      }
    } finally {
      release();
    }
  },
);
it("releases every GPU scratch surface after a failing kernel without publishing pixels", () => {
  const release = registerCompositionEffect({
    id: "test.invert",
    definition,
    renderGpu(context) {
      context.createSurface(8, 8);
      context.createSurface(4, 4);
      throw Error("kernel failure");
    },
  });
  const device = fakeDevice();
  try {
    expect(() =>
      renderGpuEffect(device as unknown as WebglDevice, surface(), effect),
    ).toThrow(/kernel failure/);
    expect(device.release).toHaveBeenCalledTimes(3);
    expect(device.pass).toHaveBeenCalledTimes(1);
  } finally {
    release();
  }
});
it("rejects foreign or released outputs and texture feedback", () => {
  for (const mode of ["foreign", "released", "feedback"] as const) {
    const release = registerCompositionEffect({
      id: "test.invert",
      definition,
      renderGpu(context, input) {
        if (mode === "foreign") return surface();
        const out = context.createSurface(8, 8);
        if (mode === "released") {
          context.releaseSurface(out);
          return out;
        }
        context.pass("void main(){pixel=texture(source,uv);}", out, [out]);
        return input;
      },
    });
    const device = fakeDevice();
    try {
      expect(() =>
        renderGpuEffect(device as unknown as WebglDevice, surface(), effect),
      ).toThrow(/comp-effect-surface/);
    } finally {
      release();
    }
  }
});
it("keeps a stale release from removing a replacement plugin", () => {
  const release = registerCompositionEffect({
    id: "test.invert",
    definition,
    renderGpu: (_context, input) => input,
  });
  release();
  const next = registerCompositionEffect({
    id: "test.invert",
    definition,
    renderGpu: (_context, input) => input,
  });
  try {
    release();
    expect(compositionEffectPlugin("test.invert")).toBeDefined();
  } finally {
    next();
  }
});
it("checks sampled versions before running a replacement kernel", () => {
  const renderGpu = vi.fn((_context, input) => input);
  const release = registerCompositionEffect({
    id: "test.invert",
    definition: { ...definition, version: "1.1.0" },
    renderGpu,
  });
  try {
    expect(() =>
      renderGpuEffect(
        fakeDevice() as unknown as WebglDevice,
        surface(),
        effect,
      ),
    ).toThrow(/comp-effect-version/);
    expect(renderGpu).not.toHaveBeenCalled();
  } finally {
    release();
  }
});

it("bounds scratch allocations and cleans up the entire failed GPU stage", () => {
  const release = registerCompositionEffect({
    id: "test.invert",
    definition,
    renderGpu(context, input) {
      for (let i = 0; i < 32; i++) context.createSurface(8, 8);
      return input;
    },
  });
  const device = fakeDevice();
  try {
    expect(() =>
      renderGpuEffect(device as unknown as WebglDevice, surface(), effect),
    ).toThrow(/budget exceeded/);
    expect(device.surface).toHaveBeenCalledTimes(32);
    expect(device.release).toHaveBeenCalledTimes(32);
    expect(device.pass).toHaveBeenCalledTimes(1);
  } finally {
    release();
  }
});
it("does not publish or leak Canvas scratch surfaces after a callback failure", () => {
  const clear = vi.fn(),
    draw = vi.fn();
  const makeCanvas = () =>
    ({
      width: 8,
      height: 8,
      canvas: {} as HTMLCanvasElement,
      ctx: { drawImage: draw },
    }) as unknown as CanvasSurface;
  const context = {
    createSurface: vi.fn(makeCanvas),
    releaseSurface: vi.fn(),
    clear,
  };
  const release = registerCompositionEffect({
    id: "test.invert",
    definition,
    renderGpu: (_context, input) => input,
    renderCanvas(context) {
      context.createSurface(8, 8);
      throw Error("reference failure");
    },
  });
  try {
    expect(() => renderCanvasEffect(context, makeCanvas(), effect)).toThrow(
      /reference failure/,
    );
    expect(context.releaseSurface).toHaveBeenCalledTimes(2);
    expect(clear).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledTimes(1);
  } finally {
    release();
  }
});
it("reports a missing optional Canvas reference before allocating surfaces", () => {
  const release = registerCompositionEffect({
    id: "test.invert",
    definition,
    renderGpu: (_context, input) => input,
  });
  const context = {
    createSurface: vi.fn(),
    releaseSurface: vi.fn(),
    clear: vi.fn(),
  };
  try {
    expect(() =>
      renderCanvasEffect(context, {} as CanvasSurface, effect),
    ).toThrow(/has no Canvas implementation/);
    expect(context.createSurface).not.toHaveBeenCalled();
  } finally {
    release();
  }
});

it("uploads only correctly sized control data to owned GPU textures", () => {
  for (const valid of [true, false]) {
    const bytes = new Uint8Array(valid ? 64 : 63);
    const release = registerCompositionEffect({
      id: "test.invert",
      definition,
      renderGpu(context, input) {
        const table = context.createSurface(4, 4);
        context.uploadBytes(table, bytes);
        return input;
      },
    });
    const device = fakeDevice();
    try {
      const render = () =>
        renderGpuEffect(device as unknown as WebglDevice, surface(), effect);
      if (valid) {
        expect(render()).toBe(true);
        expect(device.uploadBytes).toHaveBeenCalledWith(
          expect.objectContaining({ width: 4, height: 4 }),
          bytes,
        );
      } else {
        expect(render).toThrow(/uploaded bytes must match/);
        expect(device.uploadBytes).not.toHaveBeenCalled();
      }
      expect(device.release).toHaveBeenCalledTimes(2);
    } finally {
      release();
    }
  }
});
it("owns GPU input snapshots and releases them on callback failure", () => {
  const source = surface(),
    device = fakeDevice(),
    release = registerCompositionEffect({
      id: "test.invert",
      definition: defineCompositionEffect({
        version: "1.0.0",
        properties: {},
        requiresLayers: ["map"],
      }),
      renderGpu(context) {
        const copy = context.layers.get("map")!;
        expect(copy).not.toBe(source);
        context.pass(
          "void main(){pixel=vec4(0.0);}",
          context.createSurface(8, 8),
          [copy],
        );
        throw Error("input failure");
      },
    });
  try {
    expect(() =>
      renderGpuEffect(
        device as unknown as WebglDevice,
        surface(),
        effect,
        new Map([["map", source]]),
      ),
    ).toThrow(/input failure/);
    expect(device.release).toHaveBeenCalledTimes(3);
    expect(device.release.mock.calls.flat()).not.toContain(source);
  } finally {
    release();
  }
});
it("rejects missing or incompatible GPU layer inputs without leaks", () => {
  const device = fakeDevice(),
    release = registerCompositionEffect({
      id: "test.invert",
      definition: defineCompositionEffect({
        version: "1.0.0",
        properties: {},
        requiresLayers: ["map"],
      }),
      renderGpu: (_context, input) => input,
    });
  try {
    expect(() =>
      renderGpuEffect(device as unknown as WebglDevice, surface(), effect),
    ).toThrow(/comp-effect-layer/);
    expect(device.release).toHaveBeenCalledTimes(1);
    expect(() =>
      renderGpuEffect(
        device as unknown as WebglDevice,
        surface(),
        effect,
        new Map([["map", { ...surface(), width: 4 }]]),
      ),
    ).toThrow(/comp-effect-layer/);
    expect(device.release).toHaveBeenCalledTimes(2);
  } finally {
    release();
  }
});
