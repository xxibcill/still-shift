import { afterEach, expect, it, vi } from "vitest";
import {
  recordVectorPaints,
  replayVectorPaints,
  type VectorPaintGroup,
} from "../../packages/renderer-core/src/composition/render/webgl-vector-paints.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
const limits = { pixels: 1, metadata: 65536 };
const fallback = { left: 0, top: 0, right: 32, bottom: 24 };
let matrixCreates = 0;
class Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  constructor(values: number[] = [1, 0, 0, 1, 0, 0]) {
    matrixCreates++;
    [this.a, this.b, this.c, this.d, this.e, this.f] = values as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
  }
  static fromMatrix(value: Matrix) {
    return new Matrix([value.a, value.b, value.c, value.d, value.e, value.f]);
  }
  transformPoint(point: DOMPointInit) {
    return {
      x: this.a * point.x! + this.c * point.y! + this.e,
      y: this.b * point.x! + this.d * point.y! + this.f,
    } as DOMPoint;
  }
}
function setup() {
  vi.stubGlobal("Path2D", class {});
  vi.stubGlobal("DOMMatrixReadOnly", Matrix);
  vi.stubGlobal("DOMMatrix", Matrix);
  matrixCreates = 0;
  const matrix = new Matrix();
  const getTransform = vi.fn(() => matrix as unknown as DOMMatrix),
    measureText = vi.fn(
      () =>
        ({
          actualBoundingBoxLeft: 2,
          actualBoundingBoxRight: 7,
          actualBoundingBoxAscent: 3,
          actualBoundingBoxDescent: 4,
        }) as TextMetrics,
    );
  const fillRect = vi.fn(),
    fillText = vi.fn(),
    save = vi.fn(),
    restore = vi.fn(),
    beginPath = vi.fn(),
    setTransform = vi.fn(),
    translate = vi.fn();
  const raw = {
    canvas: { width: 32, height: 24 },
    globalCompositeOperation: "source-over",
    fillStyle: "#fff",
    strokeStyle: "#000",
    filter: "none",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    miterLimit: 10,
    getTransform,
    measureText,
    fillRect,
    fillText,
    save,
    restore,
    beginPath,
    setTransform,
    translate,
  };
  return {
    raw,
    ctx: raw as unknown as CanvasRenderingContext2D,
    matrix,
    getTransform,
    measureText,
    fillRect,
    fillText,
    save,
    restore,
    setTransform,
  };
}
afterEach(() => vi.unstubAllGlobals());
it("keeps actual paint rectangles admitted through groups and releases them at recording disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, fillRect, getTransform } = setup(),
      recording = recordVectorPaints(ctx, fallback);
    recording.context.fillRect(1.25, 2.5, 4, 3);
    const group = recording.groups()![0]!;
    expect(group.bounds).toEqual({ left: 0, top: 0, right: 8, bottom: 8 });
    expect(memory.owns(group.bounds)).toBe(true);
    expect(memory.statistics.current.metadata).toBe(616);
    expect(fillRect).toHaveBeenCalledTimes(1);
    expect(getTransform).toHaveBeenCalledTimes(1);
    recording.dispose();
    expect(memory.owns(group.bounds)).toBe(false);
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("denies original text metrics and matrices before their native producers", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, measureText, getTransform, fillText } = setup(),
      recording = recordVectorPaints(ctx, fallback);
    const blocker = memory.reserve("metadata", limits.metadata - 512 - 2047);
    expect(() => recording.context.fillText("hello", 10, 10)).toThrow(
      "metadata",
    );
    expect(measureText).not.toHaveBeenCalled();
    expect(getTransform).not.toHaveBeenCalled();
    expect(fillText).not.toHaveBeenCalled();
    blocker.release();
    expect(memory.statistics.current.metadata).toBe(512);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("admits retained result bounds before original point coordinate maps while rolling back failed entry capacity", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 2663 });
  await withManagedMemory(memory, async () => {
    const { ctx, matrix, getTransform, fillRect } = setup(),
      x = vi.fn(() => 1),
      y = vi.fn(() => 2);
    matrix.transformPoint = vi.fn(
      () =>
        Object.defineProperties(
          {},
          { x: { get: x }, y: { get: y } },
        ) as DOMPoint,
    );
    const recording = recordVectorPaints(ctx, fallback);
    expect(() => recording.context.fillRect(1, 2, 3, 4)).toThrow("metadata");
    expect(getTransform).toHaveBeenCalledTimes(1);
    expect(matrix.transformPoint).toHaveBeenCalledTimes(4);
    expect(x).not.toHaveBeenCalled();
    expect(y).not.toHaveBeenCalled();
    expect(fillRect).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(512);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves exact original text metrics and region padding without another native text query", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, measureText, fillText } = setup(),
      recording = recordVectorPaints(ctx, fallback);
    recording.context.fillText("hello", 10.5, 8.5);
    expect(recording.groups()![0]!.bounds).toEqual({
      left: 6,
      top: 3,
      right: 20,
      bottom: 15,
    });
    expect(measureText).toHaveBeenCalledTimes(1);
    expect(fillText).toHaveBeenCalledWith("hello", 10.5, 8.5);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("preserves null native matrix failures and releases incomplete paint-bound arenas", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, getTransform, fillRect } = setup(),
      recording = recordVectorPaints(ctx, fallback);
    getTransform.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      recording.context.fillRect(1, 2, 3, 4);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(fillRect).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(512);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("keeps native blur padding and borrows the original fallback for unsupported filters", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, raw } = setup();
    raw.filter = "blur(3px)";
    const recording = recordVectorPaints(ctx, fallback);
    recording.context.fillRect(10, 10, 1, 1);
    expect(recording.groups()![0]!.bounds).toEqual({
      left: 0,
      top: 0,
      right: 29,
      bottom: 24,
    });
    recording.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    raw.filter = "brightness(2)";
    const unsupported = recordVectorPaints(ctx, fallback);
    unsupported.context.fillRect(10, 10, 1, 1);
    expect(unsupported.groups()![0]!.bounds).toBe(fallback);
    expect(memory.owns(fallback)).toBe(false);
    expect(memory.statistics.current.metadata).toBe(512);
    memory.dispose();
    unsupported.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
function replayGroup(): VectorPaintGroup {
  return {
    commands: [{ method: "setTransform", args: [1, 0, 0, 1, 50, 0] }],
    selected: new Set([0]),
    primitive: true,
    bounds: fallback,
    shadow: "only",
    shadowRight: 5,
  };
}
it("denies replay matrix admission before its native factory and restores original Canvas state", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 583 });
  await withManagedMemory(memory, async () => {
    const { ctx, setTransform, save, restore } = setup();
    matrixCreates = 0;
    expect(() => replayVectorPaints(ctx, replayGroup())).toThrow("metadata");
    expect(matrixCreates).toBe(0);
    expect(setTransform).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("keeps the original replay matrix alive through native setTransform then drops its temporary owner", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, setTransform, restore } = setup();
    matrixCreates = 0;
    setTransform.mockImplementation((matrix: Matrix) => {
      expect(matrix.e).toBe(-243);
      expect(matrix.f).toBe(0);
      expect(memory.statistics.current.metadata).toBe(584);
    });
    replayVectorPaints(ctx, replayGroup());
    expect(matrixCreates).toBe(1);
    expect(setTransform).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
