import { createHash } from "node:crypto";
export const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function depthTextureHarness() {
  let id = 0;
  const records: unknown[] = [];
  const images = new Map([
      ["photo", { id: "photo-image" }],
      ["depth", { id: "depth-image" }],
    ]),
    sizes = new Map([
      ["photo", [64, 48]],
      ["depth", [64, 48]],
    ]);
  const gl = {
    MAX_TEXTURE_SIZE: 1,
    TEXTURE_2D: 2,
    TEXTURE_MIN_FILTER: 3,
    TEXTURE_MAG_FILTER: 4,
    LINEAR: 5,
    TEXTURE_WRAP_S: 6,
    TEXTURE_WRAP_T: 7,
    CLAMP_TO_EDGE: 8,
    UNPACK_FLIP_Y_WEBGL: 9,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 10,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 11,
    NONE: 0,
    SRGB8_ALPHA8: 12,
    RGBA8: 13,
    RGBA: 14,
    UNSIGNED_BYTE: 15,
    getParameter: (v: number) => {
      records.push(["parameter", v]);
      return 8192;
    },
    createTexture: () => {
      const t = { id: ++id };
      records.push(["create", t.id]);
      return t;
    },
    deleteTexture: (t: { id: number }) => {
      records.push(["delete", t.id]);
    },
    bindTexture: (...v: unknown[]) => {
      records.push(["bind", ...v]);
    },
    texParameteri: (...v: unknown[]) => {
      records.push(["setting", ...v]);
    },
    pixelStorei: (...v: unknown[]) => {
      records.push(["pixelStore", ...v]);
    },
    texImage2D: (...v: unknown[]) => {
      records.push(["image", ...v]);
    },
  };
  return { records, images, sizes, device: { gl } };
}

import { afterEach, expect, it, vi } from "vitest";
import { WebglDepthImages } from "../../packages/renderer-core/src/composition/render/webgl-depth-image.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import type { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { CanvasImageResources } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
type Entry = {
  key?: string;
  texture?: WebGLTexture;
  memory?: ManagedMemory;
  counted: boolean;
};
type PrivateDepth = {
  texture(id: string, hash: string, color: boolean, node: string): WebGLTexture;
  textureState: {
    closed: boolean;
    memory?: ManagedMemory;
    textures: Map<string, WebGLTexture>;
    sizes: Map<string, number>;
    entries: Map<string, Entry>;
  };
  textureBytes: number;
};
const limits = { pixels: 2 * 1024 * 1024, metadata: 2 * 1024 * 1024 };
function setup() {
  const h = depthTextureHarness();
  const p = new WebglDepthImages(
    h.device as unknown as WebglDevice,
    h as unknown as CanvasImageResources,
  );
  return {
    ...h,
    p,
    private: p as unknown as PrivateDepth,
    run: (id = "photo", hash = "hash:😀", color = true) =>
      (p as unknown as PrivateDepth).texture(id, hash, color, "layer"),
  };
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("admits actual cache Maps and control before factories", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1535 });
  const h = depthTextureHarness();
  const NativeMap = Map;
  let maps = 0;
  vi.stubGlobal(
    "Map",
    class extends NativeMap {
      constructor() {
        super();
        maps++;
      }
    },
  );
  await withManagedMemory(memory, async () => {
    expect(
      () =>
        new WebglDepthImages(
          h.device as unknown as WebglDevice,
          h as unknown as CanvasImageResources,
        ),
    ).toThrow(/metadata/);
    expect(maps).toBe(0);
    expect(h.records).toEqual([]);
  });
  vi.unstubAllGlobals();
  empty(memory);
  memory.dispose();
});
it("preserves the complete original source/depth upload, repeat-hit and LRU disposal trace in managed and inactive scopes", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits);
    const work = async () => {
      const h = setup();
      const a = h.run();
      h.run("depth", "other", false);
      expect(h.run()).toBe(a);
      h.p.dispose();
      expect(h.records).toHaveLength(24);
      expect(sha(h.records)).toBe(
        "26bfe4a1246f25b60d9d0f706fcd5c4b2a108bc5a23412d0c5098b25ca36fac5",
      );
    };
    if (active) await withManagedMemory(memory, work);
    else await work();
    empty(memory);
    memory.dispose();
  }
});
it("denies actual key/native/cache entry production before template coercion or resource queries", async () => {
  const id = { length: 5, [Symbol.toPrimitive]: vi.fn(() => "photo") };
  const memory = new ManagedMemory({
    ...limits,
    metadata: 1536 + 2048 + 4 * (5 + 7) - 1,
  });
  await withManagedMemory(memory, async () => {
    const h = setup();
    const read = vi.spyOn(h.images, "get");
    expect(() => h.run(id as unknown as string)).toThrow(/metadata/);
    expect(id[Symbol.toPrimitive]).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(h.records).toEqual([]);
    expect(h.private.textureState.entries.size).toBe(0);
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("retains the actual key, Maps, entry and native owner through upload and cache hits then clears captured references", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const upload = vi
      .spyOn(h.device.gl, "texImage2D")
      .mockImplementation(() => {
        expect(memory.statistics.current.metadata).toBe(
          1536 + 2048 + 4 * (5 + 7),
        );
        expect(memory.statistics.current.pixels).toBe(64 * 48 * 4);
      });
    const texture = h.run();
    const state = h.private.textureState;
    const key = "photo:hash:😀:true";
    const owner = state.entries.get(key)!;
    expect(memory.owns(state)).toBe(true);
    expect(memory.owns(owner)).toBe(true);
    expect(memory.owns(texture)).toBe(true);
    expect(owner.key).toBe(key);
    expect(owner.texture).toBe(texture);
    expect(h.run()).toBe(texture);
    expect(state.entries.get(key)).toBe(owner);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.metadata).toBe(1536 + 2048 + 4 * (5 + 7));
    h.p.dispose();
    expect(owner.key).toBeUndefined();
    expect(owner.texture).toBeUndefined();
    expect(owner.memory).toBeUndefined();
    expect(state.entries.size).toBe(0);
    expect(state.textures.size).toBe(0);
    expect(state.sizes.size).toBe(0);
    expect(state.memory).toBeUndefined();
  });
  empty(memory);
  memory.dispose();
});
it("keeps native pixel denial ahead of texture factories and permits retry", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 64 * 48 * 4 - 1 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    expect(() => h.run()).toThrow(/pixels/);
    expect(h.records).toEqual([["parameter", 1]]);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
    expect(h.private.textureState.entries.size).toBe(0);
    h.sizes.set("photo", [16, 12]);
    expect(h.run()).toBeDefined();
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("preserves original null upload over secondary native deletion, releases partial owners and retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const upload = vi
      .spyOn(h.device.gl, "texImage2D")
      .mockImplementationOnce(() => {
        throw null;
      });
    const remove = vi
      .spyOn(h.device.gl, "deleteTexture")
      .mockImplementationOnce(() => {
        throw Error("secondary");
      });
    let failure: unknown = "unset";
    try {
      h.run();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(h.private.textureState.entries.size).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
    expect(h.run()).toBeDefined();
    expect(upload).toHaveBeenCalledTimes(2);
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("preserves original 64-entry LRU eviction, native identity and actual key retirement", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const first = h.run("photo", "0");
    const owner = h.private.textureState.entries.get("photo:0:true")!;
    h.run("photo", "1");
    const second = h.private.textureState.entries.get("photo:1:true")!;
    for (let i = 2; i < 64; i++) h.run("photo", String(i));
    expect(h.run("photo", "0")).toBe(first);
    h.run("photo", "64");
    expect(h.private.textureState.entries.size).toBe(64);
    expect(owner.texture).toBe(first);
    expect(second.key).toBeUndefined();
    expect(second.texture).toBeUndefined();
    expect(h.private.textureState.textures.has("photo:1:true")).toBe(false);
    expect(h.private.textureBytes).toBe(64 * 64 * 48 * 4);
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("preserves original source-byte-budget eviction before admitting another texture", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 128 * 1024 * 1024 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.sizes.set("photo", [4096, 8192]);
    h.run();
    const owner = h.private.textureState.entries.get("photo:hash:😀:true")!;
    expect(memory.statistics.current.pixels).toBe(128 * 1024 * 1024);
    h.sizes.set("depth", [16, 12]);
    h.run("depth", "new", false);
    expect(owner.key).toBeUndefined();
    expect(owner.texture).toBeUndefined();
    expect(memory.statistics.current.pixels).toBe(16 * 12 * 4);
    expect(h.private.textureBytes).toBe(16 * 12 * 4);
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("retires an eviction whose native deletion throws null and permits clean retry", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 128 * 1024 * 1024 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.sizes.set("photo", [4096, 8192]);
    h.run();
    const owner = h.private.textureState.entries.get("photo:hash:😀:true")!;
    h.sizes.set("depth", [16, 12]);
    vi.spyOn(h.device.gl, "deleteTexture").mockImplementationOnce(() => {
      throw null;
    });
    let failure: unknown = "unset";
    try {
      h.run("depth", "new", false);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(owner.key).toBeUndefined();
    expect(owner.texture).toBeUndefined();
    expect(h.private.textureBytes).toBe(0);
    expect(h.private.textureState.entries.size).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
    expect(h.run("depth", "new", false)).toBeDefined();
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("visits all actual cache entries despite first-null disposal and drops all native/key/Map references", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.run();
    h.run("depth", "other", false);
    const owners = [...h.private.textureState.entries.values()];
    const remove = vi
      .spyOn(h.device.gl, "deleteTexture")
      .mockImplementationOnce(() => {
        throw null;
      });
    let failure: unknown = "unset";
    try {
      h.p.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(remove).toHaveBeenCalledTimes(2);
    for (const owner of owners) {
      expect(owner.key).toBeUndefined();
      expect(owner.texture).toBeUndefined();
      expect(owner.memory).toBeUndefined();
    }
    expect(h.private.textureState.closed).toBe(true);
    expect(h.private.textureState.textures.size).toBe(0);
    expect(h.private.textureBytes).toBe(0);
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("keeps actual cache through scratch retirement and releases native storage once after scope exit or allocator-first disposal", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    let h: ReturnType<typeof setup> | undefined;
    let owner: Entry | undefined;
    await withManagedMemory(memory, async () => {
      memory.beginScratch();
      h = setup();
      h.run();
      owner = h.private.textureState.entries.get("photo:hash:😀:true")!;
      memory.endScratch();
      expect(memory.owns(owner)).toBe(true);
      expect(memory.owns(owner.texture!)).toBe(true);
    });
    if (allocatorFirst) memory.dispose();
    h!.p.dispose();
    memory.dispose();
    expect(
      h!.records.filter((x) => (x as unknown[])[0] === "delete"),
    ).toHaveLength(1);
    expect(owner!.texture).toBeUndefined();
    expect(owner!.key).toBeUndefined();
    expect(owner!.memory).toBeUndefined();
    empty(memory);
  }
});
it("rejects foreign and unmanaged active cache state before key coercion and native producers", async () => {
  for (const foreign of [false, true]) {
    const first = new ManagedMemory(limits);
    let h: ReturnType<typeof setup> | undefined;
    if (foreign)
      await withManagedMemory(first, async () => {
        h = setup();
      });
    else h = setup();
    const memory = new ManagedMemory(limits);
    const id = { length: 5, [Symbol.toPrimitive]: vi.fn(() => "photo") };
    await withManagedMemory(memory, async () => {
      expect(() => h!.run(id as unknown as string)).toThrow(
        /another allocator/,
      );
      expect(id[Symbol.toPrimitive]).not.toHaveBeenCalled();
      expect(h!.records).toEqual([]);
    });
    h!.p.dispose();
    first.dispose();
    memory.dispose();
    empty(first);
    empty(memory);
  }
});

it("releases actual uploaded texture and partial cache references after either original Map insert throws null", async () => {
  for (const map of ["textures", "sizes"] as const) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = setup();
      const write = vi
        .spyOn(h.private.textureState[map], "set")
        .mockImplementationOnce(() => {
          throw null;
        });
      const remove = vi
        .spyOn(h.device.gl, "deleteTexture")
        .mockImplementationOnce(() => {
          throw Error("secondary deletion");
        });
      let failure: unknown = "unset";
      try {
        h.run();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(remove).toHaveBeenCalledTimes(1);
      expect(h.private.textureState.entries.size).toBe(0);
      expect(h.private.textureState.textures.size).toBe(0);
      expect(h.private.textureState.sizes.size).toBe(0);
      expect(h.private.textureBytes).toBe(0);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
      expect(h.run()).toBeDefined();
      expect(write).toHaveBeenCalledTimes(2);
      h.p.dispose();
    });
    empty(memory);
    memory.dispose();
  }
});
it("releases working key records after original coercion, resource query and native creation failures then permits retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const id = {
      length: 5,
      [Symbol.toPrimitive]: () => {
        throw null;
      },
    };
    const operations = [
      () => h.run(id as unknown as string),
      () => {
        vi.spyOn(h.images, "get").mockImplementationOnce(() => {
          throw null;
        });
        return h.run();
      },
      () => {
        vi.spyOn(h.device.gl, "getParameter").mockImplementationOnce(() => {
          throw null;
        });
        return h.run();
      },
      () => {
        vi.spyOn(h.device.gl, "createTexture").mockReturnValueOnce(
          null as never,
        );
        return h.run();
      },
    ];
    for (const operation of operations) {
      let failed = false;
      try {
        operation();
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      expect(h.private.textureState.entries.size).toBe(0);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1536 });
    }
    expect(h.run()).toBeDefined();
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
