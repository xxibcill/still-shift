import { afterEach, expect, it, vi } from "vitest";
import { WebglDepthImages } from "../../packages/renderer-core/src/composition/render/webgl-depth-image.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { CanvasImageResources } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import type {
  DepthImageContent,
  ImageContent,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import { createHash } from "node:crypto";
export const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function depthDrawHarness(kind = "depth") {
  let id = 0;
  const records: unknown[] = [];
  const snapshots: (Int32Array | Float32Array)[] = [];
  const names = [
    "MAX_TEXTURE_SIZE",
    "TEXTURE_2D",
    "TEXTURE_MIN_FILTER",
    "TEXTURE_MAG_FILTER",
    "LINEAR",
    "TEXTURE_WRAP_S",
    "TEXTURE_WRAP_T",
    "CLAMP_TO_EDGE",
    "UNPACK_FLIP_Y_WEBGL",
    "UNPACK_PREMULTIPLY_ALPHA_WEBGL",
    "UNPACK_COLORSPACE_CONVERSION_WEBGL",
    "SRGB8_ALPHA8",
    "RGBA8",
    "RGBA",
    "UNSIGNED_BYTE",
    "RENDERBUFFER",
    "SAMPLES",
    "FRAMEBUFFER",
    "COLOR_ATTACHMENT0",
    "FRAMEBUFFER_COMPLETE",
    "VERTEX_ARRAY_BINDING",
    "CURRENT_PROGRAM",
    "ARRAY_BUFFER_BINDING",
    "RENDERBUFFER_BINDING",
    "READ_FRAMEBUFFER_BINDING",
    "DRAW_FRAMEBUFFER_BINDING",
    "VIEWPORT",
    "COLOR_CLEAR_VALUE",
    "FRONT_FACE",
    "CULL_FACE_MODE",
    "ACTIVE_TEXTURE",
    "BLEND",
    "CULL_FACE",
    "DEPTH_TEST",
    "SCISSOR_TEST",
    "DITHER",
    "TEXTURE0",
    "TEXTURE1",
    "TEXTURE_BINDING_2D",
    "ARRAY_BUFFER",
    "READ_FRAMEBUFFER",
    "DRAW_FRAMEBUFFER",
    "BACK",
    "CCW",
    "COLOR_BUFFER_BIT",
    "TRIANGLES",
    "UNSIGNED_SHORT",
    "NEAREST",
  ];
  const gl: Record<string, unknown> = { NONE: 0 };
  for (let i = 0; i < names.length; i++) gl[names[i]!] = i + 1;
  const record = (name: string, ...v: unknown[]) =>
    records.push([name, ...JSON.parse(JSON.stringify(v))]);
  gl.getParameter = (name: number) => {
    record("parameter", name);
    if (name === gl.MAX_TEXTURE_SIZE) return 8192;
    if (name === gl.VIEWPORT) {
      const v = new Int32Array([2, 3, 173, 107]);
      snapshots.push(v);
      return v;
    }
    if (name === gl.COLOR_CLEAR_VALUE) {
      const v = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      snapshots.push(v);
      return v;
    }
    if (name === gl.TEXTURE_BINDING_2D) return { id: "oldTexture" };
    if (
      name === gl.UNPACK_FLIP_Y_WEBGL ||
      name === gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL
    )
      return false;
    return 77;
  };
  gl.getInternalformatParameter = (...v: unknown[]) => {
    record("samples", ...v);
    return new Int32Array([4, 2, 1]);
  };
  for (const name of [
    "createTexture",
    "createRenderbuffer",
    "createFramebuffer",
  ])
    gl[name] = () => {
      const v = { id: ++id };
      record(name, v);
      return v;
    };
  for (const name of [
    "bindTexture",
    "texParameteri",
    "pixelStorei",
    "texImage2D",
    "deleteTexture",
    "bindFramebuffer",
    "bindRenderbuffer",
    "renderbufferStorageMultisample",
    "framebufferRenderbuffer",
    "deleteFramebuffer",
    "deleteRenderbuffer",
    "useProgram",
    "bindVertexArray",
    "activeTexture",
    "uniform2f",
    "uniform1i",
    "uniform1f",
    "uniform2fv",
    "viewport",
    "disable",
    "enable",
    "cullFace",
    "frontFace",
    "clearColor",
    "clear",
    "drawElements",
    "blitFramebuffer",
    "bindBuffer",
    "deleteProgram",
  ])
    gl[name] = (...v: unknown[]) => {
      record(name, ...v);
    };
  gl.isEnabled = (flag: number) => {
    record("enabled", flag);
    return flag === gl.BLEND;
  };
  gl.checkFramebufferStatus = (...v: unknown[]) => {
    record("status", ...v);
    return gl.FRAMEBUFFER_COMPLETE;
  };
  gl.getUniformLocation = (p: unknown, name: string) => {
    record("uniformLocation", p, name);
    return { name };
  };
  const images = new Map([
      ["photo", { id: "photo" }],
      ["depth", { id: "depth" }],
    ]),
    sizes = new Map([
      ["photo", [64, 48]],
      ["depth", [64, 48]],
    ]);
  const device = {
    gl: gl as unknown as WebGL2RenderingContext,
    passes: 0,
    surface: (w: number, h: number) => {
      const v = {
        id: ++id,
        width: w,
        height: h,
        framebuffer: { id: "fb" + id },
      };
      record("surface", v);
      return v;
    },
    release: (v: unknown) => {
      record("release", v);
    },
    pass: (
      body: string,
      output: unknown,
      inputs: unknown[],
      uniforms: unknown,
    ) => {
      record("pass", sha(body), body.length, output, inputs, uniforms);
    },
  };
  const motion = {
      scale: 1.1,
      strength: 0.02,
      roll: 0.2,
      offset: [0.01, -0.02],
    },
    content =
      kind === "depth"
        ? {
            type: "depth-image",
            width: 16,
            height: 12,
            layer: {
              id: "layer",
              sourceAsset: "photo",
              depth: { asset: "depth" },
              overscan: 0.1,
              edgeDamping: 0.7,
              framing: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
              alphaMode: "preserve",
            },
            sourceHash: "source:hash",
            depthHash: "depth:hash",
            motion,
          }
        : {
            type: "image",
            width: 18,
            height: 11,
            fit: kind === "stretch" ? "stretch" : "cover",
            sources: [{ asset: "photo" }],
            plane: {
              owner: "layer",
              sourceHash: "source:hash",
              controls: {
                overscan: 0.08,
                framing: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
                reveal: { mode: "half-wipe" },
              },
              alphaMode: "opaque",
              motion: { ...motion, revealProgress: 0.4 },
            },
          };
  return { records, snapshots, device, images, sizes, content };
}

const limits = { pixels: 2 * 1024 * 1024, metadata: 2 * 1024 * 1024 };
type PrivateDepth = {
  program?: WebGLProgram | undefined;
  vao?: WebGLVertexArrayObject | undefined;
  count: number;
};
function setup(kind = "depth") {
  const h = depthDrawHarness(kind);
  const p = new WebglDepthImages(
    h.device as unknown as WebglDevice,
    h as unknown as CanvasImageResources,
  );
  const privateDepth = p as unknown as PrivateDepth;
  privateDepth.program = { id: "program" } as WebGLProgram;
  privateDepth.vao = 77 as unknown as WebGLVertexArrayObject;
  privateDepth.count = 55296;
  return {
    ...h,
    p,
    private: privateDepth,
    run: () => p.draw(h.content as DepthImageContent | ImageContent),
    dispose: () => {
      privateDepth.vao = undefined;
      p.dispose();
    },
  };
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
afterEach(() => vi.restoreAllMocks());
it("preserves three complete original prepared-program depth/image/stretch draw, repeat and native disposal traces", async () => {
  for (const [kind, calls, hash] of [
    [
      "depth",
      230,
      "7bc0ee0808b8c52cc72e4fe61dd0e811caff30a0b7e2704a7f7f38c072954616",
    ],
    [
      "image",
      218,
      "f8169c41bc7cc8e852ab903bec75920c3c5a5cc053bf1c8d2d7668b1a8179386",
    ],
    [
      "stretch",
      218,
      "3c37cf1eb33e480dee10262c3a8423d38e00c6dddbbe44d4b8ad184368d3e2ba",
    ],
  ] as const) {
    for (const active of [false, true]) {
      const memory = new ManagedMemory(limits);
      const work = async () => {
        const h = setup(kind);
        h.device.release(h.run());
        h.device.release(h.run());
        h.dispose();
        expect(h.records).toHaveLength(calls);
        expect(sha(h.records)).toBe(hash);
      };
      if (active) await withManagedMemory(memory, work);
      else await work();
      empty(memory);
      memory.dispose();
    }
  }
});
it("denies actual layer/motion/state data before borrowed layer getters or native surface producers", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 3072 + 8191 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    const original = h.content.layer;
    const layer = vi.fn(() => original);
    Object.defineProperty(h.content, "layer", { get: layer });
    expect(() => h.run()).toThrow(/metadata/);
    expect(layer).not.toHaveBeenCalled();
    expect(h.records).toEqual([]);
    h.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("holds fresh viewport/clear backings and pass input/uniform data through native consumers then detaches and clears them", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup("image");
    let inputs: WebglSurface[] | undefined,
      uniforms: Record<string, number> | undefined;
    vi.spyOn(h.device, "pass").mockImplementation((_body, _output, i, u) => {
      inputs = i as WebglSurface[];
      uniforms = u as Record<string, number>;
      expect(inputs).toHaveLength(1);
      expect(uniforms.height).toBe(11);
      expect(h.snapshots.map((v) => v.byteLength)).toEqual([16, 16]);
      expect(memory.statistics.current.metadata).toBeGreaterThan(8192);
    });
    const borrowed = JSON.stringify(h.content);
    h.device.release(h.run());
    expect(inputs).toEqual([]);
    expect(uniforms).toEqual({});
    expect(h.snapshots.map((v) => v.byteLength)).toEqual([0, 0]);
    expect(JSON.stringify(h.content)).toBe(borrowed);
    h.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("releases output and the first actual viewport backing after a later snapshot query throws null, preserving null over secondary release", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const query = h.device.gl.getParameter;
    vi.spyOn(h.device.gl, "getParameter").mockImplementation((name) => {
      if (name === h.device.gl.COLOR_CLEAR_VALUE) throw null;
      return query(name);
    });
    const release = vi.spyOn(h.device, "release").mockImplementationOnce(() => {
      throw Error("secondary");
    });
    let failure: unknown = "unset";
    try {
      h.run();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(release).toHaveBeenCalledTimes(1);
    expect(h.snapshots.map((v) => v.byteLength)).toEqual([0]);
    expect(memory.statistics.current.metadata).toBe(3072);
    vi.restoreAllMocks();
    h.device.release(h.run());
    h.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("restores original state and releases both actual surfaces after pass null despite a secondary restoration error, then retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(h.device, "pass").mockImplementationOnce(() => {
      throw null;
    });
    const bind = h.device.gl.bindVertexArray;
    vi.spyOn(h.device.gl, "bindVertexArray")
      .mockImplementationOnce(bind)
      .mockImplementationOnce(() => {
        throw Error("secondary state");
      });
    const release = vi.spyOn(h.device, "release");
    let failure: unknown = "unset";
    try {
      h.run();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(release).toHaveBeenCalledTimes(2);
    expect(h.snapshots.map((v) => v.byteLength)).toEqual([0, 0]);
    expect(
      h.records.filter((x) => (x as unknown[])[0] === "pixelStorei").length,
    ).toBeGreaterThanOrEqual(9);
    h.device.release(h.run());
    h.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("visits failed output after resolved release throws null and preserves the original pass null", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(h.device, "pass").mockImplementationOnce(() => {
      throw null;
    });
    const release = vi
      .spyOn(h.device, "release")
      .mockImplementationOnce(() => {
        throw Error("secondary resolved");
      })
      .mockImplementationOnce(() => {
        throw Error("secondary output");
      });
    let failure: unknown = "unset";
    try {
      h.run();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(release).toHaveBeenCalledTimes(2);
    expect(h.snapshots.map((v) => v.byteLength)).toEqual([0, 0]);
    h.device.release(h.run());
    h.dispose();
  });
  empty(memory);
  memory.dispose();
});

it("releases the unreturned output after successful pass when state restoration throws null, visiting resolved and remaining native state", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const use = h.device.gl.useProgram;
    vi.spyOn(h.device.gl, "useProgram")
      .mockImplementationOnce(use)
      .mockImplementationOnce(() => {
        throw null;
      });
    const release = vi.spyOn(h.device, "release");
    let failure: unknown = "unset";
    try {
      h.run();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(release).toHaveBeenCalledTimes(2);
    expect(h.snapshots.map((v) => v.byteLength)).toEqual([0, 0]);
    h.device.release(h.run());
    h.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("cleans both snapshot backings and output after partial flag or binding queries fail, then permits retry", async () => {
  for (const kind of ["flag", "binding"] as const) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = setup();
      let calls = 0;
      if (kind === "flag") {
        const enabled = h.device.gl.isEnabled;
        vi.spyOn(h.device.gl, "isEnabled").mockImplementation((flag) => {
          if (++calls === 3) throw null;
          return enabled(flag);
        });
      } else {
        const query = h.device.gl.getParameter;
        vi.spyOn(h.device.gl, "getParameter").mockImplementation((name) => {
          if (name === h.device.gl.TEXTURE_BINDING_2D && ++calls === 2)
            throw null;
          return query(name);
        });
      }
      const release = vi.spyOn(h.device, "release");
      let failure: unknown = "unset";
      try {
        h.run();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(release).toHaveBeenCalledTimes(1);
      expect(h.snapshots.map((v) => v.byteLength)).toEqual([0, 0]);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
      vi.restoreAllMocks();
      h.device.release(h.run());
      h.dispose();
    });
    empty(memory);
    memory.dispose();
  }
});

it("releases temporary layer and required-asset data on original validation failures before producing a surface", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.sizes.delete("depth");
    expect(() => h.run()).toThrow(/dimensions are unavailable/);
    expect(h.records).toEqual([]);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    h.sizes.set("depth", [64, 48]);
    h.device.release(h.run());
    h.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("preserves original first-surface producer null without leaking temporary metadata and permits retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(h.device, "surface").mockImplementationOnce(() => {
      throw null;
    });
    let failure: unknown = "unset";
    try {
      h.run();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(h.records).toEqual([]);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    h.device.release(h.run());
    h.dispose();
  });
  empty(memory);
  memory.dispose();
});
