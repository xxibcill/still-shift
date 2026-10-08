import { expect, it, vi } from "vitest";
import {
  WebglDevice,
  type WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { fakeWebglDevice } from "../helpers/composition-webgl-device-fixture.ts";

const limits = { pixels: 65536, metadata: 65536 };
const frame = { left: 1, top: 2, right: 7, bottom: 8 };
const input = { left: 3, top: 1, right: 9, bottom: 6 };
function clips(device: WebglDevice) {
  return (
    device as unknown as {
      state: { clips: { regions: Set<Bounds>; bytes: number } | undefined };
    }
  ).state.clips;
}
function setup() {
  const native = fakeWebglDevice();
  const device = new WebglDevice(native.canvas);
  const screen = device.surface(10, 10, false, false, true);
  return { ...native, device, screen };
}

it("preserves original borrowed clip aliases and null branches without producing intersection metadata", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, screen } = setup();
    const before = memory.statistics.current;
    expect(device.drawRegion(screen, input)).toBe(input);
    device.setFrameClip(frame);
    const offscreen = { ...screen, screen: false } as WebglSurface;
    expect(device.drawRegion(offscreen, input)).toBe(input);
    device.setFrameClip(null);
    expect(device.drawRegion(screen, input)).toBeNull();
    expect(clips(device)).toBeUndefined();
    expect(memory.statistics.current).toEqual(before);
    expect(input).toEqual({ left: 3, top: 1, right: 9, bottom: 6 });
    device.dispose();
    memory.dispose();
  });
});

it("denies one byte before original coordinate getters and releases the empty actual arena for retry", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, screen } = setup();
    const left = vi.fn(() => frame.left);
    device.setFrameClip({
      ...frame,
      get left() {
        return left();
      },
    });
    const before = memory.statistics.current;
    const blocker = memory.reserve(
      "metadata",
      limits.metadata - before.metadata - 359,
    );
    expect(() => device.drawRegion(screen, input)).toThrow("metadata");
    expect(left).not.toHaveBeenCalled();
    expect(clips(device)).toBeUndefined();
    blocker.release();
    expect(memory.statistics.current).toEqual(before);
    expect(device.drawRegion(screen, input)).toEqual({
      left: 3,
      top: 2,
      right: 7,
      bottom: 6,
    });
    expect(left).toHaveBeenCalledTimes(1);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("holds original distinct boxes and getter order through scratch until frame reset clears their actual Set", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, screen } = setup();
    const order: string[] = [];
    const tracked = (value: Bounds, name: string): Bounds => ({
      get left() {
        order.push(name + ".left");
        return value.left;
      },
      get top() {
        order.push(name + ".top");
        return value.top;
      },
      get right() {
        order.push(name + ".right");
        return value.right;
      },
      get bottom() {
        order.push(name + ".bottom");
        return value.bottom;
      },
    });
    device.setFrameClip(tracked(frame, "frame"));
    const before = memory.statistics.current.metadata;
    memory.beginScratch();
    const first = device.drawRegion(screen, tracked(input, "clip"));
    expect(order).toEqual([
      "frame.left",
      "clip.left",
      "frame.top",
      "clip.top",
      "frame.right",
      "clip.right",
      "frame.bottom",
      "clip.bottom",
    ]);
    const second = device.drawRegion(screen, input);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    const phase = clips(device)!;
    expect(phase.regions.has(first!)).toBe(true);
    expect(phase.regions.has(second!)).toBe(true);
    expect(memory.owns(phase)).toBe(true);
    expect(memory.statistics.current.metadata).toBe(before + 464);
    memory.endScratch();
    expect(phase.regions.size).toBe(2);
    expect(memory.statistics.current.metadata).toBe(before + 464);
    device.setFrameClip();
    expect(phase.regions.size).toBe(0);
    expect(memory.owns(phase)).toBe(false);
    expect(memory.statistics.current.metadata).toBe(before);
    expect(frame).toEqual({ left: 1, top: 2, right: 7, bottom: 8 });
    device.dispose();
    memory.dispose();
  });
});

it("releases empty intersections immediately and preserves previously completed frame boxes", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, screen } = setup();
    device.setFrameClip(frame);
    const before = memory.statistics.current.metadata;
    const empty = { left: 7, top: 2, right: 9, bottom: 6 };
    expect(device.drawRegion(screen, empty)).toBeNull();
    expect(clips(device)).toBeUndefined();
    expect(memory.statistics.current.metadata).toBe(before);
    const first = device.drawRegion(screen, input)!;
    const phase = clips(device)!;
    expect(device.drawRegion(screen, empty)).toBeNull();
    expect(clips(device)).toBe(phase);
    expect(phase.regions.size).toBe(1);
    expect(phase.regions.has(first)).toBe(true);
    expect(memory.statistics.current.metadata).toBe(before + 360);
    device.dispose();
    memory.dispose();
    expect(phase.regions.size).toBe(0);
  });
});

it("preserves original null coordinate and Set failures while restoring only attempted frame capacity", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { device, screen } = setup();
    device.setFrameClip(frame);
    const first = device.drawRegion(screen, input)!;
    const phase = clips(device)!;
    const before = memory.statistics.current;
    const broken = {
      ...input,
      get left(): number {
        throw null;
      },
    };
    const add = vi.spyOn(phase.regions, "add");
    let caught: unknown = "missing";
    try {
      device.drawRegion(screen, broken);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(add).not.toHaveBeenCalled();
    expect(memory.statistics.current).toEqual(before);
    add.mockImplementationOnce(() => {
      throw null;
    });
    caught = "missing";
    try {
      device.drawRegion(screen, input);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(phase.regions.size).toBe(1);
    expect(phase.regions.has(first)).toBe(true);
    expect(memory.statistics.current).toEqual(before);
    add.mockRestore();
    expect(device.drawRegion(screen, input)).toEqual(first);
    device.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("clears actual frame boxes after scope exit and allocator-first device disposal", async () => {
  for (const allocatorFirst of [false, true]) {
    const memory = new ManagedMemory(limits);
    let phase: ReturnType<typeof clips>;
    const { device, gl } = await withManagedMemory(memory, async () => {
      const value = setup();
      value.device.setFrameClip(frame);
      value.device.drawRegion(value.screen, input);
      phase = clips(value.device);
      return value;
    });
    if (allocatorFirst) memory.dispose();
    device.dispose();
    memory.dispose();
    expect(phase!.regions.size).toBe(0);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
  }
});

it("keeps original unmanaged clip values and clears actual frame collection on reset", () => {
  const { device, screen } = setup();
  device.setFrameClip(frame);
  expect(device.drawRegion(screen, input)).toEqual({
    left: 3,
    top: 2,
    right: 7,
    bottom: 6,
  });
  const phase = clips(device)!;
  device.setFrameClip(null);
  expect(phase.regions.size).toBe(0);
  expect(device.drawRegion(screen, input)).toBeNull();
  device.dispose();
});
