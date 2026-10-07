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
it("admits recording controller capacity before Proxy construction or native marker setup", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 2431 });
  await withManagedMemory(memory, async () => {
    const { ctx, save } = setup();
    const OriginalProxy = Proxy;
    let constructions = 0;
    vi.stubGlobal(
      "Proxy",
      new OriginalProxy(OriginalProxy, {
        construct(target, args, newTarget) {
          if (args[0] === ctx) constructions++;
          return Reflect.construct(target, args, newTarget);
        },
      }),
    );
    expect(() =>
      recordVectorPaints(ctx, fallback, { deferPaints: true }),
    ).toThrow("metadata");
    expect(constructions).toBe(0);
    expect(save).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("denies wrapper capacity after exactly one original native property getter, before call-array or native production", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 3327 });
  await withManagedMemory(memory, async () => {
    const { ctx, raw, fillRect } = setup();
    const getter = vi.fn(() => fillRect);
    Object.defineProperty(raw, "fillRect", { get: getter });
    const recording = recordVectorPaints(ctx, fallback);
    const copy = vi.spyOn(Array, "from");
    expect(() => recording.context.fillRect).toThrow("metadata");
    expect(getter).toHaveBeenCalledTimes(1);
    expect(copy).not.toHaveBeenCalled();
    expect(fillRect).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(3072);
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("charges each original fresh wrapper until recording disposal without charging plain property lookups", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, measureText } = setup();
    const recording = recordVectorPaints(ctx, fallback);
    const first = recording.context.measureText;
    const second = recording.context.measureText;
    const third = recording.context.measureText;
    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
    expect(first.length).toBe(0);
    expect(() => Reflect.construct(first, ["hello"])).toThrow(TypeError);
    expect(recording.context.fillStyle).toBe("#fff");
    expect(memory.statistics.current.metadata).toBe(3072 + 3 * 256);
    const result = Reflect.apply(third, null, ["hello"]);
    expect(result.actualBoundingBoxLeft).toBe(2);
    expect(measureText).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.metadata).toBe(3072 + 3 * 256);
    recording.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("preserves original null getter failure before wrapper admission and leaves the recording reusable", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, raw, measureText } = setup();
    const getter = vi.fn(() => {
      throw null;
    });
    Object.defineProperty(raw, "measureText", {
      configurable: true,
      get: getter,
    });
    const recording = recordVectorPaints(ctx, fallback);
    let caught: unknown = "missing";
    try {
      void recording.context.measureText;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(getter).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.metadata).toBe(3072);
    Object.defineProperty(raw, "measureText", { value: measureText });
    const method = recording.context.measureText;
    expect(
      Reflect.apply(method, undefined, ["hello"]).actualBoundingBoxLeft,
    ).toBe(2);
    memory.dispose();
    recording.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("releases actual prior path/bounds/group/state owners and native save when late Proxy construction throws null", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, save, restore } = setup();
    const OriginalProxy = Proxy;
    vi.stubGlobal(
      "Proxy",
      new OriginalProxy(OriginalProxy, {
        construct(target, args, newTarget) {
          if (args[0] === ctx) throw null;
          return Reflect.construct(target, args, newTarget);
        },
      }),
    );
    let caught: unknown = "missing";
    try {
      recordVectorPaints(ctx, fallback, { deferPaints: true });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("preserves the original late controller failure when native restore also fails, including without a managed scope", () => {
  const { ctx, save, restore } = setup();
  const OriginalProxy = Proxy;
  restore.mockImplementationOnce(() => {
    throw Error("restore");
  });
  vi.stubGlobal(
    "Proxy",
    new OriginalProxy(OriginalProxy, {
      construct(target, args, newTarget) {
        if (args[0] === ctx) throw null;
        return Reflect.construct(target, args, newTarget);
      },
    }),
  );
  let caught: unknown = "missing";
  try {
    recordVectorPaints(ctx, fallback, { deferPaints: true });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeNull();
  expect(save).toHaveBeenCalledTimes(1);
  expect(restore).toHaveBeenCalledTimes(1);
});
