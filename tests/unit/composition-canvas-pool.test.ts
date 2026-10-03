import { describe, expect, it } from "vitest";
import { createCanvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";

const setup = (poolByteLimit: number, poolLimit = 16) =>
  createCanvas2dBackend({
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
    poolByteLimit,
    poolLimit,
    createCanvas: (width, height) =>
      ({
        width,
        height,
        getContext: () => ({ resetTransform() {}, clearRect() {} }),
      }) as unknown as HTMLCanvasElement,
  });

describe("Canvas preparation pool", () => {
  it("evicts idle sizes within the byte budget while preserving active surfaces", () => {
    const backend = setup(800);
    const first = backend.createSurface(10, 10);
    const active = backend.createSurface(30, 30);
    backend.releaseSurface(first);
    const second = backend.createSurface(10, 20);
    backend.releaseSurface(second);
    expect(first.canvas.width).toBe(0);
    expect(active.canvas.width).toBe(30);
    expect(backend.allocated).toBe(2);
    expect(backend.createSurface(10, 20)).toBe(second);
    backend.releaseSurface(second);
    backend.releaseSurface(active);
    expect(backend.allocated).toBe(1);
    backend.dispose();
    expect(backend.allocated).toBe(0);
  });

  it("accounts for acquisition and repeated reuse without evicting retained sizes", () => {
    const backend = setup(800);
    const first = backend.createSurface(10, 10);
    const second = backend.createSurface(20, 5);
    backend.releaseSurface(first);
    backend.releaseSurface(second);
    for (let i = 0; i < 20; i++) {
      expect(backend.createSurface(10, 10)).toBe(first);
      backend.releaseSurface(first);
    }
    expect(backend.createSurface(20, 5)).toBe(second);
    expect(backend.allocated).toBe(2);
    backend.dispose();
  });

  it("enforces the per-size limit and permits disabling retention", () => {
    const backend = setup(800, 1);
    const first = backend.createSurface(10, 10);
    const second = backend.createSurface(10, 10);
    backend.releaseSurface(first);
    backend.releaseSurface(second);
    expect(backend.allocated).toBe(1);
    expect(backend.createSurface(10, 10)).toBe(first);
    backend.dispose();
    const disabled = setup(0);
    const surface = disabled.createSurface(1, 1);
    disabled.releaseSurface(surface);
    expect(disabled.allocated).toBe(0);
    expect(disabled.createSurface(1, 1)).not.toBe(surface);
    disabled.dispose();
  });
});
