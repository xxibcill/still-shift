import { afterEach, expect, it, vi } from "vitest";
import { WebglDepthImages } from "../../packages/renderer-core/src/composition/render/webgl-depth-image.ts";
import {
  depthSoftwareRenderer,
  depthProgramDiagnostic,
} from "../../packages/renderer-core/src/composition/render/webgl-depth-text.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import type { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { CanvasImageResources } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { createHash } from "node:crypto";
export const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function depthTextHarness(software = true) {
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

const textBound = 1024,
  diagnosticBound = 1024;
const limits = {
  pixels: 16 * 1024 * 1024,
  metadata: diagnosticBound + 128 * 1024,
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function renderer(value: unknown = "Google SwiftShader", available = true) {
  const gl = {
    getExtension: vi.fn(() =>
      available ? { UNMASKED_RENDERER_WEBGL: 37446 } : null,
    ),
    getParameter: vi.fn(() => value),
  };
  return { gl, native: gl as unknown as WebGL2RenderingContext };
}
function diagnostic(log: string | null = "original native log") {
  const gl = {
    getShaderInfoLog: vi.fn(() => log),
    getProgramInfoLog: vi.fn(() => log),
  };
  return { gl, native: gl as unknown as WebGL2RenderingContext };
}
function records(memory: ManagedMemory) {
  return [
    ...(
      memory as unknown as {
        resources: Map<
          object,
          { value: { log?: string | null; error?: Error } }
        >;
      }
    ).resources.values(),
  ].map((x) => x.value);
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("preserves complete original software and hardware initialization/reuse/native disposal traces and all uploaded mesh bytes", async () => {
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
        const h = depthTextHarness(software);
        const p = new WebglDepthImages(
          h.device as unknown as WebglDevice,
          {} as CanvasImageResources,
        );
        const native = p as unknown as { initialize(): void };
        native.initialize();
        native.initialize();
        p.dispose();
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
it("preserves original renderer native calls, case-sensitive software predicate and absent extension in active and inactive scopes", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits);
    const work = async () => {
      for (const [value, expected] of [
        ["Google SwiftShader", true],
        ["Hardware GPU", false],
        ["swiftshader", false],
      ] as const) {
        const h = renderer(value);
        expect(depthSoftwareRenderer(h.native)).toBe(expected);
        expect(h.gl.getExtension).toHaveBeenCalledExactlyOnceWith(
          "WEBGL_debug_renderer_info",
        );
        expect(h.gl.getParameter).toHaveBeenCalledExactlyOnceWith(37446);
      }
      const h = renderer("", false);
      expect(depthSoftwareRenderer(h.native)).toBeNull();
      expect(h.gl.getParameter).not.toHaveBeenCalled();
    };
    if (active) await withManagedMemory(memory, work);
    else await work();
    empty(memory);
    memory.dispose();
  }
});
it("admits actual extension/probe/RegExp controls before the original extension query", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 1023 });
  await withManagedMemory(memory, async () => {
    const h = renderer();
    expect(() => depthSoftwareRenderer(h.native)).toThrow(/metadata/);
    expect(h.gl.getExtension).not.toHaveBeenCalled();
    expect(h.gl.getParameter).not.toHaveBeenCalled();
    empty(memory);
  });
  memory.dispose();
});
it("admits renderer text controls before query and conversion", async () => {
  const memory = new ManagedMemory({
    ...limits,
    metadata: 1024 + textBound - 1,
  });
  await withManagedMemory(memory, async () => {
    const h = renderer();
    expect(() => depthSoftwareRenderer(h.native)).toThrow(/metadata/);
    expect(h.gl.getExtension).toHaveBeenCalledTimes(1);
    expect(h.gl.getParameter).not.toHaveBeenCalled();
    empty(memory);
  });
  memory.dispose();
});
it("holds exact original renderer string through predicate and releases text/probe after original consumer", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = renderer('Renderer "😀 SwiftShader');
    h.gl.getParameter.mockImplementation(() => {
      expect(memory.statistics.current.metadata).toBe(textBound + 1024);
      return 'Renderer "😀 SwiftShader';
    });
    expect(depthSoftwareRenderer(h.native)).toBe(true);
    expect(memory.statistics.peak.metadata).toBe(
      textBound + 1024 + 2 * 'Renderer "😀 SwiftShader'.length,
    );
    empty(memory);
  });
  memory.dispose();
});
it("cleans actual renderer probe and text after extension, query and original String conversion null failures", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    for (const kind of ["extension", "query", "conversion"]) {
      const h = renderer();
      if (kind === "extension")
        h.gl.getExtension.mockImplementationOnce(() => {
          throw null;
        });
      else if (kind === "query")
        h.gl.getParameter.mockImplementationOnce(() => {
          throw null;
        });
      else
        h.gl.getParameter.mockReturnValueOnce({
          [Symbol.toPrimitive]: () => {
            throw null;
          },
        } as never);
      let failure: unknown = "unset";
      try {
        depthSoftwareRenderer(h.native);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      empty(memory);
      expect(depthSoftwareRenderer(renderer().native)).toBe(true);
    }
  });
  memory.dispose();
});
it("admits diagnostic controls before native diagnostic query", async () => {
  for (const shader of [false, true]) {
    const memory = new ManagedMemory({
      ...limits,
      metadata: diagnosticBound - 1,
    });
    await withManagedMemory(memory, async () => {
      const h = diagnostic();
      expect(() => depthProgramDiagnostic(h.native, {}, shader)).toThrow(
        /metadata/,
      );
      expect(h.gl.getShaderInfoLog).not.toHaveBeenCalled();
      expect(h.gl.getProgramInfoLog).not.toHaveBeenCalled();
      empty(memory);
    });
    memory.dispose();
  }
});
it("preserves original complete diagnostic/fallback/empty text and retains the actual propagated Error owner until cleanup", async () => {
  for (const [shader, log, expected] of [
    [true, "original shader log", "original shader log"],
    [false, "original program log", "original program log"],
    [true, null, "Depth shader compilation failed"],
    [false, null, "Depth shader link failed"],
    [true, "", ""],
  ] as const) {
    const memory = new ManagedMemory(limits);
    let owner: ReturnType<typeof records>[number] | undefined;
    await withManagedMemory(memory, async () => {
      const h = diagnostic(log);
      const error = depthProgramDiagnostic(h.native, {}, shader);
      expect(error.message).toBe(expected);
      expect(h.gl.getShaderInfoLog).toHaveBeenCalledTimes(shader ? 1 : 0);
      expect(h.gl.getProgramInfoLog).toHaveBeenCalledTimes(shader ? 0 : 1);
      owner = records(memory).find((x) => x.error === error);
      expect(owner).toBeDefined();
      expect(memory.owns(owner!)).toBe(true);
      expect(owner!.log).toBeUndefined();
      expect(memory.statistics.current.metadata).toBe(
        512 + 2 * expected.length,
      );
      expect(memory.statistics.peak.metadata).toBe(
        diagnosticBound + 4 * (log?.length ?? 32),
      );
    });
    memory.dispose();
    expect(owner!.error).toBeUndefined();
    expect(owner!.log).toBeUndefined();
    empty(memory);
  }
});
it("keeps actual propagated diagnostic Error through scratch retirement and drops actual references after scope exit", async () => {
  const memory = new ManagedMemory(limits);
  let owner: ReturnType<typeof records>[number] | undefined;
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    const error = depthProgramDiagnostic(diagnostic().native, {}, true);
    owner = records(memory).find((x) => x.error === error);
    memory.endScratch();
    expect(memory.owns(owner!)).toBe(true);
    expect(owner!.error).toBe(error);
  });
  memory.dispose();
  expect(owner!.error).toBeUndefined();
  empty(memory);
});
it("preserves native diagnostic getter null and cleans its original working owner before retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = diagnostic();
    h.gl.getShaderInfoLog.mockImplementationOnce(() => {
      throw null;
    });
    let failure: unknown = "unset";
    try {
      depthProgramDiagnostic(h.native, {}, true);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    empty(memory);
    expect(depthProgramDiagnostic(h.native, {}, true).message).toBe(
      "original native log",
    );
  });
  memory.dispose();
  empty(memory);
});
it("cleans the admitted native log when original Error construction throws null", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const h = diagnostic();
    vi.stubGlobal("Error", function () {
      throw null;
    });
    let failure: unknown = "unset";
    try {
      depthProgramDiagnostic(h.native, {}, true);
    } catch (error) {
      failure = error;
    } finally {
      vi.unstubAllGlobals();
    }
    expect(failure).toBeNull();
    empty(memory);
    expect(depthProgramDiagnostic(h.native, {}, true).message).toBe(
      "original native log",
    );
  });
  memory.dispose();
  empty(memory);
});
it("retains actual diagnostic Error through original shader/link rejection and native cleanup then releases it after its consumer", async () => {
  for (const shader of [true, false]) {
    const memory = new ManagedMemory(limits);
    await withManagedMemory(memory, async () => {
      const h = depthTextHarness();
      Object.assign(h.gl, {
        getShaderInfoLog: () => "original shader log",
        getProgramInfoLog: () => "original program log",
      });
      if (shader) vi.spyOn(h.gl, "getShaderParameter").mockReturnValue(false);
      else vi.spyOn(h.gl, "getProgramParameter").mockReturnValue(false);
      const p = new WebglDepthImages(
        h.device as unknown as WebglDevice,
        {} as CanvasImageResources,
      );
      let failure: unknown;
      try {
        (p as unknown as { initialize(): void }).initialize();
      } catch (error) {
        failure = error;
      }
      expect((failure as Error).message).toBe(
        shader ? "original shader log" : "original program log",
      );
      const owner = records(memory).find((x) => x.error === failure)!;
      expect(memory.owns(owner)).toBe(true);
      p.dispose();
      expect(owner.error).toBe(failure);
      expect(memory.statistics.current.metadata).toBe(
        512 + 2 * (failure as Error).message.length,
      );
    });
    memory.dispose();
    empty(memory);
  }
});

it("rejects oversized returned renderer text and native logs without retaining owners", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 4096 });
  await withManagedMemory(memory, async () => {
    const h = renderer("x".repeat(4096));
    expect(() => depthSoftwareRenderer(h.native)).toThrow(/metadata/);
    expect(h.gl.getParameter).toHaveBeenCalledTimes(1);
    empty(memory);
    const d = diagnostic("x".repeat(4096));
    expect(() => depthProgramDiagnostic(d.native, {}, true)).toThrow(
      /metadata/,
    );
    expect(d.gl.getShaderInfoLog).toHaveBeenCalledTimes(1);
    empty(memory);
  });
  memory.dispose();
});
