import { describe, expect, it } from "vitest";
import { captureNativeGlState } from "../../packages/renderer-core/src/composition/render/webgl-native-state.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
function fixture() {
  let next = 100000,
    active = 0x84c1,
    failDepth = false;
  const constants = new Map<string, number>([
      ["TEXTURE0", 0x84c0],
      ["DRAW_BUFFER0", 0x8825],
    ]),
    names = new Map<number, string>();
  const calls: { name: string; args: unknown[] }[] = [];
  const handles = {
    draw: { id: "draw" },
    read: { id: "read" },
    vao: { id: "vao" },
    program: { id: "program" },
    buffer: { id: "buffer" },
  };
  const object: Record<string, unknown> = {
    getParameter(parameter: number) {
      if (parameter >= 0x8825 && parameter < 0x8827)
        return 0x8ce0 + parameter - 0x8825;
      const name = names.get(parameter)!;
      if (
        name === "MAX_COMBINED_TEXTURE_IMAGE_UNITS" ||
        name === "MAX_DRAW_BUFFERS"
      )
        return 2;
      if (name === "ACTIVE_TEXTURE") return active;
      if (name === "DRAW_FRAMEBUFFER_BINDING") return handles.draw;
      if (name === "READ_FRAMEBUFFER_BINDING") return handles.read;
      if (name === "VERTEX_ARRAY_BINDING") return handles.vao;
      if (name === "CURRENT_PROGRAM") return handles.program;
      if (name.endsWith("BUFFER_BINDING")) return handles.buffer;
      if (name.startsWith("TEXTURE_BINDING_") || name === "SAMPLER_BINDING")
        return { unit: active - 0x84c0, target: name };
      if (name === "VIEWPORT" || name === "SCISSOR_BOX")
        return new Int32Array([3, 5, 17, 19]);
      if (name === "COLOR_CLEAR_VALUE" || name === "BLEND_COLOR")
        return new Float32Array([0.25, 0.5, 0.75, 1]);
      if (name === "COLOR_WRITEMASK") return [true, false, true, false];
      if (name === "DEPTH_RANGE") return new Float32Array([0.25, 0.75]);
      if (name === "DEPTH_WRITEMASK" || name === "SAMPLE_COVERAGE_INVERT")
        return false;
      if (name === "UNPACK_PREMULTIPLY_ALPHA_WEBGL") return true;
      return 7;
    },
    isEnabled(flag: number) {
      return names.get(flag) === "DITHER" || names.get(flag) === "STENCIL_TEST";
    },
    activeTexture(unit: number) {
      calls.push({ name: "activeTexture", args: [unit] });
      active = unit;
    },
    depthFunc(value: number) {
      calls.push({ name: "depthFunc", args: [value] });
      if (failDepth) {
        failDepth = false;
        throw Error("retained state restoration failure");
      }
    },
  };
  const gl = new Proxy(object, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === key.toUpperCase()) {
        if (!constants.has(key)) {
          constants.set(key, next);
          names.set(next++, key);
        }
        return constants.get(key);
      }
      return (...args: unknown[]) => calls.push({ name: key, args });
    },
  }) as unknown as WebGL2RenderingContext;
  return {
    gl,
    calls,
    handles,
    fail() {
      failDepth = true;
    },
  };
}
describe("native foreign WebGL2 state guard", () => {
  it("restores complete texture/sampler, framebuffer, pixel-store, mask and clip state", () => {
    const f = fixture(),
      guard = captureNativeGlState(f.gl);
    f.calls.length = 0;
    guard.restore();
    expect(f.calls).toContainEqual({
      name: "bindFramebuffer",
      args: [f.gl.DRAW_FRAMEBUFFER, f.handles.draw],
    });
    expect(f.calls).toContainEqual({
      name: "bindFramebuffer",
      args: [f.gl.READ_FRAMEBUFFER, f.handles.read],
    });
    expect(f.calls).toContainEqual({
      name: "bindVertexArray",
      args: [f.handles.vao],
    });
    expect(f.calls).toContainEqual({
      name: "colorMask",
      args: [true, false, true, false],
    });
    expect(f.calls).toContainEqual({ name: "depthRange", args: [0.25, 0.75] });
    expect(f.calls).toContainEqual({
      name: "pixelStorei",
      args: [f.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true],
    });
    expect(f.calls).toContainEqual({
      name: "bindTexture",
      args: [f.gl.TEXTURE_3D, { unit: 1, target: "TEXTURE_BINDING_3D" }],
    });
    expect(f.calls).toContainEqual({
      name: "bindSampler",
      args: [1, { unit: 1, target: "SAMPLER_BINDING" }],
    });
    expect(f.calls.at(-1)).toEqual({
      name: "activeTexture",
      args: [f.gl.TEXTURE0 + 1],
    });
    const count = f.calls.length;
    guard.restore();
    expect(f.calls).toHaveLength(count);
  });
  it("retains the first restoration error while restoring later assumptions and retiring metadata", async () => {
    const f = fixture(),
      memory = new ManagedMemory({ pixels: 1024 * 1024, metadata: 256 * 1024 });
    await withManagedMemory(memory, async () => {
      const guard = captureNativeGlState(f.gl);
      expect(memory.statistics.current.metadata).toBeGreaterThan(0);
      f.calls.length = 0;
      f.fail();
      expect(() => guard.restore()).toThrow(
        "retained state restoration failure",
      );
      expect(f.calls).toContainEqual({
        name: "pixelStorei",
        args: [f.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true],
      });
      expect(f.calls.at(-1)).toEqual({
        name: "activeTexture",
        args: [f.gl.TEXTURE0 + 1],
      });
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
      expect(memory.statistics.reservations).toBe(0);
    });
    memory.dispose();
  });
});
