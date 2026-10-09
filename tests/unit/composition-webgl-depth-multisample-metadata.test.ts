import { afterEach, expect, it, vi } from "vitest";
import { WebglDepthImages } from "../../packages/renderer-core/src/composition/render/webgl-depth-image.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import type { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { CanvasImageResources } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { createHash } from "node:crypto";
export const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function multisampleHarness() {
  let id = 0;
  const records: unknown[] = [];
  const gl = {
    RENDERBUFFER: 1,
    RGBA8: 2,
    SAMPLES: 3,
    FRAMEBUFFER: 4,
    COLOR_ATTACHMENT0: 5,
    FRAMEBUFFER_COMPLETE: 6,
    getInternalformatParameter: (...v: unknown[]) => {
      records.push(["samples", ...v]);
      return new Int32Array([4, 2, 1]);
    },
    createRenderbuffer: () => {
      const v = { id: ++id };
      records.push(["renderbuffer", v.id]);
      return v;
    },
    createFramebuffer: () => {
      const v = { id: ++id };
      records.push(["framebuffer", v.id]);
      return v;
    },
    bindFramebuffer: (...v: unknown[]) => {
      records.push(["bindFramebuffer", ...v]);
    },
    bindRenderbuffer: (...v: unknown[]) => {
      records.push(["bindRenderbuffer", ...v]);
    },
    renderbufferStorageMultisample: (...v: unknown[]) => {
      records.push(["storage", ...v]);
    },
    framebufferRenderbuffer: (...v: unknown[]) => {
      records.push(["attachment", ...v]);
    },
    checkFramebufferStatus: (...v: unknown[]) => {
      records.push(["status", ...v]);
      return 6;
    },
    deleteFramebuffer: (v: { id: number }) => {
      records.push(["deleteFramebuffer", v.id]);
    },
    deleteRenderbuffer: (v: { id: number }) => {
      records.push(["deleteRenderbuffer", v.id]);
    },
  };
  return { records, device: { gl }, images: new Map(), sizes: new Map() };
}

type Control = {
  framebuffer?: WebGLFramebuffer;
  color?: WebGLRenderbuffer;
  width?: number;
  height?: number;
  memory?: ManagedMemory;
};
type PrivateDepth = {
  antialias(width: number, height: number, node: string): Control;
  multisample?: Control;
  texture(id: string, hash: string, color: boolean, node: string): WebGLTexture;
};
const limits = { pixels: 2 * 1024 * 1024, metadata: 2 * 1024 * 1024 };
function setup() {
  const h = multisampleHarness();
  const p = new WebglDepthImages(
    h.device as unknown as WebglDevice,
    h as unknown as CanvasImageResources,
  );
  return {
    ...h,
    p,
    private: p as unknown as PrivateDepth,
    run: (w = 16, h = 12) =>
      (p as unknown as PrivateDepth).antialias(w, h, "layer"),
  };
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
afterEach(() => vi.restoreAllMocks());
it("preserves the complete original multisample create, repeat, resize and native disposal trace in active and inactive scopes", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits);
    const work = async () => {
      const h = setup();
      const a = h.run();
      expect(h.run()).toBe(a);
      h.run(8, 8);
      h.p.dispose();
      expect(h.records).toHaveLength(20);
      expect(sha(h.records)).toBe(
        "6e19e334fdc367864f34a7f8be2bcf439f161c429d4840fc1762002c5704e0a5",
      );
    };
    if (active) await withManagedMemory(memory, work);
    else await work();
    empty(memory);
    memory.dispose();
  }
});
it("admits actual returned/native controls before renderbuffer or framebuffer factories", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 3072 + 1023 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    expect(() => h.run()).toThrow(/metadata/);
    expect(h.records).toEqual([["samples", 1, 2, 3]]);
    expect(h.private.multisample).toBeUndefined();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("keeps actual record and native references through storage and original cache reuse then clears fields on disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(h.device.gl, "renderbufferStorageMultisample").mockImplementation(
      () => {
        expect(memory.statistics.current).toEqual({
          pixels: 16 * 12 * 16,
          metadata: 3072 + 1024,
        });
      },
    );
    const a = h.run();
    expect(memory.owns(a)).toBe(true);
    expect(memory.owns(a.color!)).toBe(true);
    expect(h.run()).toBe(a);
    expect(
      h.records.filter((x) => (x as unknown[])[0] === "samples"),
    ).toHaveLength(1);
    h.p.dispose();
    expect(a.framebuffer).toBeUndefined();
    expect(a.color).toBeUndefined();
    expect(a.memory).toBeUndefined();
    expect(a.width).toBeUndefined();
    expect(a.height).toBeUndefined();
    expect(h.private.multisample).toBeUndefined();
  });
  empty(memory);
  memory.dispose();
});
it("preserves original MSAA pixel quota ahead of native factories and allows a smaller retry", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 16 * 12 * 16 - 1 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    expect(() => h.run()).toThrow(/pixels/);
    expect(h.records).toEqual([["samples", 1, 2, 3]]);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    expect(h.run(8, 8)).toBeDefined();
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("visits partial native framebuffer and renderbuffer after original null storage failure while preserving null over secondary deletions", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(
      h.device.gl,
      "renderbufferStorageMultisample",
    ).mockImplementationOnce(() => {
      throw null;
    });
    const rb = vi
      .spyOn(h.device.gl, "deleteRenderbuffer")
      .mockImplementationOnce(() => {
        throw Error("secondary renderbuffer");
      });
    const fb = vi
      .spyOn(h.device.gl, "deleteFramebuffer")
      .mockImplementationOnce(() => {
        throw Error("secondary framebuffer");
      });
    let failure: unknown = "unset";
    try {
      h.run();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(rb).toHaveBeenCalledTimes(1);
    expect(fb).toHaveBeenCalledTimes(1);
    expect(h.private.multisample).toBeUndefined();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    expect(h.run()).toBeDefined();
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("cleans original framebuffer creation and incomplete-status failures then permits retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const fb = vi
      .spyOn(h.device.gl, "createFramebuffer")
      .mockReturnValueOnce(null as never);
    expect(() => h.run()).toThrow(/framebuffer creation/);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    const status = vi
      .spyOn(h.device.gl, "checkFramebufferStatus")
      .mockReturnValueOnce(0);
    expect(() => h.run()).toThrow(/incomplete/);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    expect(h.private.multisample).toBeUndefined();
    expect(h.run()).toBeDefined();
    expect(fb).toHaveBeenCalledTimes(3);
    expect(status).toHaveBeenCalledTimes(2);
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("drops old resize references and visits color despite first-null framebuffer deletion, then retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const a = h.run();
    const fb = vi
      .spyOn(h.device.gl, "deleteFramebuffer")
      .mockImplementationOnce(() => {
        throw null;
      });
    const rb = vi
      .spyOn(h.device.gl, "deleteRenderbuffer")
      .mockImplementationOnce(() => {
        throw Error("secondary color");
      });
    let failure: unknown = "unset";
    try {
      h.run(8, 8);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(fb).toHaveBeenCalledTimes(1);
    expect(rb).toHaveBeenCalledTimes(1);
    expect(a.framebuffer).toBeUndefined();
    expect(a.color).toBeUndefined();
    expect(h.private.multisample).toBeUndefined();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    expect(h.run(8, 8)).toBeDefined();
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("retains actual control through scratch and releases native handles once after scope exit and allocator-first disposal", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    let h: ReturnType<typeof setup> | undefined;
    let a: Control | undefined;
    await withManagedMemory(memory, async () => {
      memory.beginScratch();
      h = setup();
      a = h.run();
      memory.endScratch();
      expect(memory.owns(a)).toBe(true);
      expect(memory.owns(a.color!)).toBe(true);
    });
    if (allocatorFirst) memory.dispose();
    h!.p.dispose();
    memory.dispose();
    expect(a!.framebuffer).toBeUndefined();
    expect(a!.color).toBeUndefined();
    expect(a!.memory).toBeUndefined();
    expect(h!.private.multisample).toBeUndefined();
    expect(
      h!.records.filter((x) => (x as unknown[])[0] === "deleteFramebuffer"),
    ).toHaveLength(1);
    expect(
      h!.records.filter((x) => (x as unknown[])[0] === "deleteRenderbuffer"),
    ).toHaveLength(1);
    empty(memory);
  }
});
it("avoids duplicate native color release when its actual pixel owner retires before its control", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const a = h.run();
    memory.release(a.color!);
    h.p.dispose();
    expect(
      h.records.filter((x) => (x as unknown[])[0] === "deleteRenderbuffer"),
    ).toHaveLength(1);
    expect(
      h.records.filter((x) => (x as unknown[])[0] === "deleteFramebuffer"),
    ).toHaveLength(1);
    expect(a.color).toBeUndefined();
  });
  empty(memory);
  memory.dispose();
});
it("rejects foreign or unmanaged active controls before original samples query or native creation", async () => {
  for (const foreign of [false, true]) {
    const first = new ManagedMemory(limits);
    let h: ReturnType<typeof setup> | undefined;
    if (foreign)
      await withManagedMemory(first, async () => {
        h = setup();
      });
    else h = setup();
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      expect(() => h!.run()).toThrow(/another allocator/);
      expect(h!.records).toEqual([]);
    });
    h!.p.dispose();
    first.dispose();
    memory.dispose();
    empty(first);
    empty(memory);
  }
});
it("visits multisample handles after first-null source cache disposal and preserves the source failure over secondary framebuffer cleanup", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    Object.assign(h.device.gl, {
      MAX_TEXTURE_SIZE: 20,
      TEXTURE_2D: 21,
      TEXTURE_MIN_FILTER: 22,
      TEXTURE_MAG_FILTER: 23,
      LINEAR: 24,
      TEXTURE_WRAP_S: 25,
      TEXTURE_WRAP_T: 26,
      CLAMP_TO_EDGE: 27,
      UNPACK_FLIP_Y_WEBGL: 28,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 29,
      UNPACK_COLORSPACE_CONVERSION_WEBGL: 30,
      NONE: 0,
      SRGB8_ALPHA8: 31,
      RGBA: 32,
      UNSIGNED_BYTE: 33,
      getParameter: () => 8192,
      createTexture: () => ({ id: "texture" }),
      bindTexture: () => {},
      texParameteri: () => {},
      pixelStorei: () => {},
      texImage2D: () => {},
      deleteTexture: () => {
        throw null;
      },
    });
    h.images.set("photo", { id: "photo" });
    h.sizes.set("photo", [64, 48]);
    h.private.texture("photo", "hash", true, "layer");
    const a = h.run();
    const fb = vi
      .spyOn(h.device.gl, "deleteFramebuffer")
      .mockImplementationOnce(() => {
        throw Error("secondary framebuffer");
      });
    const rb = vi.spyOn(h.device.gl, "deleteRenderbuffer");
    let failure: unknown = "unset";
    try {
      h.p.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(fb).toHaveBeenCalledTimes(1);
    expect(rb).toHaveBeenCalledTimes(1);
    expect(a.framebuffer).toBeUndefined();
    expect(a.color).toBeUndefined();
    expect(h.private.multisample).toBeUndefined();
  });
  empty(memory);
  memory.dispose();
});
