import { createHash } from "node:crypto";
import type { RenderEffect } from "../../packages/renderer-core/src/composition/render/graph.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { Canvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import type { WebglBounds } from "../../packages/renderer-core/src/composition/render/webgl-bounds.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
export const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export type Surface = WebglSurface & { id: number };
export function builtinHarness(
  Effects: new (
    d: WebglDevice,
    r: Canvas2dBackend,
    b: WebglBounds,
  ) => { apply(dst: WebglSurface, effects: RenderEffect[]): void },
  screen = false,
  solid = false,
) {
  let id = 0;
  const records: unknown[] = [];
  const dst = {
    id: 0,
    width: 173,
    height: 107,
    opaque: false,
    screen,
  } as Surface;
  const gradient = {
    addColorStop: (at: number, color: string) => {
      records.push(["stop", at, color]);
    },
  };
  const ctx = {
    save: () => {
      records.push(["save"]);
    },
    restore: () => {
      records.push(["restore"]);
    },
    set fillStyle(v: unknown) {
      records.push(["style", typeof v === "string" ? v : "gradient"]);
    },
    set globalAlpha(v: number) {
      records.push(["alpha", v]);
    },
    beginPath: () => {
      records.push(["begin"]);
    },
    arc: (...v: number[]) => {
      records.push(["arc", ...v]);
    },
    fill: () => {
      records.push(["fill"]);
    },
    transform: (...v: number[]) => {
      records.push(["transform", ...v]);
    },
    rect: (...v: number[]) => {
      records.push(["rect", ...v]);
    },
    clip: () => {
      records.push(["clip"]);
    },
    createLinearGradient: (...v: number[]) => {
      records.push(["gradient", ...v]);
      return gradient;
    },
    fillRect: (...v: number[]) => {
      records.push(["fillRect", ...v]);
    },
  };
  const raster = {
    createSurface: (w: number, h: number) => {
      records.push(["canvas", w, h]);
      return { canvas: { id: "canvas" }, ctx };
    },
    releaseSurface: () => {
      records.push(["releaseCanvas"]);
    },
  };
  const gl = {
    BLEND: 1,
    FUNC_ADD: 2,
    ONE: 3,
    ONE_MINUS_SRC_ALPHA: 4,
    enable: (x: number) => {
      records.push(["enable", x]);
    },
    disable: (x: number) => {
      records.push(["disable", x]);
    },
    blendEquation: (x: number) => {
      records.push(["equation", x]);
    },
    blendFunc: (...v: number[]) => {
      records.push(["blend", ...v]);
    },
  };
  const device = {
    gl,
    surface: (w: number, h: number, float = false, opaque = false) => {
      records.push(["surface", w, h, float, opaque]);
      return { id: ++id, width: w, height: h } as Surface;
    },
    upload: (s: Surface) => {
      records.push(["upload", s.id]);
    },
    uploadArea: (s: Surface, _c: unknown, area: Bounds) => {
      records.push(["uploadArea", s.id, { ...area }]);
    },
    uploadRegion: (s: Surface, _c: unknown, x: number, y: number) => {
      records.push(["uploadRegion", s.id, x, y]);
    },
    uploadFloats: (s: Surface, v: Float32Array) => {
      records.push(["floats", s.id, v.length, sha(Array.from(v))]);
    },
    uploadBytes: (s: Surface, v: Uint8Array) => {
      records.push(["bytes", s.id, Array.from(v)]);
    },
    copyRegion: (s: Surface, area: Bounds) => {
      records.push(["copyRegion", s.id, { ...area }]);
      return {
        id: ++id,
        width: area.right - area.left,
        height: area.bottom - area.top,
      } as Surface;
    },
    drawRegion: (_s: Surface, area: Bounds) => {
      records.push(["drawRegion", { ...area }]);
      return area;
    },
    solidColor: (_s: Surface, area: Bounds) => {
      records.push(["solid", { ...area }]);
      return solid ? [17, 31, 55, 255] : undefined;
    },
    pass: (
      body: string,
      target: Surface,
      inputs: WebglSurface[],
      uniforms: unknown = {},
      over?: boolean,
      area?: Bounds | null,
    ) => {
      records.push([
        "pass",
        sha(body),
        body.length,
        target.id,
        inputs.map((s) => (s as Surface).id),
        JSON.parse(JSON.stringify(uniforms)),
        over ?? null,
        area ?? null,
      ]);
    },
    swap: (a: Surface, b: Surface) => {
      records.push(["swap", a.id, b.id]);
    },
    release: (s: Surface) => {
      records.push(["release", s.id]);
    },
  };
  const region = { left: 3, top: 5, right: 129, bottom: 91 };
  const bounds = {
    region: (s: Surface) => {
      records.push(["region", s.id]);
      return region;
    },
    snapshot: (s: Surface) => {
      records.push(["snapshot", s.id]);
      return region;
    },
    full: (s: Surface) => {
      records.push(["full", s.id]);
    },
    blur: (s: Surface, r: number) => {
      records.push(["blur", s.id, r]);
    },
    clear: (s: Surface, b: Bounds | null) => {
      records.push(["clear", s.id, b]);
    },
    include: (s: Surface, b: Bounds) => {
      records.push(["include", s.id, { ...b }]);
    },
    release: (s: Surface) => {
      records.push(["releaseBounds", s.id]);
    },
  };
  class Matrix {
    values: number[];
    constructor(values: readonly number[] = [1, 0, 0, 1, 0, 0]) {
      records.push(["matrix", Array.from(values)]);
      this.values = Array.from(values);
    }
    multiplySelf(other: Matrix) {
      const [a, b, c, d, e, f] = this.values as [
          number,
          number,
          number,
          number,
          number,
          number,
        ],
        [g, h, i, j, k, l] = other.values as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
      this.values = [
        a * g + c * h,
        b * g + d * h,
        a * i + c * j,
        b * i + d * j,
        a * k + c * l + e,
        b * k + d * l + f,
      ];
      records.push(["multiply", this.values]);
      return this;
    }
    transformPoint(p: { x: number; y: number }) {
      const [a, b, c, d, e, f] = this.values as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const point = { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
      records.push(["point", p, point]);
      return point;
    }
  }
  const e = new Effects(
    device as unknown as WebglDevice,
    raster as unknown as Canvas2dBackend,
    bounds as unknown as WebglBounds,
  );
  return {
    records,
    dst,
    ctx,
    raster,
    device,
    bounds,
    e,
    Matrix,
    gradient,
    run: (effect: RenderEffect) => e.apply(dst, [effect]),
  };
}
export const effects: RenderEffect[] = [
  {
    effect: "light.radial",
    id: "fixture",
    enabled: true,
    params: {
      x: 47,
      y: 39,
      radius: 31,
      strength: 0.61,
      color: [0.19, 0.37, 0.53, 0.71],
    },
  },
  {
    effect: "particles.rise",
    id: "fixture",
    enabled: true,
    params: {
      progress: 0.37,
      count: 5,
      radius: 7,
      opacity: 0.61,
      seed: 27,
      color: [0.19, 0.37, 0.53, 0.71],
    },
  },
  {
    effect: "stylize.grain",
    id: "fixture",
    enabled: true,
    params: { seed: 27, evolution: 3.7, amount: 0.61 },
  },
  {
    effect: "light.sweep",
    id: "fixture",
    enabled: true,
    params: {
      width: 173,
      height: 107,
      left: 0.1,
      top: 0.2,
      regionWidth: 0.7,
      regionHeight: 0.6,
      band: 0.13,
      progress: 0.37,
      strength: 0.61,
    },
    placement: {
      matrix: [1, 0, 0, 1, 0, 0],
      transforms: [
        [1, 0.13, -0.07, 1, 3, 5],
        [0.93, 0, 0, 1.07, 11, -7],
      ],
    },
  },
  {
    effect: "blur.directional",
    id: "fixture",
    enabled: true,
    params: { length: 17, angle: 37, samples: 21 },
  },
  {
    effect: "distort.sine",
    id: "fixture",
    enabled: true,
    params: { amount: 13, wavelength: 31, phase: 0.37 },
  },
  {
    effect: "light.glow",
    id: "fixture",
    enabled: true,
    params: { radius: 0.01, intensity: 0.61, threshold: 0.37 },
  },
] as RenderEffect[];

import { afterEach, expect, it, vi } from "vitest";
import { WebglEffects } from "../../packages/renderer-core/src/composition/render/webgl-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import * as blend from "../../packages/renderer-core/src/composition/render/webgl-blend.ts";
const limits = { pixels: 1024 * 1024, metadata: 1024 * 1024 };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function harness(screen = false, solid = false) {
  const h = builtinHarness(WebglEffects, screen, solid);
  vi.stubGlobal("DOMMatrix", h.Matrix);
  return h;
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
const original = [
  {
    effect: "light.radial",
    screen: false,
    solid: false,
    calls: 5,
    sha256: "b5c607c28cea115574519a858914192d33651ca430b41b0a7eec0c29b5a50f7e",
    shaderUnits: [722],
  },
  {
    effect: "light.radial",
    screen: true,
    solid: false,
    calls: 4,
    sha256: "2f5c3f344e9601e31bc809168267b874abf62efb71a6c991d4e5d191e6502e9f",
    shaderUnits: [722],
  },
  {
    effect: "light.radial",
    screen: true,
    solid: true,
    calls: 7,
    sha256: "c2cb94a8fa02b8e671648474d6a2b5cd2a4eb1539fd654eb7abd7e9a95a25d3b",
    shaderUnits: [745],
  },
  {
    effect: "particles.rise",
    screen: false,
    solid: false,
    calls: 35,
    sha256: "95db0c68d18b7278c6ea20f498dda1c3da8c3bed31be5aa1792045ba7cd5eee7",
    shaderUnits: [1224],
  },
  {
    effect: "particles.rise",
    screen: true,
    solid: false,
    calls: 71,
    sha256: "ec99538a8cb7efa307c51c343c2e91013f7ee035282e8c56e822ea8c5ef001b6",
    shaderUnits: [458, 458, 458, 458, 458],
  },
  {
    effect: "stylize.grain",
    screen: false,
    solid: false,
    calls: 9,
    sha256: "31bfaefa7e2de310de2ca914372889804d508600c8534f516a177ce89c54072a",
    shaderUnits: [701, 200],
  },
  {
    effect: "stylize.grain",
    screen: true,
    solid: false,
    calls: 9,
    sha256: "31bfaefa7e2de310de2ca914372889804d508600c8534f516a177ce89c54072a",
    shaderUnits: [701, 200],
  },
  {
    effect: "light.sweep",
    screen: false,
    solid: false,
    calls: 32,
    sha256: "0aed48b5d057e4598740723eeb5df5ecc6c944810e07af961b711ecaa83801f8",
    shaderUnits: [246],
  },
  {
    effect: "light.sweep",
    screen: true,
    solid: false,
    calls: 29,
    sha256: "a27b885153f7f79876a2698d9c1923dac1f1647fffa62d7e9f65b9dfc70c6f31",
    shaderUnits: [246],
  },
  {
    effect: "blur.directional",
    screen: false,
    solid: false,
    calls: 6,
    sha256: "d9b68a64616ef4fcb09ea9e5e07e66ee20574f33378353a8765de6abfc1f014d",
    shaderUnits: [7222],
  },
  {
    effect: "blur.directional",
    screen: true,
    solid: false,
    calls: 3,
    sha256: "45aa98597517a7b6989a9ec0269618d1b5e3c3db0c46369245ce4ac8a165ec2c",
    shaderUnits: [7222],
  },
  {
    effect: "distort.sine",
    screen: false,
    solid: false,
    calls: 9,
    sha256: "8b14e714cc7a87ffe34313d8a5b69be7dea66c383e43128d3d0f8a69848f964b",
    shaderUnits: [891],
  },
  {
    effect: "distort.sine",
    screen: true,
    solid: false,
    calls: 6,
    sha256: "6730491bb48c533f085d178baa82f954503068ac912cba0ac5d64a0176ff50fe",
    shaderUnits: [891],
  },
  {
    effect: "light.glow",
    screen: false,
    solid: false,
    calls: 14,
    sha256: "efefe7c2c61d52b4960cbd499ce13cbd24fea555d700adc3d024a005c00dd2ae",
    shaderUnits: [561, 1371],
  },
  {
    effect: "light.glow",
    screen: true,
    solid: false,
    calls: 11,
    sha256: "20aab2ad92e906484978a3709b2441a08677233679214c7c61bbb9ec26c1c369",
    shaderUnits: [561, 1371],
  },
] as const;
it("preserves all fifteen complete original built-in shader, data, matrix, pixel and native call traces", async () => {
  for (const row of original) {
    const effect = effects.find((e) => e.effect === row.effect)!;
    const h = harness(row.screen, row.solid),
      memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      h.run(effect);
      empty(memory);
    });
    expect(h.records).toHaveLength(row.calls);
    expect(sha(h.records)).toBe(row.sha256);
    const inactive = harness(row.screen, row.solid);
    inactive.run(effect);
    expect(sha(inactive.records)).toBe(row.sha256);
  }
});
it("denies fixed built-in factories before parameter getters, shader/default or native producers", async () => {
  const shader = vi.spyOn(blend, "blendShader");
  for (const effect of effects) {
    const h = harness(),
      memory = new ManagedMemory({ ...limits, metadata: 65535 });
    let reads = 0;
    const input = {
      ...effect,
      params: new Proxy(effect.params, {
        get(target, name) {
          if (
            !["length", "amount"].includes(String(name)) &&
            !(
              effect.effect === "light.glow" &&
              ["radius", "intensity"].includes(String(name))
            )
          )
            reads++;
          return Reflect.get(target, name);
        },
      }),
    };
    await withManagedMemory(memory, async () => {
      expect(() => h.run(input)).toThrow(/metadata/);
      expect(h.records).toEqual([]);
      empty(memory);
    });
    expect(reads).toBe(0);
  }
  expect(shader).not.toHaveBeenCalled();
});
it("owns actual fresh arrays, uniforms and texts through passes and final bounds consumers, then clears them", async () => {
  for (const effect of effects.filter((e) => e.effect !== "light.sweep")) {
    const h = harness(),
      memory = new ManagedMemory(limits);
    const inputs: WebglSurface[][] = [],
      uniforms: Record<string, unknown>[] = [],
      vectors: number[][] = [];
    const pass = h.device.pass;
    vi.spyOn(h.device, "pass").mockImplementation(
      (body, dst, sources, values = {}, over, box) => {
        expect(memory.statistics.current.metadata).toBeGreaterThanOrEqual(
          65536,
        );
        inputs.push(sources);
        uniforms.push(values as Record<string, unknown>);
        for (const value of Object.values(values as Record<string, unknown>))
          if (Array.isArray(value)) vectors.push(value);
        pass(body, dst, sources, values, over, box);
      },
    );
    const full = h.bounds.full;
    vi.spyOn(h.bounds, "full").mockImplementation((dst) => {
      expect(memory.statistics.current.metadata).toBeGreaterThanOrEqual(65536);
      full(dst);
    });
    const prior = JSON.stringify(effect);
    await withManagedMemory(memory, async () => {
      h.run(effect);
      empty(memory);
    });
    for (const input of inputs) expect(input).toEqual([]);
    for (const record of uniforms) expect(record).toEqual({});
    for (const vector of vectors) expect(vector).toEqual([]);
    expect(JSON.stringify(effect)).toBe(prior);
  }
});
it("denies each sweep matrix before its constructor, retaining original borrowed transforms and allowing retry", async () => {
  const effect = effects.find((e) => e.effect === "light.sweep")!,
    before = JSON.stringify(effect);
  for (const count of [0, 1]) {
    const h = harness(),
      memory = new ManagedMemory({
        ...limits,
        metadata: 65536 + 1280 * (count + 1) - 1,
      });
    await withManagedMemory(memory, async () => {
      expect(() => h.run(effect)).toThrow(/metadata/);
      empty(memory);
    });
    expect(
      h.records.filter((r) => Array.isArray(r) && r[0] === "matrix"),
    ).toHaveLength(count + 1);
    expect(
      h.records.filter((r) => Array.isArray(r) && r[0] === "multiply"),
    ).toHaveLength(count);
    expect(
      h.records.filter((r) => Array.isArray(r) && r[0] === "canvas"),
    ).toHaveLength(0);
    expect(JSON.stringify(effect)).toBe(before);
  }
  const h = harness(),
    memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    h.run(effect);
    empty(memory);
  });
});
it("retains actual sweep corner, matrix, point, gradient and callback references until consumers then drops them", async () => {
  const h = harness(),
    memory = new ManagedMemory(limits),
    effect = effects.find((e) => e.effect === "light.sweep")!;
  let owner:
    | {
        references: object[];
        arrays: number[][];
        corners?: DOMPoint[];
        texts: string[];
        boxes: Bounds[];
      }
    | undefined;
  const adopt = memory.adopt.bind(memory);
  vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
    if (
      "references" in value &&
      "corners" in value === false &&
      "texts" in value
    )
      owner = value as typeof owner;
    return adopt(value, lease, destroy);
  });
  const fill = h.ctx.fillRect;
  vi.spyOn(h.ctx, "fillRect").mockImplementation((...args) => {
    expect(owner?.references).toContain(h.gradient);
    expect(owner?.corners).toHaveLength(4);
    expect(owner?.arrays.length).toBe(8);
    fill(...args);
  });
  await withManagedMemory(memory, async () => {
    h.run(effect);
    empty(memory);
  });
  expect(owner?.references).toEqual([]);
  expect(owner?.arrays).toEqual([]);
  expect(owner?.corners).toBeUndefined();
  expect(owner?.texts).toEqual([]);
  expect(owner?.boxes).toEqual([]);
});
it("detaches sine pixel storage after original math/getter failure before upload and preserves null through native cleanup", async () => {
  const h = harness(),
    memory = new ManagedMemory(limits),
    effect = effects.find((e) => e.effect === "distort.sine")!;
  let buffer: ArrayBufferLike | undefined;
  const adopt = memory.adopt.bind(memory);
  vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
    if (value instanceof ArrayBuffer) buffer = value;
    return adopt(value, lease, destroy);
  });
  const sin = vi.spyOn(Math, "sin").mockImplementationOnce(() => {
    throw null;
  });
  vi.spyOn(h.device, "release").mockImplementationOnce(() => {
    throw Error("secondary");
  });
  await withManagedMemory(memory, async () => {
    try {
      h.run(effect);
      expect.fail("math must fail");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(buffer?.byteLength).toBe(0);
    expect(
      h.records.filter((r) => Array.isArray(r) && r[0] === "floats"),
    ).toEqual([]);
    empty(memory);
    sin.mockRestore();
    h.run(effect);
    empty(memory);
  });
});
it("visits grain source release after first-null disable, or preserves original null pass over disable and release failures", async () => {
  const effect = effects.find((e) => e.effect === "stylize.grain")!;
  for (const originalFailure of [false, true]) {
    const h = harness(),
      memory = new ManagedMemory(limits),
      release = vi.spyOn(h.device, "release"),
      disable = vi.spyOn(h.device.gl, "disable").mockImplementationOnce(() => {
        throw originalFailure ? Error("secondary") : null;
      });
    if (originalFailure) {
      vi.spyOn(h.device, "pass").mockImplementationOnce(() => {
        throw null;
      });
      release.mockImplementationOnce(() => {
        throw Error("release secondary");
      });
    }
    await withManagedMemory(memory, async () => {
      try {
        h.run(effect);
        expect.fail("must fail");
      } catch (error) {
        expect(error).toBe(null);
      }
      empty(memory);
    });
    expect(disable).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  }
});
it("releases glow bounds and source after early bounds or first-null cleanup failure and preserves original null", async () => {
  const effect = effects.find((e) => e.effect === "light.glow")!;
  for (const stage of ["region", "clear", "include", "release"] as const) {
    const h = harness(),
      memory = new ManagedMemory(limits),
      release = vi.spyOn(h.device, "release"),
      boundsRelease = vi.spyOn(h.bounds, "release");
    if (stage === "release")
      boundsRelease.mockImplementationOnce(() => {
        throw null;
      });
    else
      vi.spyOn(h.bounds, stage).mockImplementationOnce(() => {
        throw null;
      });
    if (stage !== "release")
      boundsRelease.mockImplementationOnce(() => {
        throw Error("secondary bounds");
      });
    release.mockImplementation((surface) => {
      if (surface.id === 1) throw Error("secondary device");
    });
    await withManagedMemory(memory, async () => {
      try {
        h.run(effect);
        expect.fail(stage);
      } catch (error) {
        expect(error).toBe(null);
      }
      empty(memory);
    });
    expect(boundsRelease).toHaveBeenCalledTimes(1);
    // A completed replace releases its output before glow teardown.
    expect(
      release.mock.calls.filter(([surface]) => surface.id === 1),
    ).toHaveLength(1);
  }
});
it("clears fresh effect data when parameter getters fail with null then allows retry", async () => {
  for (const name of [
    "light.radial",
    "particles.rise",
    "blur.directional",
    "distort.sine",
  ] as const) {
    const h = harness(name === "light.radial", name === "light.radial"),
      memory = new ManagedMemory(limits),
      effect = effects.find((e) => e.effect === name)!;
    const broken = {
      ...effect,
      params: {
        ...effect.params,
        get color() {
          if (name === "light.radial" || name === "particles.rise") throw null;
          return effect.params.color!;
        },
        get angle() {
          if (name === "blur.directional") throw null;
          return effect.params.angle!;
        },
        get phase() {
          if (name === "distort.sine") throw null;
          return effect.params.phase!;
        },
      },
    };
    await withManagedMemory(memory, async () => {
      try {
        h.run(broken);
        expect.fail(name);
      } catch (error) {
        expect(error).toBe(null);
      }
      empty(memory);
      h.run(effect);
      empty(memory);
    });
  }
});
it("preserves sweep fallback, nonfinite bounds and null gradient failure without mutating borrowed placement", async () => {
  const effect = effects.find((e) => e.effect === "light.sweep")!,
    fallback = {
      ...effect,
      placement: {
        matrix: effect.placement!.matrix,
      } as NonNullable<RenderEffect["placement"]>,
    };
  const h = harness(),
    memory = new ManagedMemory(limits),
    gradient = vi
      .spyOn(h.ctx, "createLinearGradient")
      .mockImplementationOnce(() => {
        throw null;
      });
  await withManagedMemory(memory, async () => {
    try {
      h.run(fallback);
      expect.fail("gradient");
    } catch (error) {
      expect(error).toBe(null);
    }
    empty(memory);
    gradient.mockRestore();
    h.run(fallback);
    empty(memory);
  });
  expect(fallback.placement?.matrix).toEqual([1, 0, 0, 1, 0, 0]);
  const invalid = { ...fallback, params: { ...fallback.params, left: NaN } };
  await withManagedMemory(memory, async () => {
    h.run(invalid);
    empty(memory);
  });
  expect(
    h.records.filter((r) => Array.isArray(r) && r[0] === "upload").length,
  ).toBe(1);
});
it("keeps disabled, zero-work and empty-radial paths and denies the actual final classification list", async () => {
  const h = harness(),
    memory = new ManagedMemory({ ...limits, metadata: 1023 });
  await withManagedMemory(memory, async () => {
    h.run({ ...effects[0]!, enabled: false });
    empty(memory);
    for (const effect of effects.filter((e) =>
      ["blur.directional", "distort.sine", "light.glow"].includes(e.effect),
    )) {
      expect(() =>
        h.run({
          ...effect,
          params: { ...effect.params, length: 0, amount: 0, radius: 0 },
        }),
      ).toThrow(/metadata/);
      empty(memory);
    }
  });
  const radial = harness(true),
    full = vi.spyOn(radial.bounds, "full"),
    native = vi.spyOn(radial.device, "pass"),
    normal = new ManagedMemory(limits);
  await withManagedMemory(normal, async () => {
    radial.run({
      ...effects[0]!,
      params: { ...effects[0]!.params, x: -1000, y: -1000 },
    });
    empty(normal);
  });
  expect(native).not.toHaveBeenCalled();
  expect(full).toHaveBeenCalledTimes(1);
});
it("preserves null shader and radial upload failures, detaches actual byte input, clears metadata and permits retry", async () => {
  const effect = effects.find((e) => e.effect === "particles.rise")!,
    h = harness(),
    memory = new ManagedMemory(limits);
  const shader = vi.spyOn(blend, "blendShader").mockImplementationOnce(() => {
    throw null;
  });
  await withManagedMemory(memory, async () => {
    try {
      h.run(effect);
      expect.fail("shader");
    } catch (error) {
      expect(error).toBe(null);
    }
    empty(memory);
    expect(h.records).toEqual([]);
    shader.mockRestore();
    h.run(effect);
    empty(memory);
  });
  const radial = harness(true, true),
    input = effects.find((e) => e.effect === "light.radial")!;
  let bytes: Uint8Array | undefined;
  vi.spyOn(radial.device, "uploadBytes").mockImplementationOnce(
    (_source, value) => {
      bytes = value;
      expect(memory.statistics.current.pixels).toBe(4);
      throw null;
    },
  );
  const release = vi
    .spyOn(radial.device, "release")
    .mockImplementationOnce(() => {
      throw Error("secondary");
    });
  await withManagedMemory(memory, async () => {
    try {
      radial.run(input);
      expect.fail("upload");
    } catch (error) {
      expect(error).toBe(null);
    }
    expect(bytes?.byteLength).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
    empty(memory);
    radial.run(input);
    empty(memory);
  });
});
it("drops actual owners on first native construction failure for grain, sine, glow and solid radial", async () => {
  for (const name of [
    "stylize.grain",
    "distort.sine",
    "light.glow",
    "light.radial",
  ]) {
    const effect = effects.find((e) => e.effect === name)!,
      h = harness(name === "light.radial", name === "light.radial"),
      memory = new ManagedMemory(limits);
    const surface = vi.spyOn(h.device, "surface").mockImplementationOnce(() => {
        throw null;
      }),
      release = vi.spyOn(h.device, "release");
    await withManagedMemory(memory, async () => {
      try {
        h.run(effect);
        expect.fail(name);
      } catch (error) {
        expect(error).toBe(null);
      }
      expect(release).not.toHaveBeenCalled();
      empty(memory);
      surface.mockRestore();
      h.run(effect);
      empty(memory);
    });
  }
});
