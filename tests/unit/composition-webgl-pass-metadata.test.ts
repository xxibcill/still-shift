import { afterEach, expect, it, vi } from "vitest";
import {
  WebglDevice,
  type WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";
const body = "void main() { pixel=vec4(0.0); }";
const limits = { pixels: 65536, metadata: 65536 };
function setup() {
  const { canvas, gl } = fakeWebglDevice();
  const device = new WebglDevice(canvas);
  const uniformNames = [
    "source",
    "backdrop",
    "coverage",
    "input3",
    "gain",
    "v2",
    "v3",
    "v4",
    "matrix",
  ];
  const uniforms = new Map(
    uniformNames.map((name) => [
      name,
      { name } as unknown as WebGLUniformLocation,
    ]),
  );
  const programs = (
    device as unknown as {
      programs: Map<
        string,
        { handle: WebGLProgram; uniforms: typeof uniforms }
      >;
    }
  ).programs;
  programs.set(body, { handle: {} as WebGLProgram, uniforms });
  const input = {
    width: 2,
    height: 2,
    texture: {},
    framebuffer: {},
    screen: false,
    floating: false,
    opaque: false,
  } as WebglSurface;
  return { device, gl, input };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("denies temporary input/entry capacity before original Set and entry getters/native GPU consumers", async () => {
  const memory = new ManagedMemory({
    pixels: 65536,
    metadata: 1855 + 4096 + 12 * body.length,
  });
  await withManagedMemory(memory, async () => {
    const { device, gl, input } = setup();
    const inputs = [input];
    const getter = vi.fn(() => 2);
    const uniforms = Object.defineProperty({}, "gain", {
      enumerable: true,
      get: getter,
    });
    const OriginalSet = Set;
    let produced = 0;
    vi.stubGlobal(
      "Set",
      class<T> extends OriginalSet<T> {
        constructor(values?: Iterable<T> | null) {
          if (values === inputs) produced++;
          super(values);
        }
      },
    );
    expect(() => device.pass(body, null, inputs, uniforms)).toThrow("metadata");
    expect(produced).toBe(0);
    expect(getter).not.toHaveBeenCalled();
    expect(gl.useProgram).not.toHaveBeenCalled();
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(1024);
    device.dispose();
    memory.dispose();
  });
});
it("preserves one original own enumerable getter, native scalar/vector/matrix values and borrowed array identity", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl, input } = setup();
    const v2 = [1, 2],
      v3 = [3, 4, 5],
      v4 = [6, 7, 8, 9],
      matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const getter = vi.fn(() => 2);
    const uniforms = Object.defineProperty({ v2, v3, v4, matrix }, "gain", {
      enumerable: true,
      get: getter,
    });
    const entries = vi.spyOn(Object, "entries");
    device.pass(body, null, [input, input, input, input], uniforms);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(entries).toHaveBeenCalledWith(uniforms);
    const rows = entries.mock.results.find(
      (result) => result.type === "return",
    )!.value as unknown[][];
    expect(rows).toHaveLength(0);
    expect(gl.uniform1i).toHaveBeenCalledTimes(4);
    expect(gl.uniform2fv.mock.calls[0]![1]).toBe(v2);
    expect(gl.uniform3fv.mock.calls[0]![1]).toBe(v3);
    expect(gl.uniform4fv.mock.calls[0]![1]).toBe(v4);
    expect(gl.uniformMatrix3fv.mock.calls[0]![2]).toBe(matrix);
    expect(v2).toEqual([1, 2]);
    expect(gl.uniform1f).toHaveBeenCalledWith(expect.anything(), 2);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(device.passes).toBe(1);
    expect(memory.statistics.current.metadata).toBe(1024);
    entries.mockRestore();
    device.dispose();
    memory.dispose();
  });
});
it("clears actual input Set and original tuple/outer arrays after native consumption", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl, input } = setup();
    const inputs = [input];
    const OriginalSet = Set;
    let unique: Set<WebglSurface> | undefined;
    vi.stubGlobal(
      "Set",
      class<T> extends OriginalSet<T> {
        constructor(values?: Iterable<T> | null) {
          super(values);
          if (values === inputs) unique = this as unknown as Set<WebglSurface>;
        }
      },
    );
    const original = Object.entries;
    let rows: unknown[][] | undefined, row: unknown[] | undefined;
    const values = { gain: 3 };
    const entries = vi.spyOn(Object, "entries").mockImplementation((value) => {
      const result = original(value);
      if (value === values) {
        rows = result;
        row = result[0];
      }
      return result;
    });
    gl.drawArrays.mockImplementationOnce(() => {
      expect(unique!.has(input)).toBe(true);
      expect(row).toEqual(["gain", 3]);
      expect(rows).toHaveLength(1);
    });
    device.pass(body, null, inputs, values);
    expect(unique!.size).toBe(0);
    expect(rows).toHaveLength(0);
    expect(row).toHaveLength(0);
    expect(inputs).toEqual([input]);
    entries.mockRestore();
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves original null entry-getter failure and clears temporary actual inputs before retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl, input } = setup();
    const getter = vi.fn(() => {
      throw null;
    });
    const values = Object.defineProperty({}, "gain", {
      enumerable: true,
      get: getter,
    });
    let caught: unknown = "missing";
    try {
      device.pass(body, null, [input], values);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(getter).toHaveBeenCalledTimes(1);
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(1024);
    device.pass(body, null, [input], { gain: 3 });
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    device.dispose();
    memory.dispose();
  });
});
it("preserves original null native draw failure, resets scissor and releases temporary controls without completing the pass", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, gl, input } = setup();
    gl.drawArrays.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      device.pass(body, null, [input], { gain: 3 }, false, {
        left: 1,
        top: 2,
        right: 3,
        bottom: 4,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(gl.scissor).toHaveBeenCalledWith(1, 2, 2, 2);
    expect(gl.disable).toHaveBeenLastCalledWith(gl.SCISSOR_TEST);
    expect(device.passes).toBe(0);
    expect(memory.statistics.current.metadata).toBe(1024);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
