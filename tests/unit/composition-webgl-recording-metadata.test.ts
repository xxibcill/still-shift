import { afterEach, expect, it, vi } from "vitest";
import {
  recordVectorPaints,
  replayVectorPaints,
} from "../../packages/renderer-core/src/composition/render/webgl-vector-paints.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
const limits = { pixels: 1, metadata: 65536 };
const fallback = { left: 0, top: 0, right: 32, bottom: 24 };
class Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  constructor(values: number[] = [1, 0, 0, 1, 0, 0]) {
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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("admits recording state before native marker setup and rolls back failed path/control construction", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 2431 });
  await withManagedMemory(memory, async () => {
    const { ctx, save } = setup();
    expect(() =>
      recordVectorPaints(ctx, fallback, { deferPaints: true }),
    ).toThrow("metadata");
    expect(save).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
  const small = new ManagedMemory({ pixels: 1, metadata: 2687 });
  await withManagedMemory(small, async () => {
    const { ctx, save } = setup();
    expect(() =>
      recordVectorPaints(ctx, fallback, { deferPaints: true }),
    ).toThrow("metadata");
    expect(save).not.toHaveBeenCalled();
    expect(small.statistics.current.metadata).toBe(0);
    expect(small.statistics.reservations).toBe(0);
    small.dispose();
  });
});
it("admits original shallow argument-array copies before their iterator and native consumer", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 3707 });
  await withManagedMemory(memory, async () => {
    const { ctx, raw } = setup(),
      setLineDash = vi.fn();
    Object.assign(raw, { setLineDash });
    const recording = recordVectorPaints(ctx, fallback),
      values = [2, 3, 4],
      iterator = vi.fn(values[Symbol.iterator].bind(values));
    values[Symbol.iterator] = iterator;
    expect(() => recording.context.setLineDash(values)).toThrow("metadata");
    expect(iterator).not.toHaveBeenCalled();
    expect(setLineDash).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(3328);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("admits original native matrix clone capacity before fromMatrix", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 3847 });
  await withManagedMemory(memory, async () => {
    const { ctx, setTransform } = setup(),
      source = new Matrix(),
      clone = vi.spyOn(Matrix, "fromMatrix"),
      recording = recordVectorPaints(ctx, fallback);
    expect(() =>
      recording.context.setTransform(source as unknown as DOMMatrix),
    ).toThrow("metadata");
    expect(clone).not.toHaveBeenCalled();
    expect(setTransform).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(3328);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("keeps independent original array/matrix copies through replay without changing source inputs, then clears actual command references", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, raw, setTransform } = setup(),
      setLineDash = vi.fn();
    Object.assign(raw, { setLineDash });
    const recording = recordVectorPaints(ctx, fallback),
      values = [2, 3, 4],
      source = new Matrix();
    source.e = 5;
    recording.context.setTransform(source as unknown as DOMMatrix);
    recording.context.setLineDash(values);
    source.e = 50;
    values[0] = 99;
    recording.context.fillRect(1, 1, 2, 2);
    const group = recording.groups()![0]!,
      commands = group.commands;
    const first = commands[0]!,
      second = commands[1]!;
    if (!("method" in first) || !("method" in second))
      throw Error("expected method commands");
    const matrix = first.args[0] as Matrix,
      copied = second.args[0] as number[],
      args = first.args;
    expect(matrix).not.toBe(source);
    expect(matrix.e).toBe(5);
    expect(copied).not.toBe(values);
    expect(copied).toEqual([2, 3, 4]);
    setTransform.mockClear();
    setLineDash.mockClear();
    replayVectorPaints(ctx, group);
    expect(setTransform).toHaveBeenCalledWith(matrix);
    expect(setLineDash).toHaveBeenCalledWith(copied);
    recording.dispose();
    expect(commands).toHaveLength(0);
    expect(args).toHaveLength(0);
    expect(copied).toHaveLength(0);
    expect(values).toEqual([99, 3, 4]);
    expect(source.e).toBe(50);
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("rolls back original null clone failure before native setTransform and preserves reusable recording state", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, setTransform } = setup(),
      source = new Matrix(),
      clone = vi.spyOn(Matrix, "fromMatrix").mockImplementationOnce(() => {
        throw null;
      }),
      recording = recordVectorPaints(ctx, fallback);
    let caught: unknown = "missing";
    try {
      recording.context.setTransform(source as unknown as DOMMatrix);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(setTransform).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(3328);
    clone.mockRestore();
    recording.context.setTransform(source as unknown as DOMMatrix);
    expect(setTransform).toHaveBeenCalledTimes(1);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("admits property-command fields before native assignment and leaves borrowed property values untouched", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 3197 });
  await withManagedMemory(memory, async () => {
    const { ctx, raw } = setup(),
      setter = vi.fn();
    Object.defineProperty(raw, "globalAlpha", { set: setter });
    const recording = recordVectorPaints(ctx, fallback);
    expect(() => {
      recording.context.globalAlpha = 0.5;
    }).toThrow("metadata");
    expect(setter).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(3072);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("drops actual property-command references without clearing borrowed arrays at allocator-first disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx } = setup(),
      recording = recordVectorPaints(ctx, fallback),
      borrowed = [1, 2, 3];
    (recording.context as unknown as Record<string, unknown>).customData =
      borrowed;
    recording.context.fillRect(1, 1, 2, 2);
    const groups = recording.groups()!,
      commands = groups[0]!.commands;
    expect("property" in commands[0]!).toBe(true);
    memory.dispose();
    expect(commands).toHaveLength(0);
    expect(groups).toHaveLength(0);
    expect(borrowed).toEqual([1, 2, 3]);
    recording.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("retains actual mark/painted-command controls with original deferred first-group behavior and clears them on disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, fillRect } = setup(),
      recording = recordVectorPaints(ctx, fallback, { deferPaints: true });
    recording.context.fillRect(1, 1, 2, 2);
    const before = memory.statistics.current.metadata;
    recording.context.fillRect(2, 2, 2, 2);
    expect(fillRect).toHaveBeenCalledTimes(1);
    expect(recording.firstGroupOnly()).toBe(true);
    expect(memory.statistics.current.metadata).toBeGreaterThan(before);
    const groups = recording.groups()!;
    expect(groups).toHaveLength(2);
    expect([...groups[0]!.selected]).toEqual([0]);
    expect([...groups[1]!.selected]).toEqual([1]);
    recording.render();
    expect(fillRect).toHaveBeenCalledTimes(2);
    recording.dispose();
    expect(groups).toHaveLength(0);
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
