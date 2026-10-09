import { expect, it, vi } from "vitest";
import { CanvasPathBounds } from "../../packages/renderer-core/src/composition/render/webgl-path-bounds.ts";
import { recordVectorPaints } from "../../packages/renderer-core/src/composition/render/webgl-vector-paints.ts";
import { WebglVectors } from "../../packages/renderer-core/src/composition/render/webgl-vectors.ts";
import { WebglVisualKey } from "../../packages/renderer-core/src/composition/render/webgl-visual-key.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { WebglPaint } from "../../packages/renderer-core/src/composition/render/webgl-paint.ts";
import type { Canvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import type { VectorDraw } from "../../packages/renderer-core/src/composition/render/backend.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
const limits = { pixels: 1, metadata: 4096 };
function context() {
  const transformPoint = vi.fn(
    (point: DOMPointInit) =>
      ({ x: 2 * point.x! + 5, y: 3 * point.y! - 2 }) as DOMPoint,
  );
  const getTransform = vi.fn(
    () => ({ transformPoint }) as unknown as DOMMatrix,
  );
  return {
    ctx: { getTransform } as unknown as CanvasRenderingContext2D,
    getTransform,
    transformPoint,
  };
}
it("preserves original device-space path geometry and only retains its current bounds after point consumers", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const path = new CanvasPathBounds(),
      { ctx, getTransform, transformPoint } = context();
    memory.beginScratch();
    path.record(ctx, "moveTo", [1, 2]);
    path.record(ctx, "lineTo", [3, 4]);
    expect(path.bounds).toEqual({ left: 7, top: 4, right: 11, bottom: 10 });
    path.record(ctx, "quadraticCurveTo", [-2, 6, 4, 2]);
    expect(path.bounds).toEqual({ left: 1, top: 4, right: 13, bottom: 16 });
    path.record(ctx, "bezierCurveTo", [-3, -2, 7, 8, 1, 1]);
    expect(path.bounds).toEqual({ left: -1, top: -8, right: 19, bottom: 22 });
    path.record(ctx, "beginPath", []);
    path.record(ctx, "rect", [3, 4, -2, -3]);
    expect(path.bounds).toEqual({ left: 7, top: 1, right: 11, bottom: 10 });
    path.record(ctx, "beginPath", []);
    path.record(ctx, "roundRect", [1, 2, 3, 4, 1]);
    expect(path.bounds).toEqual({ left: 7, top: 4, right: 13, bottom: 16 });
    path.record(ctx, "beginPath", []);
    path.record(ctx, "arc", [2, 3, 1, 0, 0.1]);
    expect(path.bounds).toEqual({ left: 7, top: 4, right: 11, bottom: 10 });
    path.record(ctx, "beginPath", []);
    path.record(ctx, "ellipse", [2, 3, 1, 2, 0, 0, 0.1]);
    expect(path.bounds).toEqual({ left: 7, top: 1, right: 11, bottom: 13 });
    path.record(ctx, "save", []);
    path.record(ctx, "restore", []);
    expect(getTransform).toHaveBeenCalledTimes(8);
    expect(transformPoint).toHaveBeenCalledTimes(23);
    expect(memory.statistics.current.metadata).toBe(256);
    expect(memory.statistics.reservations).toBe(1);
    path.dispose();
    memory.endScratch();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("admits original path tuples before input getters and native matrix creation", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 655 });
  await withManagedMemory(memory, async () => {
    const path = new CanvasPathBounds(),
      { ctx, getTransform } = context(),
      getter = vi.fn(() => 1);
    const args = [1, 2];
    Object.defineProperty(args, "0", { get: getter });
    expect(() => path.record(ctx, "moveTo", args)).toThrow("metadata");
    expect(getter).not.toHaveBeenCalled();
    expect(getTransform).not.toHaveBeenCalled();
    expect(path.bounds).toBeUndefined();
    expect(memory.statistics.current.metadata).toBe(256);
    path.dispose();
    memory.dispose();
  });
});
it("admits native point/input/union capacity before transformPoint", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 1039 });
  await withManagedMemory(memory, async () => {
    const path = new CanvasPathBounds(),
      { ctx, getTransform, transformPoint } = context();
    expect(() => path.record(ctx, "moveTo", [1, 2])).toThrow("metadata");
    expect(getTransform).toHaveBeenCalledTimes(1);
    expect(transformPoint).not.toHaveBeenCalled();
    expect(path.bounds).toBeUndefined();
    expect(memory.statistics.current.metadata).toBe(256);
    path.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves null native failures and original partial per-point unions while releasing temporary arrays and matrix owners", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const path = new CanvasPathBounds(),
      { ctx, getTransform, transformPoint } = context();
    path.record(ctx, "moveTo", [1, 2]);
    getTransform.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      path.record(ctx, "lineTo", [3, 4]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(path.bounds).toEqual({ left: 7, top: 4, right: 7, bottom: 4 });
    transformPoint
      .mockImplementationOnce(() => ({ x: -3, y: -4 }) as DOMPoint)
      .mockImplementationOnce(() => {
        throw null;
      });
    try {
      path.record(ctx, "rect", [1, 2, 3, 4]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(path.bounds).toEqual({ left: -3, top: -4, right: 7, bottom: 4 });
    expect(memory.statistics.current.metadata).toBe(256);
    expect(memory.statistics.reservations).toBe(1);
    path.dispose();
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("retains original unknown arcTo/nonfinite semantics until beginPath and drops bounds at allocator-first disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const path = new CanvasPathBounds(),
      { ctx, transformPoint } = context();
    path.record(ctx, "moveTo", [1, 2]);
    path.record(ctx, "arcTo", [1, 2, 3, 4, 1]);
    path.record(ctx, "lineTo", [9, 9]);
    expect(transformPoint).toHaveBeenCalledTimes(1);
    expect(path.bounds).toBeUndefined();
    path.record(ctx, "beginPath", []);
    transformPoint.mockImplementationOnce(
      () => ({ x: Infinity, y: 1 }) as DOMPoint,
    );
    path.record(ctx, "lineTo", [1, 2]);
    expect(path.bounds).toBeUndefined();
    path.record(ctx, "beginPath", []);
    path.record(ctx, "moveTo", [1, 2]);
    expect(path.bounds).toEqual({ left: 7, top: 4, right: 7, bottom: 4 });
    memory.dispose();
    expect(path.bounds).toBeUndefined();
    path.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("releases path metadata on recording teardown even when native restore throws null", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const save = vi.fn(),
      beginPath = vi.fn(),
      restore = vi.fn(() => {
        throw null;
      });
    const recording = recordVectorPaints(
      { save, beginPath, restore } as unknown as CanvasRenderingContext2D,
      { left: 0, top: 0, right: 4, bottom: 4 },
      { deferPaints: true },
    );
    expect(memory.statistics.current.metadata).toBe(3072);
    expect(save).toHaveBeenCalledTimes(1);
    let caught: unknown = "missing";
    try {
      recording.dispose();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("releases existing raster scratch when recording state admission or native setup fails", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const keys = new WebglVisualKey(),
      save = vi.fn(),
      beginPath = vi.fn(),
      restore = vi.fn();
    const ctx = {
      save,
      beginPath,
      restore,
    } as unknown as CanvasRenderingContext2D;
    const pixels = {
      canvas: {} as HTMLCanvasElement,
      ctx,
      width: 32,
      height: 24,
    };
    const createSurface = vi.fn(() => pixels),
      releaseSurface = vi.fn(),
      surface = vi.fn();
    const cache = new WebglVectors(
      { surface } as unknown as WebglDevice,
      { createSurface, releaseSurface } as unknown as Canvas2dBackend,
      keys,
      { hasBackdrop: () => true } as unknown as WebglPaint,
    );
    const paint = cache as unknown as {
      paint(dst: WebglSurface, ops: VectorDraw[], rect: Bounds): unknown;
    };
    const dst = { width: 32, height: 24 } as WebglSurface,
      bounds = { left: 0, top: 0, right: 4, bottom: 4 };
    const ops: VectorDraw[] = [
      {
        kind: "draw",
        layer: "box",
        content: { type: "solid", width: 4, height: 4, color: [1, 0, 0, 1] },
        opacity: 1,
        matrix: [1, 0, 0, 1, 0, 0],
        transforms: [[1, 0, 0, 1, 0, 0]],
        blend: "normal",
        clips: [],
      },
    ];
    const base = memory.statistics.current.metadata,
      blocker = memory.reserve("metadata", limits.metadata - base - 255);
    expect(() => paint.paint(dst, ops, bounds)).toThrow("metadata");
    expect(createSurface).toHaveBeenCalledTimes(1);
    expect(releaseSurface).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(surface).not.toHaveBeenCalled();
    blocker.release();
    expect(memory.statistics.current.metadata).toBe(base);
    beginPath.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      paint.paint(dst, ops, bounds);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(releaseSurface).toHaveBeenCalledTimes(2);
    expect(memory.statistics.current.metadata).toBe(base);
    cache.dispose();
    keys.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
