import { describe, expect, it } from "vitest";
import { WebglReadback } from "../../packages/renderer-core/src/composition/render/webgl-readback.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
const setup = (limit?: number) => {
  const framebuffer = new Uint8ClampedArray(4 * 3 * 4),
    regions: Bounds[] = [];
  let reads = 0;
  const cache = new WebglReadback(
    4,
    3,
    () => {
      reads++;
      return framebuffer.slice();
    },
    (rect) => {
      regions.push(rect);
      const result = new Uint8Array(
        (rect.right - rect.left) * (rect.bottom - rect.top) * 4,
      );
      for (let y = rect.top; y < rect.bottom; y++)
        for (let x = rect.left; x < rect.right; x++)
          result.set(
            framebuffer.subarray((y * 4 + x) * 4, (y * 4 + x + 1) * 4),
            ((y - rect.top) * (rect.right - rect.left) + x - rect.left) * 4,
          );
      return result;
    },
    limit,
  );
  return { cache, framebuffer, regions, reads: () => reads };
};
describe("incremental GPU readback", () => {
  it("updates all regions written between reads and keeps returned arrays independent", () => {
    const { cache, framebuffer, regions, reads } = setup();
    framebuffer.fill(1);
    const first = cache.read();
    first.fill(99);
    expect(cache.read()).toEqual(framebuffer);
    expect(reads()).toBe(1);
    framebuffer.set([2, 3, 4, 255], (1 * 4 + 1) * 4);
    cache.changed({ left: 1, top: 1, right: 2, bottom: 2 });
    framebuffer.set([5, 6, 7, 255], (2 * 4 + 2) * 4);
    cache.changed({ left: 2, top: 2, right: 3, bottom: 3 });
    const next = cache.read();
    expect(next).toEqual(framebuffer);
    expect(regions).toEqual([{ left: 1, top: 1, right: 3, bottom: 3 }]);
    expect(reads()).toBe(1);
    framebuffer.fill(42);
    cache.changed();
    expect(cache.read()).toEqual(framebuffer);
    expect(reads()).toBe(2);
    expect(next[(1 * 4 + 1) * 4]).toBe(2);
    expect(first.every((value) => value === 99)).toBe(true);
  });
  it("does not mistake an unknown full update for a later bounded update", () => {
    const { cache, framebuffer, reads, regions } = setup();
    cache.read();
    framebuffer.fill(73);
    cache.changed();
    cache.changed({ left: 1, top: 1, right: 2, bottom: 2 });
    cache.changed(null);
    expect(cache.read()).toEqual(framebuffer);
    expect(reads()).toBe(2);
    expect(regions).toEqual([]);
  });
  it("patches native bottom-up rows without reversing the temporary buffer", () => {
    const native = new Uint8Array([30, 31, 32, 255, 20, 21, 22, 255]);
    const cache = new WebglReadback(
      3,
      4,
      () => new Uint8ClampedArray(48),
      () => native,
      undefined,
      "bottom-up",
    );
    const first = cache.read();
    cache.changed({ left: 1, top: 1, right: 2, bottom: 3 });
    const result = cache.read();
    expect([...result.slice(16, 20)]).toEqual([20, 21, 22, 255]);
    expect([...result.slice(28, 32)]).toEqual([30, 31, 32, 255]);
    expect([...native]).toEqual([30, 31, 32, 255, 20, 21, 22, 255]);
    expect(first.every((value) => value === 0)).toBe(true);
    result.fill(99);
    expect(cache.read()[16]).toBe(20);
  });
  it("retains no framebuffer above its byte budget", () => {
    const { cache, framebuffer, reads } = setup(4);
    cache.read();
    framebuffer.fill(24);
    expect(cache.read()).toEqual(framebuffer);
    expect(reads()).toBe(2);
  });
});
