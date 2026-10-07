import { expect, it, vi } from "vitest";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { WebglVectors } from "../../packages/renderer-core/src/composition/render/webgl-vectors.ts";
import { WebglVisualKey } from "../../packages/renderer-core/src/composition/render/webgl-visual-key.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type { Canvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import type { WebglPaint } from "../../packages/renderer-core/src/composition/render/webgl-paint.ts";
import type { VectorDraw } from "../../packages/renderer-core/src/composition/render/backend.ts";
import type { Bounds } from "../../packages/renderer-core/src/composition/evaluate/types.ts";
import type { ManagedMetadataText } from "../../packages/renderer-core/src/managed-metadata.ts";

const box = { left: 0, top: 0, right: 16, bottom: 16 };
const surface = (width = 32, height = 24) =>
  ({ width, height }) as WebglSurface;
const op = (layer = "box", opacity = 1): VectorDraw => ({
  kind: "draw",
  layer,
  content: { type: "solid", width: 4, height: 4, color: [1, 0, 0, 1] },
  opacity,
  matrix: [1, 0, 0, 1, 0, 0],
  transforms: [[1, 0, 0, 1, 0, 0]],
  blend: "normal",
  clips: [],
});
// These fixtures verify key/control ownership. Actual native raster pixels remain browser oracles.
function harness() {
  const keys = new WebglVisualKey(),
    release = vi.fn(),
    drawMany = vi.fn();
  const cache = new WebglVectors(
    { release } as unknown as WebglDevice,
    {} as Canvas2dBackend,
    keys,
    { hasBackdrop: () => false, drawMany } as unknown as WebglPaint,
  );
  const geometry = cache as unknown as {
    extent(ops: VectorDraw[], dst: WebglSurface): Bounds;
    paint(
      dst: WebglSurface,
      ops: VectorDraw[],
      rect: Bounds,
    ): { surface: WebglSurface; rect: Bounds; primitive: boolean }[];
  };
  vi.spyOn(geometry, "extent").mockImplementation(() => box);
  const paint = vi
    .spyOn(geometry, "paint")
    .mockImplementation((_dst, _ops, rect) => [
      { surface: surface(), rect, primitive: false },
    ]);
  const state = cache as unknown as {
    state: {
      cached: Map<
        string,
        {
          id: ManagedMetadataText;
          key: ManagedMetadataText;
          entry: { key: string } | undefined;
        }
      >;
    };
  };
  return { cache, keys, release, drawMany, paint, state };
}
const limits = { pixels: 1, metadata: 65536 };
it("retains exact native vector IDs/signatures and the actual Map key owner through repeated hits", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { cache, keys, paint, state, release } = harness(),
      dst = surface(),
      ops = [op()];
    let bytes = 0,
      owner: { id: ManagedMetadataText; key: ManagedMetadataText } | undefined;
    for (let n = 0; n < 4; n++) {
      memory.beginScratch();
      expect(cache.draw(dst, ops)).toEqual(box);
      memory.endScratch();
      const id = JSON.stringify([
        dst.width,
        dst.height,
        ops.map((value) => value.layer),
      ]);
      expect([...state.state.cached.keys()]).toEqual([id]);
      const current = state.state.cached.get(id)!;
      expect(current.id.value).toBe(id);
      const native = new WebglVisualKey();
      expect(current.key.value).toBe(native.of([ops, false]));
      native.dispose();
      if (!n) {
        bytes = memory.statistics.current.metadata;
        owner = current;
      }
      expect(current).toBe(owner);
      expect(memory.statistics.current.metadata).toBe(bytes);
      expect(memory.statistics.reservations).toBe(5);
    }
    expect(paint).toHaveBeenCalledTimes(1);
    const previous = owner!;
    memory.beginScratch();
    cache.draw(dst, [op("box", 0.5)]);
    memory.endScratch();
    expect(previous.key.value).toBeUndefined();
    expect(previous.id.value).toBeUndefined();
    expect(release).toHaveBeenCalledTimes(1);
    cache.dispose();
    keys.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    expect(memory.statistics.reservations).toBe(0);
    memory.dispose();
  });
});
it("denies vector metadata before native ID map and raster production", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 512 });
  await withManagedMemory(memory, async () => {
    const { cache, keys, paint } = harness(),
      ops = [op()],
      map = vi.spyOn(ops, "map");
    // Public grouping maps before entering the selected key producer; call its genuine batch boundary.
    const batch = cache as unknown as {
      drawBatch(
        dst: WebglSurface,
        ops: VectorDraw[],
        rect: Bounds,
      ): Bounds | null;
    };
    expect(() => batch.drawBatch(surface(), ops, box)).toThrow("metadata");
    expect(map).not.toHaveBeenCalled();
    expect(paint).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(512);
    cache.dispose();
    keys.dispose();
    memory.dispose();
  });
});
it("rolls back vector Map capacity and temporary keys after an original null raster failure", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { cache, keys, paint, state } = harness();
    paint.mockImplementation(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      cache.draw(surface(), [op()]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(state.state.cached.size).toBe(0);
    expect(memory.statistics.current.metadata).toBe(512);
    expect(memory.statistics.reservations).toBe(2);
    cache.dispose();
    keys.dispose();
    memory.dispose();
  });
});
it("preserves a complete retained raster after a null drawing failure and reuses its owned keys", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { cache, keys, paint, drawMany, state, release } = harness();
    drawMany.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      cache.draw(surface(), [op()]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(state.state.cached.size).toBe(1);
    memory.beginScratch();
    expect(cache.draw(surface(), [op()])).toEqual(box);
    memory.endScratch();
    expect(paint).toHaveBeenCalledTimes(1);
    cache.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    keys.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("visits all vector entries and releases their keys while preserving the first null discard failure", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { cache, keys, release, state } = harness();
    cache.draw(surface(), [op("first")]);
    cache.draw(surface(), [op("second")]);
    const entries = [...state.state.cached.values()];
    release.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      cache.dispose();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(release).toHaveBeenCalledTimes(2);
    expect(state.state.cached.size).toBe(0);
    expect(
      entries.every(
        (value) =>
          value.id.value === undefined &&
          value.key.value === undefined &&
          value.entry === undefined,
      ),
    ).toBe(true);
    expect(memory.statistics.current.metadata).toBe(256);
    keys.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("cleans non-retained vector keys after the original byte policy and remains safe after allocator-first disposal", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { cache, keys, paint, state, release } = harness();
    paint.mockImplementationOnce((_dst, _ops, rect) => [
      { surface: surface(8192, 8192), rect, primitive: false },
    ]);
    expect(cache.draw(surface(), [op()])).toEqual(box);
    expect(state.state.cached.size).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
    expect(memory.statistics.current.metadata).toBe(512);
    cache.draw(surface(), [op()]);
    const entry = [...state.state.cached.values()][0]!;
    memory.dispose();
    expect(entry.id.value).toBeUndefined();
    expect(entry.key.value).toBeUndefined();
    expect(state.state.cached.size).toBe(0);
    expect(release).toHaveBeenCalledTimes(2);
    cache.dispose();
    keys.dispose();
    expect(memory.statistics.reservations).toBe(0);
    expect(() => cache.draw(surface(), [op()])).toThrow("disposed");
  });
});

function nativePartHarness() {
  const keys = new WebglVisualKey(),
    release = vi.fn(),
    uploadRegion = vi.fn(),
    nativeSurface = vi.fn((width: number, height: number) =>
      surface(width, height),
    );
  const pixels = {
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    width: 32,
    height: 24,
  };
  const createSurface = vi.fn(() => pixels),
    releaseSurface = vi.fn(),
    fillRect = vi.fn();
  const cache = new WebglVectors(
    { release, surface: nativeSurface, uploadRegion } as unknown as WebglDevice,
    { createSurface, releaseSurface, fillRect } as unknown as Canvas2dBackend,
    keys,
    { hasBackdrop: () => false, drawMany: vi.fn() } as unknown as WebglPaint,
  );
  const geometry = cache as unknown as {
    extent(ops: VectorDraw[], dst: WebglSurface): Bounds;
  };
  vi.spyOn(geometry, "extent").mockImplementation(() => box);
  const state = cache as unknown as {
    state: {
      cached: Map<
        string,
        {
          entry:
            | {
                parts: {
                  surface: WebglSurface;
                  rect: Bounds;
                  primitive: boolean;
                }[];
              }
            | undefined;
        }
      >;
    };
  };
  return {
    keys,
    cache,
    state,
    createSurface,
    releaseSurface,
    fillRect,
    nativeSurface,
    uploadRegion,
    release,
  };
}
it("retains the actual RasterPart container and independent bounds through frame cleanup", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const {
      keys,
      cache,
      state,
      releaseSurface,
      nativeSurface,
      uploadRegion,
      release,
    } = nativePartHarness();
    memory.beginScratch();
    cache.draw(surface(), [op()]);
    memory.endScratch();
    const parts = [...state.state.cached.values()][0]!.entry!.parts;
    expect(memory.owns(parts)).toBe(true);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.rect).toEqual(box);
    expect(parts[0]!.rect).not.toBe(box);
    expect(parts[0]!.primitive).toBe(true);
    expect(nativeSurface).toHaveBeenCalledTimes(1);
    expect(uploadRegion).toHaveBeenCalledTimes(1);
    expect(releaseSurface).toHaveBeenCalledTimes(1);
    const before = memory.statistics.current.metadata;
    memory.beginScratch();
    cache.draw(surface(), [op()]);
    memory.endScratch();
    expect(memory.statistics.current.metadata).toBe(before);
    expect(nativeSurface).toHaveBeenCalledTimes(1);
    cache.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    expect(memory.owns(parts)).toBe(false);
    expect(parts).toEqual([]);
    keys.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});
it("releases an already-created raster scratch surface when part-container admission is denied", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const {
      keys,
      cache,
      createSurface,
      releaseSurface,
      nativeSurface,
      fillRect,
    } = nativePartHarness();
    let blocker: ReturnType<ManagedMemory["reserve"]> | undefined;
    createSurface.mockImplementationOnce(() => {
      blocker = memory.reserve(
        "metadata",
        limits.metadata - memory.statistics.current.metadata - 31,
      );
      return {
        canvas: {} as HTMLCanvasElement,
        ctx: {} as CanvasRenderingContext2D,
        width: 32,
        height: 24,
      };
    });
    expect(() => cache.draw(surface(), [op()])).toThrow("metadata");
    expect(releaseSurface).toHaveBeenCalledTimes(1);
    expect(nativeSurface).not.toHaveBeenCalled();
    expect(fillRect).not.toHaveBeenCalled();
    blocker!.release();
    expect(memory.statistics.current.metadata).toBe(512);
    expect(memory.statistics.reservations).toBe(2);
    cache.dispose();
    keys.dispose();
    memory.dispose();
  });
});
it("admits part records and their bounds before GPU production, cleaning args and scratch on denial", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { keys, cache, releaseSurface, nativeSurface, fillRect } =
      nativePartHarness();
    let blocker: ReturnType<ManagedMemory["reserve"]> | undefined;
    fillRect.mockImplementationOnce(() => {
      blocker = memory.reserve(
        "metadata",
        limits.metadata - memory.statistics.current.metadata,
      );
    });
    expect(() => cache.draw(surface(), [op()])).toThrow("metadata");
    expect(fillRect).toHaveBeenCalledTimes(1);
    expect(nativeSurface).not.toHaveBeenCalled();
    expect(releaseSurface).toHaveBeenCalledTimes(1);
    blocker!.release();
    expect(memory.statistics.current.metadata).toBe(512);
    expect(memory.statistics.reservations).toBe(2);
    cache.dispose();
    keys.dispose();
    memory.dispose();
  });
});
it("drops actual part and call-argument references while preserving a null upload failure", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const {
      keys,
      cache,
      nativeSurface,
      uploadRegion,
      releaseSurface,
      release,
      state,
    } = nativePartHarness();
    uploadRegion.mockImplementationOnce(() => {
      throw null;
    });
    let caught: unknown = "missing";
    try {
      cache.draw(surface(), [op()]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(nativeSurface).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(releaseSurface).toHaveBeenCalledTimes(1);
    expect(state.state.cached.size).toBe(0);
    expect(memory.statistics.current.metadata).toBe(512);
    expect(memory.statistics.reservations).toBe(2);
    cache.dispose();
    keys.dispose();
    memory.dispose();
  });
});
