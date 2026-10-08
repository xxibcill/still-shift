import { afterEach, expect, it, vi } from "vitest";
import { WebglDepthImages } from "../../packages/renderer-core/src/composition/render/webgl-depth-image.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import type { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { CanvasImageResources } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { createHash } from "node:crypto";
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function depthTextHarness(software = true) {
  let id = 0;
  const records: unknown[] = [];
  const gl: Record<string, unknown> = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    ELEMENT_ARRAY_BUFFER: 6,
    STATIC_DRAW: 7,
    FLOAT: 8,
  };
  const call = (name: string, ...v: unknown[]) => {
    records.push([name, ...v]);
  };
  gl.getExtension = (name: string) => {
    call("extension", name);
    return { UNMASKED_RENDERER_WEBGL: 37446 };
  };
  gl.getParameter = (name: number) => {
    call("parameter", name);
    return software ? "Google SwiftShader" : "Hardware GPU";
  };
  for (const name of ["createProgram", "createVertexArray", "createBuffer"])
    gl[name] = () => {
      const v = { id: ++id };
      call(name, v.id);
      return v;
    };
  gl.createShader = (type: number) => {
    const v = { id: ++id };
    call("createShader", type, v.id);
    return v;
  };
  gl.shaderSource = (v: unknown, code: string) => {
    call("shaderSource", v, code.length, sha(code));
  };
  for (const name of [
    "compileShader",
    "attachShader",
    "linkProgram",
    "bindVertexArray",
    "bindBuffer",
    "enableVertexAttribArray",
    "vertexAttribPointer",
    "deleteShader",
    "deleteProgram",
    "deleteVertexArray",
    "deleteBuffer",
  ])
    gl[name] = (...v: unknown[]) => {
      call(name, ...v);
    };
  gl.getShaderParameter = (...v: unknown[]) => {
    call("shaderStatus", ...v);
    return true;
  };
  gl.getProgramParameter = (...v: unknown[]) => {
    call("programStatus", ...v);
    return true;
  };
  gl.bufferData = (target: number, view: ArrayBufferView, usage: number) => {
    call(
      "bufferData",
      target,
      view.byteLength,
      createHash("sha256")
        .update(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
        .digest("hex"),
      usage,
    );
  };
  return {
    records,
    gl: gl as unknown as WebGL2RenderingContext,
    device: { gl: gl as unknown as WebGL2RenderingContext },
  };
}

const limits = { pixels: 16 * 1024 * 1024, metadata: 4 * 2 ** 29 + 128 * 1024 };
type Work = {
  shaders: (WebGLShader | null)[];
  codes?: [number, string][];
  grid?: object;
  expanded?: object;
  vertices?: Float32Array;
  indices?: Uint16Array;
};
type Owner = {
  gl?: WebGL2RenderingContext;
  memory?: ManagedMemory;
  program?: WebGLProgram;
  vao?: WebGLVertexArrayObject;
  vertex?: WebGLBuffer;
  index?: WebGLBuffer;
};
function values(memory: ManagedMemory) {
  return [
    ...(
      memory as unknown as { resources: Map<object, { value: object }> }
    ).resources.values(),
  ].map((x) => x.value);
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function setup(software = true) {
  const h = depthTextHarness(software);
  const p = new WebglDepthImages(
    h.device as unknown as WebglDevice,
    {} as CanvasImageResources,
  );
  return {
    ...h,
    p,
    native: p as unknown as {
      initialize(): void;
      nativeProgram?: Owner;
      program?: WebGLProgram;
      vao?: WebGLVertexArrayObject;
      vertex?: WebGLBuffer;
      index?: WebGLBuffer;
      count: number;
    },
  };
}
afterEach(() => vi.restoreAllMocks());
it("preserves both complete original software/hardware initialization/reuse/disposal traces and all shader/mesh bytes", async () => {
  for (const [software, calls, hash] of [
    [
      true,
      31,
      "09a8e8e324ca07f1501bc46362e0c3512b00adba4da1cd0acecfd107647ec189",
    ],
    [
      false,
      37,
      "5304a7e04f029e51947175f13272ba7ba74b4861c8c074ceb61ffa53510fae7a",
    ],
  ] as const) {
    for (const active of [false, true]) {
      const memory = new ManagedMemory(limits);
      const work = async () => {
        const h = setup(software);
        h.native.initialize();
        h.native.initialize();
        h.p.dispose();
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
it("rejects the working shader array/tuple factory before any native program producer", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 3072 + 4095 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(h.gl, "getExtension").mockReturnValue(null);
    const create = vi.spyOn(h.gl, "createProgram");
    expect(() => h.native.initialize()).toThrow(/metadata/);
    expect(create).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(3072);
    h.p.dispose();
    empty(memory);
  });
  memory.dispose();
});
it("rejects retained native control factory before program creation and retires admitted working arrays", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 3072 + 4096 + 2047 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(h.gl, "getExtension").mockReturnValue(null);
    const create = vi.spyOn(h.gl, "createProgram");
    expect(() => h.native.initialize()).toThrow(/metadata/);
    expect(create).not.toHaveBeenCalled();
    expect(h.native.nativeProgram).toBeUndefined();
    expect(memory.statistics.current.metadata).toBe(3072);
    h.p.dispose();
    empty(memory);
  });
  memory.dispose();
});
it("owns actual working shaders/tuples and returned native controls before producers then clears consumed working references", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    let work: Work | undefined,
      rows: [number, string][] | undefined,
      shaders: (WebGLShader | null)[] | undefined,
      owner: Owner | undefined;
    const create = h.gl.createProgram.bind(h.gl);
    vi.spyOn(h.gl, "createProgram").mockImplementation(() => {
      expect(memory.statistics.current.metadata).toBe(3072 + 4096 + 2048);
      work = values(memory).find((x) =>
        Array.isArray((x as Work).shaders),
      ) as Work;
      owner = h.native.nativeProgram;
      expect(memory.owns(work!)).toBe(true);
      expect(memory.owns(owner!)).toBe(true);
      shaders = work!.shaders;
      return create();
    });
    const source = h.gl.shaderSource.bind(h.gl);
    vi.spyOn(h.gl, "shaderSource").mockImplementation((shader, code) => {
      rows = work!.codes;
      expect(rows).toHaveLength(2);
      expect(shaders).toContain(shader);
      expect(rows!.some((x) => x[1] === code)).toBe(true);
      source(shader, code);
    });
    h.native.initialize();
    expect(shaders).toHaveLength(0);
    expect(rows).toHaveLength(0);
    expect(work!.codes).toBeUndefined();
    expect(work!.grid).toBeUndefined();
    expect(work!.vertices).toBeUndefined();
    expect(memory.owns(work!)).toBe(false);
    expect(owner!.program).toBe(h.native.program);
    expect(owner!.vertex).toBe(h.native.vertex);
    expect(owner!.index).toBe(h.native.index);
    expect(memory.statistics.current.metadata).toBe(3072 + 2048);
    expect(memory.statistics.current.pixels).toBe(150672 + 110592);
    h.p.dispose();
    expect(owner!.gl).toBeUndefined();
    expect(owner!.memory).toBeUndefined();
    expect(owner!.program).toBeUndefined();
    empty(memory);
  });
  memory.dispose();
});
it("retains native controls and original buffers across scratch/scope exit and destroys them once outside the scope", async () => {
  const memory = new ManagedMemory(limits);
  let h: ReturnType<typeof setup> | undefined, owner: Owner | undefined;
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    h = setup();
    h.native.initialize();
    owner = h.native.nativeProgram;
    memory.endScratch();
    expect(memory.owns(owner!)).toBe(true);
    expect(memory.statistics.current).toEqual({
      pixels: 261264,
      metadata: 5120,
    });
  });
  h!.p.dispose();
  expect(owner!.program).toBeUndefined();
  expect(
    (h!.records as unknown[][]).filter((x) => x[0] === "deleteBuffer"),
  ).toHaveLength(2);
  h!.p.dispose();
  memory.dispose();
  empty(memory);
});
it("allocator-first retirement clears raw class/native references and skips already retired pixel handles", async () => {
  const memory = new ManagedMemory(limits);
  let h: ReturnType<typeof setup> | undefined, owner: Owner | undefined;
  await withManagedMemory(memory, async () => {
    h = setup();
    h.native.initialize();
    owner = h.native.nativeProgram;
  });
  memory.dispose();
  const before = sha(h!.records);
  expect(h!.native.nativeProgram).toBeUndefined();
  expect(h!.native.program).toBeUndefined();
  expect(owner!.program).toBeUndefined();
  h!.p.dispose();
  expect(sha(h!.records)).toBe(before);
  expect(
    (h!.records as unknown[][]).filter((x) => x[0] === "deleteBuffer"),
  ).toHaveLength(2);
  empty(memory);
});
it("preserves original program factory null failure and allows retry without orphan working/native owners", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(h.gl, "createProgram").mockImplementationOnce(() => {
      throw null;
    });
    expect(() => h.native.initialize()).toThrow();
    expect(h.native.nativeProgram).toBeUndefined();
    expect(memory.statistics.current.metadata).toBe(3072);
    h.native.initialize();
    h.p.dispose();
    empty(memory);
  });
  memory.dispose();
});
it("visits all captured shaders and native controls after shader-source null despite secondary deletion failures then retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    vi.spyOn(h.gl, "shaderSource").mockImplementationOnce(() => {
      throw null;
    });
    const program = h.gl.deleteProgram.bind(h.gl),
      shader = h.gl.deleteShader.bind(h.gl);
    vi.spyOn(h.gl, "deleteProgram").mockImplementationOnce((v) => {
      program(v);
      throw Error("secondary program");
    });
    vi.spyOn(h.gl, "deleteShader").mockImplementationOnce((v) => {
      shader(v);
      throw Error("secondary shader");
    });
    let failure: unknown = "unset";
    try {
      h.native.initialize();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(h.native.program).toBeUndefined();
    expect(h.native.nativeProgram).toBeUndefined();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    expect(
      (h.records as unknown[][]).filter((x) => x[0] === "deleteShader"),
    ).toHaveLength(1);
    h.native.initialize();
    h.p.dispose();
    empty(memory);
  });
  memory.dispose();
});
it("preserves first vertex submission null over program/buffer/VAO/shader cleanup and retires all captured CPU backing stores", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(false);
    let view: ArrayBufferView | undefined;
    vi.spyOn(h.gl, "bufferData").mockImplementationOnce((_target, source) => {
      view = source as ArrayBufferView;
      throw null;
    });
    for (const key of [
      "deleteProgram",
      "deleteBuffer",
      "deleteVertexArray",
      "deleteShader",
    ] as const) {
      const original = h.gl[key].bind(h.gl);
      vi.spyOn(h.gl, key).mockImplementation((v: unknown) => {
        original(v as never);
        throw Error("secondary " + key);
      });
    }
    let failure: unknown = "unset";
    try {
      h.native.initialize();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(view!.buffer.byteLength).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    expect(h.native.nativeProgram).toBeUndefined();
    expect(
      (h.records as unknown[][]).filter((x) => x[0] === "deleteShader"),
    ).toHaveLength(2);
    expect(
      (h.records as unknown[][]).filter((x) => x[0] === "deleteBuffer"),
    ).toHaveLength(1);
    vi.restoreAllMocks();
    h.native.initialize();
    h.p.dispose();
    empty(memory);
  });
  memory.dispose();
});
it("cleans partial index factory failure and earlier native vertex/VAO/program then retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const original = h.gl.createBuffer.bind(h.gl);
    vi.spyOn(h.gl, "createBuffer")
      .mockImplementationOnce(original)
      .mockImplementationOnce(() => {
        throw null;
      });
    expect(() => h.native.initialize()).toThrow();
    expect(h.native.vertex).toBeUndefined();
    expect(h.native.vao).toBeUndefined();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    expect(
      (h.records as unknown[][]).filter((x) => x[0] === "deleteBuffer"),
    ).toHaveLength(1);
    h.native.initialize();
    h.p.dispose();
    empty(memory);
  });
  memory.dispose();
});
it("visits both shaders when successful shader retirement throws null and releases unreturned native controls", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    const original = h.gl.deleteShader.bind(h.gl);
    vi.spyOn(h.gl, "deleteShader").mockImplementationOnce((v) => {
      original(v as never);
      throw null;
    });
    let failure: unknown = "unset";
    try {
      h.native.initialize();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(
      (h.records as unknown[][]).filter((x) => x[0] === "deleteShader"),
    ).toHaveLength(2);
    expect(h.native.nativeProgram).toBeUndefined();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    h.native.initialize();
    h.p.dispose();
    empty(memory);
  });
  memory.dispose();
});
it("disposal visits original vertex/index/VAO/program order despite each native deletion failing and never retries retired handles", async () => {
  const memory = new ManagedMemory(limits);
  let h: ReturnType<typeof setup> | undefined;
  await withManagedMemory(memory, async () => {
    h = setup();
    h.native.initialize();
  });
  for (const key of [
    "deleteBuffer",
    "deleteVertexArray",
    "deleteProgram",
  ] as const) {
    const original = h!.gl[key].bind(h!.gl);
    vi.spyOn(h!.gl, key).mockImplementation((v: unknown) => {
      original(v as never);
      throw key === "deleteBuffer" ? null : Error("secondary");
    });
  }
  const before = h!.records.length;
  let failure: unknown = "unset";
  try {
    h!.p.dispose();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeNull();
  expect((h!.records as unknown[][]).slice(before).map((x) => x[0])).toEqual([
    "deleteBuffer",
    "deleteBuffer",
    "deleteVertexArray",
    "deleteProgram",
  ]);
  empty(memory);
  const after = sha(h!.records);
  h!.p.dispose();
  memory.dispose();
  expect(sha(h!.records)).toBe(after);
});
it("preserves first source retirement null while still visiting uniform/native controls and clearing raw refs", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup();
    h.native.initialize();
    const original = (
      h.p as unknown as { clearTextures: (state: unknown) => void }
    ).clearTextures.bind(h.p);
    vi.spyOn(
      h.p as unknown as { clearTextures: (state: unknown) => void },
      "clearTextures",
    ).mockImplementationOnce((state) => {
      original(state);
      throw null;
    });
    let failure: unknown = "unset";
    try {
      h.p.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(h.native.program).toBeUndefined();
    empty(memory);
  });
  memory.dispose();
});
it("rejects foreign and disposed owners before cached initialization or any new native probe", async () => {
  const memory = new ManagedMemory(limits),
    foreign = new ManagedMemory(limits);
  let h: ReturnType<typeof setup> | undefined;
  await withManagedMemory(memory, async () => {
    h = setup();
    h.native.initialize();
  });
  const before = sha(h!.records);
  await withManagedMemory(foreign, async () => {
    expect(() => h!.native.initialize()).toThrow(/another allocator/);
  });
  expect(sha(h!.records)).toBe(before);
  h!.p.dispose();
  await withManagedMemory(memory, async () => {
    expect(() => h!.native.initialize()).toThrow(/disposed/);
  });
  expect(sha(h!.records)).not.toBe(before);
  empty(memory);
  empty(foreign);
  memory.dispose();
  foreign.dispose();
});
it("cleans program/VAO/shaders after grid pixel admission fails before any buffer factory", async () => {
  const memory = new ManagedMemory({ ...limits, pixels: 1 });
  await withManagedMemory(memory, async () => {
    const h = setup();
    const create = vi.spyOn(h.gl, "createBuffer");
    expect(() => h.native.initialize()).toThrow(/pixels/);
    expect(create).not.toHaveBeenCalled();
    expect(h.native.nativeProgram).toBeUndefined();
    expect(
      (h.records as unknown[][]).filter((x) => x[0] === "deleteShader"),
    ).toHaveLength(2);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    h.p.dispose();
    empty(memory);
  });
  memory.dispose();
});
it("preserves CPU retirement null while visiting every grid backing/result and native handle then retries", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = setup(false);
    const original = memory.release.bind(memory);
    let failed = false;
    vi.spyOn(memory, "release").mockImplementation((value) => {
      const first =
        !failed && value instanceof ArrayBuffer && value.byteLength === 3538944;
      original(value);
      if (first) {
        failed = true;
        throw null;
      }
    });
    let failure: unknown = "unset";
    try {
      h.native.initialize();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(failed).toBe(true);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 3072 });
    expect(h.native.nativeProgram).toBeUndefined();
    vi.restoreAllMocks();
    h.native.initialize();
    h.p.dispose();
    empty(memory);
  });
  memory.dispose();
});
it("skips both independently retired native buffers and still drops actual retained handle controls", async () => {
  const memory = new ManagedMemory(limits);
  let h: ReturnType<typeof setup> | undefined;
  await withManagedMemory(memory, async () => {
    h = setup();
    h.native.initialize();
    memory.release(h.native.vertex!);
    memory.release(h.native.index!);
    expect(memory.statistics.current.pixels).toBe(0);
  });
  h!.p.dispose();
  expect(
    (h!.records as unknown[][]).filter((x) => x[0] === "deleteBuffer"),
  ).toHaveLength(2);
  expect(h!.native.nativeProgram).toBeUndefined();
  empty(memory);
  memory.dispose();
});
