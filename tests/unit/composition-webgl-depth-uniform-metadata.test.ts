import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { WebglDepthImages } from "../../packages/renderer-core/src/composition/render/webgl-depth-image.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import type { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { CanvasImageResources } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
type Entry = { name?: string; location?: WebGLUniformLocation | null };
type State = {
  closed: boolean;
  memory?: ManagedMemory;
  locations: Map<string, WebGLUniformLocation | null>;
  entries: Map<string, Entry>;
};
type PrivateDepth = {
  program?: WebGLProgram;
  uniform(name: string): WebGLUniformLocation | null;
  uniformState: State;
  textureState: object;
};
const limits = { pixels: 65536, metadata: 1024 * 1024 };
function setup() {
  const records: unknown[] = [];
  const gl = {
    getUniformLocation: (p: unknown, name: string) => {
      records.push(["query", p, name]);
      return name === "absent" ? null : { name };
    },
    deleteProgram: () => {},
  };
  const p = new WebglDepthImages(
    { gl } as unknown as WebglDevice,
    {} as CanvasImageResources,
  );
  const privateDepth = p as unknown as PrivateDepth;
  privateDepth.program = { id: 1 } as WebGLProgram;
  return {
    records,
    gl,
    p,
    private: privateDepth,
    run: (name = "source") => privateDepth.uniform(name),
  };
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
afterEach(() => vi.restoreAllMocks());
it("admits actual uniform containers before factories and releases the earlier texture header after constructor quota denial", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1536 + 1535 });
  await withManagedMemory(memory, async () => {
    const query = vi.fn();
    expect(
      () =>
        new WebglDepthImages(
          { gl: { getUniformLocation: query } } as unknown as WebglDevice,
          {} as CanvasImageResources,
        ),
    ).toThrow(/metadata/);
    expect(query).not.toHaveBeenCalled();
    empty(memory);
  });
  memory.dispose();
});
it("preserves original lookup order, native identity, cached null and six returns in active and inactive scopes", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits);
    const work = async () => {
      const h = setup();
      for (const name of [
        "source",
        "depth",
        "offset",
        "absent",
        "source",
        "absent",
      ])
        h.records.push(["value", name, h.run(name)]);
      h.p.dispose();
      h.records.push(["size", h.private.uniformState.locations.size]);
      expect(h.records).toHaveLength(11);
      expect(
        createHash("sha256").update(JSON.stringify(h.records)).digest("hex"),
      ).toBe(
        "9a0e04111dc1662897a0be56ff0f7491e4be23f53830fe800ab43fc3fe7c57c0",
      );
    };
    if (active) await withManagedMemory(memory, work);
    else await work();
    empty(memory);
    memory.dispose();
  }
});
it("denies fresh uniform owner and Map slots before native query while retaining an earlier cached location", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const first = h.run();
    const before = memory.statistics.current.metadata;
    const blocker = memory.reserve(
      "metadata",
      limits.metadata - before - (384 + 2 * "offset".length - 1),
    );
    expect(() => h.run("offset")).toThrow(/metadata/);
    expect(h.run()).toBe(first);
    expect(h.records).toHaveLength(1);
    expect(h.private.uniformState.entries.size).toBe(1);
    blocker.release();
    expect(h.run("offset")).toBeDefined();
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("keeps actual state, returned native reference, borrowed name and Map slots admitted through cache consumers then clears all references", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const native = vi
      .spyOn(h.gl, "getUniformLocation")
      .mockImplementation((_p, name) => {
        expect(memory.statistics.current.metadata).toBe(
          3072 + 384 + 2 * name.length,
        );
        return { name };
      });
    const location = h.run();
    const state = h.private.uniformState;
    const owner = state.entries.get("source")!;
    expect(memory.owns(state)).toBe(true);
    expect(memory.owns(owner)).toBe(true);
    expect(owner.name).toBe("source");
    expect(owner.location).toBe(location);
    expect(h.run()).toBe(location);
    expect(state.entries.get("source")).toBe(owner);
    expect(native).toHaveBeenCalledTimes(1);
    h.p.dispose();
    expect(owner.name).toBeUndefined();
    expect(owner.location).toBeUndefined();
    expect(state.memory).toBeUndefined();
    expect(state.entries.size).toBe(0);
    expect(state.locations.size).toBe(0);
  });
  empty(memory);
  memory.dispose();
});
it("preserves original null query failures without an orphaned record and allows retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(h.gl, "getUniformLocation").mockImplementationOnce(() => {
      throw null;
    });
    let failure: unknown = "unset";
    try {
      h.run();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(h.private.uniformState.entries.size).toBe(0);
    expect(h.private.uniformState.locations.size).toBe(0);
    expect(memory.statistics.current.metadata).toBe(3072);
    expect(h.run()).toBeDefined();
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
it("releases actual returned native/cache references after either Map insertion fails and permits retry", async () => {
  for (const map of ["entries", "locations"] as const) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = setup();
      vi.spyOn(h.private.uniformState[map], "set").mockImplementationOnce(
        () => {
          throw null;
        },
      );
      let failure: unknown = "unset";
      try {
        h.run();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(h.private.uniformState.entries.size).toBe(0);
      expect(h.private.uniformState.locations.size).toBe(0);
      expect(memory.statistics.current.metadata).toBe(3072);
      expect(h.run()).toBeDefined();
      h.p.dispose();
    });
    empty(memory);
    memory.dispose();
  }
});
it("keeps admitted null location as an original cache hit without repeated native queries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    expect(h.run("absent")).toBeNull();
    const owner = h.private.uniformState.entries.get("absent")!;
    expect(owner.location).toBeNull();
    expect(memory.owns(owner)).toBe(true);
    expect(h.run("absent")).toBeNull();
    expect(h.private.uniformState.entries.get("absent")).toBe(owner);
    expect(h.records).toHaveLength(1);
    h.p.dispose();
    expect(owner.location).toBeUndefined();
  });
  empty(memory);
  memory.dispose();
});
it("retains real cache records through scratch and clears them after scope exit or allocator-first cleanup", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    let h: ReturnType<typeof setup> | undefined;
    let owner: Entry | undefined;
    await withManagedMemory(memory, async () => {
      memory.beginScratch();
      h = setup();
      h.run();
      owner = h.private.uniformState.entries.get("source")!;
      memory.endScratch();
      expect(memory.owns(owner)).toBe(true);
    });
    if (allocatorFirst) memory.dispose();
    h!.p.dispose();
    memory.dispose();
    expect(owner!.name).toBeUndefined();
    expect(owner!.location).toBeUndefined();
    expect(h!.private.uniformState.memory).toBeUndefined();
    expect(h!.private.uniformState.locations.size).toBe(0);
    empty(memory);
  }
});
it("rejects foreign and unmanaged active state before cache-hit or native queries", async () => {
  for (const foreign of [false, true]) {
    const first = new ManagedMemory(limits);
    let h: ReturnType<typeof setup> | undefined;
    if (foreign)
      await withManagedMemory(first, async () => {
        h = setup();
        h.run();
      });
    else {
      h = setup();
      h.run();
    }
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      expect(() => h!.run()).toThrow(/another allocator/);
      expect(() => h!.run("new")).toThrow(/another allocator/);
      expect(h!.records).toHaveLength(1);
    });
    h!.p.dispose();
    first.dispose();
    memory.dispose();
    empty(first);
    empty(memory);
  }
});
it("drops all uniform references before a later original native program deletion throws null", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.run();
    h.run("absent");
    const owners = [...h.private.uniformState.entries.values()];
    vi.spyOn(h.gl, "deleteProgram").mockImplementationOnce(() => {
      throw null;
    });
    let failure: unknown = "unset";
    try {
      h.p.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    for (const owner of owners) {
      expect(owner.name).toBeUndefined();
      expect(owner.location).toBeUndefined();
    }
    expect(h.private.uniformState.closed).toBe(true);
    expect(h.private.uniformState.locations.size).toBe(0);
    h.p.dispose();
  });
  empty(memory);
  memory.dispose();
});
