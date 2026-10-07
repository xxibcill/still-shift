import { afterEach, expect, it, vi } from "vitest";
import { recordVectorPaints } from "../../packages/renderer-core/src/composition/render/webgl-vector-paints.ts";
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
it("denies actual call-array capacity before original array construction, path bookkeeping or native paint", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 1327 });
  await withManagedMemory(memory, async () => {
    const { ctx, fillRect, getTransform } = setup(),
      recording = recordVectorPaints(ctx, fallback),
      copy = vi.spyOn(Array, "from");
    expect(() => recording.context.fillRect(1, 2, 3, 4)).toThrow("metadata");
    expect(copy).not.toHaveBeenCalled();
    expect(getTransform).not.toHaveBeenCalled();
    expect(fillRect).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(1152);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves detached native method binding, dense arguments, zero function length and nonconstructible call semantics", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, fillRect } = setup(),
      recording = recordVectorPaints(ctx, fallback),
      method = recording.context.fillRect;
    expect(method.length).toBe(0);
    expect(() => Reflect.construct(method, [1, 2, 3, 4])).toThrow(TypeError);
    Reflect.apply(method, null, [1, 2, 3, 4]);
    expect(fillRect).toHaveBeenCalledWith(1, 2, 3, 4);
    const groups = recording.groups()!,
      command = groups[0]!.commands[0]!;
    if (!("method" in command)) throw Error("expected original command");
    expect(command.args).toEqual([1, 2, 3, 4]);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("admits before native array-from failure and releases the call controller while preserving null", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, fillRect } = setup(),
      recording = recordVectorPaints(ctx, fallback),
      copy = vi.spyOn(Array, "from").mockImplementationOnce(() => {
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
    expect(memory.statistics.current.metadata).toBe(1152);
    copy.mockRestore();
    recording.context.fillRect(1, 2, 3, 4);
    expect(fillRect).toHaveBeenCalledTimes(1);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("preserves native query output and drops its temporary input array after consumption without recording a paint", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, measureText } = setup(),
      recording = recordVectorPaints(ctx, fallback),
      before = memory.statistics.current.metadata;
    const metrics = recording.context.measureText("hello");
    expect(metrics.actualBoundingBoxLeft).toBe(2);
    expect(measureText).toHaveBeenCalledWith("hello");
    expect(measureText).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.metadata).toBe(before);
    expect(recording.groups()).toEqual([]);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("releases call input after original native paint throws null while retaining original partial command/mark state until disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, fillRect } = setup(),
      recording = recordVectorPaints(ctx, fallback);
    fillRect.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      recording.context.fillRect(1, 2, 3, 4);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(fillRect).toHaveBeenCalledTimes(1);
    const groups = recording.groups()!,
      command = groups[0]!.commands[0]!;
    if (!("method" in command))
      throw Error("expected original partial command");
    expect(command.args).toEqual([1, 2, 3, 4]);
    memory.dispose();
    recording.dispose();
    expect(groups).toHaveLength(0);
    expect(command.args).toHaveLength(0);
    expect(memory.statistics.reservations).toBe(0);
  });
});
