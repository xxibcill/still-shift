import { expect, it, vi } from "vitest";
import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";

const body = "void main() { pixel=vec4(0.0); }";
const limits = { pixels: 65536, metadata: 1024 * 1024 };
function setup() {
  const native = fakeWebglDevice();
  const device = new WebglDevice(native.canvas);
  return { ...native, device };
}
function programs(device: WebglDevice) {
  return (
    device as unknown as {
      programs: Map<
        string,
        {
          handle: WebGLProgram;
          uniforms: Map<string, WebGLUniformLocation>;
          lifetime?: object;
        }
      >;
    }
  ).programs;
}

it("admits source text and native controls before original replacement or shader creation", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    const surface = device.surface(2, 2, false, true, true);
    const before = memory.statistics.current;
    const blocker = memory.reserve(
      "metadata",
      limits.metadata - (before.metadata - 384) - (4096 + 12 * body.length - 1),
    );
    const replace = vi.spyOn(String.prototype, "replaceAll");
    expect(() => device.pass(body, surface, [])).toThrow("metadata");
    expect(replace).not.toHaveBeenCalled();
    expect(gl.createShader).not.toHaveBeenCalled();
    expect(gl.createProgram).not.toHaveBeenCalled();
    replace.mockRestore();
    blocker.release();
    // Original screen-pass invalidation precedes shader-source production.
    expect(memory.statistics.current.metadata).toBe(before.metadata - 384);
    device.dispose();
    memory.dispose();
  });
});

it("preserves original screen-coordinate and opaque shader bytes and native compile/link/draw order", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    const surface = device.surface(2, 2, false, true, true);
    device.pass(
      "void main() { pixel=vec4(gl_FragCoord.xy,0.0,1.0); }",
      surface,
      [],
    );
    const sources = gl.shaderSource.mock.calls as unknown as [
      unknown,
      string,
    ][];
    expect(sources[0]![1]).toContain("uv = vec2(p.x, 1.0-p.y);");
    expect(sources[1]![1]).toContain(
      "vec4 pixelPosition;\nvoid shade() { pixel=vec4(pixelPosition.xy,0.0,1.0); }\nvoid main() { pixelPosition=vec4(gl_FragCoord.x,2.0-gl_FragCoord.y,gl_FragCoord.zw); shade(); pixel.a=1.0; }",
    );
    expect(gl.createShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.linkProgram.mock.invocationCallOrder[0]).toBeLessThan(
      gl.deleteShader.mock.invocationCallOrder[0]!,
    );
    expect(gl.deleteShader.mock.invocationCallOrder[1]).toBeLessThan(
      gl.drawArrays.mock.invocationCallOrder[0]!,
    );
    expect(device.passes).toBe(1);
    device.dispose();
    memory.dispose();
  });
});

it("retains actual canonical cache key, native program and uniform Map through scratch and original cache hits", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    gl.getProgramParameter.mockImplementation((_handle, name) =>
      name === gl.LINK_STATUS ? true : 2,
    );
    memory.beginScratch();
    device.pass(body, null, [], { gain: 2 });
    const program = programs(device).get(body)!;
    expect(memory.owns(program.lifetime!)).toBe(true);
    expect(program.uniforms.size).toBe(2);
    expect(program.uniforms.get("gain")).toBe(
      gl.getUniformLocation.mock.results[1]!.value,
    );
    const before = memory.statistics.current.metadata;
    memory.endScratch();
    device.pass(body, null, [], { gain: 3 });
    expect(programs(device).get(body)).toBe(program);
    expect(memory.statistics.current.metadata).toBe(before);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.createShader).toHaveBeenCalledTimes(2);
    expect(gl.uniform1f.mock.calls[1]![1]).toBe(3);
    device.dispose();
    expect(program.uniforms.size).toBe(0);
    expect(program.lifetime).toBeUndefined();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("admits native active-info/name/location/Map entry before the original query and preserves prior cached owner on denial", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    device.pass(body, null, []);
    const prior = programs(device).get(body)!;
    const before = memory.statistics.current;
    const next = body + "\n// next";
    gl.getProgramParameter.mockImplementation((_handle, name) =>
      name === gl.LINK_STATUS ? true : 1,
    );
    const blocker = memory.reserve(
      "metadata",
      limits.metadata - before.metadata - (4096 + 12 * next.length) - 1023,
    );
    expect(() => device.pass(next, null, [])).toThrow("metadata");
    expect(gl.getActiveUniform).not.toHaveBeenCalled();
    expect(gl.getUniformLocation).not.toHaveBeenCalled();
    expect(programs(device).size).toBe(1);
    expect(programs(device).get(body)).toBe(prior);
    expect(memory.owns(prior.lifetime!)).toBe(true);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    blocker.release();
    expect(memory.statistics.current).toEqual(before);
    device.dispose();
    memory.dispose();
  });
});

it("cleans every incomplete original shader and preserves original null over a secondary native destructor failure", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    let sources = 0;
    gl.shaderSource.mockImplementation(() => {
      if (++sources === 2) throw null;
    });
    gl.deleteShader.mockImplementationOnce(() => {
      throw Error("secondary cleanup");
    });
    let caught: unknown = "missing";
    try {
      device.pass(body, null, []);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.createProgram).not.toHaveBeenCalled();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    device.pass(body, null, []);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    device.dispose();
    memory.dispose();
  });
});

it("cleans both original shaders and incomplete native program after original null link failure and allows retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    gl.linkProgram.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.pass(body, null, []);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(programs(device).size).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    device.pass(body, null, []);
    device.dispose();
    memory.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
  });
});

it("rejects oversized returned diagnostic text and clears incomplete native shader for retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    gl.getShaderParameter.mockReturnValueOnce(false);
    gl.getShaderInfoLog.mockReturnValueOnce("x".repeat(limits.metadata));
    expect(() => device.pass(body, null, [])).toThrow("metadata");
    expect(gl.getShaderInfoLog).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    device.pass(body, null, []);
    device.dispose();
    memory.dispose();
  });
});

it("admits actual returned native text and propagated Error before Error construction and retains exact message until final allocator cleanup", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    gl.getShaderParameter.mockReturnValueOnce(false);
    memory.beginScratch();
    let caught: unknown;
    try {
      device.pass(body, null, []);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = "comp-webgl-shader: original native compile failure";
    expect((caught as Error).message).toBe(message);
    expect(gl.getShaderInfoLog).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(1);
    expect(memory.statistics.peak.metadata).toBeLessThan(16384);
    expect(memory.statistics.current.metadata).toBe(
      1024 + 512 + 2 * message.length,
    );
    memory.endScratch();
    expect((caught as Error).message).toBe(message);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  });
});

it("preserves original native link diagnostic and deletes the actual linked handle and both shaders once", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    gl.getProgramParameter.mockReturnValueOnce(false);
    expect(() => device.pass(body, null, [])).toThrow(
      "comp-webgl-program: original native link failure",
    );
    expect(gl.getProgramInfoLog).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(programs(device).size).toBe(0);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("keeps original 64-program eviction order and releases actual oldest key/uniform/native owner exactly once", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    device.pass(body, null, []);
    const first = programs(device).get(body)!;
    const lifetime = first.lifetime!;
    for (let i = 1; i <= 64; i++) device.pass(body + "\n// " + i, null, []);
    expect(programs(device).size).toBe(64);
    expect(programs(device).has(body)).toBe(false);
    expect(memory.owns(lifetime)).toBe(false);
    expect(first.uniforms.size).toBe(0);
    expect(first.lifetime).toBeUndefined();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram.mock.calls[0]![0]).toBe(first.handle);
    device.dispose();
    memory.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(65);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  });
});

it("removes the actual attempted empty-string cache key after a null Map producer failure and leaves original retry usable", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    const cache = programs(device);
    const nativeSet = cache.set;
    const set = vi.spyOn(cache, "set").mockImplementationOnce((key, value) => {
      nativeSet.call(cache, key, value);
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.pass("", null, []);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(cache.size).toBe(0);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
    set.mockRestore();
    device.pass("", null, []);
    device.dispose();
    memory.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("visits every actual cached native owner despite first null destruction and clears real program Maps", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    device.pass(body, null, []);
    device.pass(body + "\n// next", null, []);
    const values = [...programs(device).values()];
    gl.deleteProgram.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.dispose();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(programs(device).size).toBe(0);
    for (const value of values) expect(value.uniforms.size).toBe(0);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("cleans captured native shader/program owners after scope exit and allocator-first disposal, preserving unmanaged native errors", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    const { device, gl } = await withManagedMemory(memory, async () => {
      const value = setup();
      value.device.pass(body, null, []);
      return value;
    });
    if (allocatorFirst) memory.dispose();
    device.dispose();
    memory.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(programs(device).size).toBe(0);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  }
  const { device, gl } = setup();
  gl.getShaderParameter.mockReturnValueOnce(false);
  expect(() => device.pass(body, null, [])).toThrow(
    "comp-webgl-shader: original native compile failure",
  );
  device.pass(body, null, []);
  device.dispose();
  expect(gl.deleteShader).toHaveBeenCalledTimes(3);
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
});

it("keeps instanced and ordinary program owners separate through cache reuse and disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl } = setup();
    const drawInstances = vi.fn();
    Object.assign(gl, { drawArraysInstanced: drawInstances });
    device.pass(body, null, []);
    const ordinary = programs(device).get(body)!;
    memory.beginScratch();
    device.pass(body, null, [], {}, false, undefined, 3);
    const instanced = programs(device).get(`rectangles:${body}`)!;
    expect(instanced).not.toBe(ordinary);
    expect(memory.owns(instanced.lifetime!)).toBe(true);
    expect(gl.shaderSource.mock.calls[2]![1]).toContain("gl_InstanceID");
    memory.endScratch();
    device.pass(body, null, [], {}, false, undefined, 2);
    expect(programs(device).get(`rectangles:${body}`)).toBe(instanced);
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(drawInstances.mock.calls).toEqual([
      [gl.TRIANGLES, 0, 6, 3],
      [gl.TRIANGLES, 0, 6, 2],
    ]);
    device.dispose();
    expect(programs(device).size).toBe(0);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
