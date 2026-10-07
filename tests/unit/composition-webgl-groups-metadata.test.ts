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
it("keeps original merged bounds and selected commands admitted through actual replay, then clears returned data", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, fillRect } = setup(),
      recording = recordVectorPaints(ctx, fallback);
    memory.beginScratch();
    recording.context.fillRect(1, 1, 2, 2);
    recording.context.fillRect(20, 10, 2, 2);
    const before = memory.statistics.current.metadata,
      groups = recording.groups()!,
      selected = groups[0]!.selected;
    expect(groups).toHaveLength(1);
    expect([...selected]).toEqual([0, 1]);
    expect(groups[0]!.bounds).toEqual({
      left: 0,
      top: 0,
      right: 24,
      bottom: 14,
    });
    const commands = groups[0]!.commands;
    const firstCommand = commands[0]!;
    const args = "method" in firstCommand ? firstCommand.args : undefined;
    expect(commands).toHaveLength(2);
    expect(args).toEqual([1, 1, 2, 2]);
    const retained = memory.statistics.current.metadata;
    expect(retained).toBeGreaterThan(before);
    fillRect.mockClear();
    fillRect.mockImplementation(() => {
      expect(memory.statistics.current.metadata).toBeGreaterThan(retained);
    });
    replayVectorPaints(ctx, groups[0]!);
    expect(fillRect).toHaveBeenCalledTimes(2);
    expect(fillRect).toHaveBeenNthCalledWith(1, 1, 1, 2, 2);
    expect(fillRect).toHaveBeenNthCalledWith(2, 20, 10, 2, 2);
    expect(memory.statistics.current.metadata).toBe(retained);
    recording.dispose();
    expect(groups).toHaveLength(0);
    expect(selected.size).toBe(0);
    expect(commands).toHaveLength(0);
    expect(args).toHaveLength(0);
    memory.endScratch();
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("denies group capacity before original flattening and rolls back the cleanup slot without disturbing prior paints", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, fillRect } = setup(),
      recording = recordVectorPaints(ctx, fallback);
    recording.context.fillRect(1, 1, 2, 2);
    const before = memory.statistics.current.metadata,
      blocker = memory.reserve(
        "metadata",
        limits.metadata - before - 40 - 2047,
      ),
      flatten = vi.spyOn(Array.prototype, "flatMap");
    expect(() => recording.groups()).toThrow("metadata");
    expect(flatten).not.toHaveBeenCalled();
    expect(fillRect).toHaveBeenCalledTimes(1);
    blocker.release();
    expect(memory.statistics.current.metadata).toBe(before);
    flatten.mockRestore();
    expect(recording.groups()![0]!.bounds).toEqual({
      left: 0,
      top: 0,
      right: 5,
      bottom: 5,
    });
    recording.dispose();
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("preserves shadow pair order and shares the original selected Set while retaining one selected-data owner", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, raw } = setup();
    raw.shadowOffsetX = 1;
    const recording = recordVectorPaints(ctx, fallback);
    recording.context.fillRect(10, 10, 2, 2);
    const groups = recording.groups()!,
      selected = groups[0]!.selected;
    expect(groups.map((group) => group.shadow)).toEqual(["only", "none"]);
    expect(groups[1]!.selected).toBe(selected);
    expect(groups[1]!.bounds).toBe(groups[0]!.bounds);
    expect([...selected]).toEqual([0]);
    expect(groups[0]!.shadowRight).toBe(15);
    expect(memory.statistics.current.metadata).toBeGreaterThan(848);
    recording.dispose();
    expect(groups).toHaveLength(0);
    expect(selected.size).toBe(0);
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("retains independently produced group arrays until recording teardown and clears every actual result", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx } = setup(),
      recording = recordVectorPaints(ctx, fallback);
    recording.context.fillRect(1, 1, 2, 2);
    const first = recording.groups()!,
      selected = first[0]!.selected,
      before = memory.statistics.current.metadata;
    const second = recording.groups()!,
      other = second[0]!.selected;
    expect(second).not.toBe(first);
    expect(other).not.toBe(selected);
    expect([...other]).toEqual([...selected]);
    expect(memory.statistics.current.metadata).toBeGreaterThan(before);
    recording.dispose();
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(0);
    expect(selected.size).toBe(0);
    expect(other.size).toBe(0);
    memory.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
  });
});
it("preserves null original flattening failure, releases incomplete group geometry and survives allocator-first cleanup", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx } = setup(),
      recording = recordVectorPaints(ctx, fallback);
    recording.context.fillRect(1, 1, 2, 2);
    const before = memory.statistics.current.metadata,
      flatten = vi
        .spyOn(Array.prototype, "flatMap")
        .mockImplementationOnce(() => {
          throw null;
        });
    let caught: unknown = "missing";
    try {
      recording.groups();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(memory.statistics.current.metadata).toBe(before);
    flatten.mockRestore();
    const groups = recording.groups()!,
      selected = groups[0]!.selected;
    memory.dispose();
    expect(groups).toHaveLength(0);
    expect(selected.size).toBe(0);
    recording.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
  });
});
it("keeps original empty and unsupported grouping behavior without native paint replay", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { ctx, raw, fillRect } = setup(),
      empty = recordVectorPaints(ctx, fallback),
      result = empty.groups()!;
    expect(result).toEqual([]);
    expect(fillRect).not.toHaveBeenCalled();
    empty.dispose();
    expect(result).toEqual([]);
    expect(memory.statistics.current.metadata).toBe(0);
    raw.globalCompositeOperation = "destination-out";
    const unsupported = recordVectorPaints(ctx, fallback);
    unsupported.context.fillRect(1, 1, 2, 2);
    const before = memory.statistics.current.metadata;
    expect(unsupported.groups()).toBeUndefined();
    expect(memory.statistics.current.metadata).toBe(before);
    expect(fillRect).toHaveBeenCalledTimes(1);
    unsupported.dispose();
    memory.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});
