import { expect, it, vi } from "vitest";
import type { Composition } from "@still-shift/scene-contract";
import type { RenderBackend } from "../../packages/renderer-core/src/composition/render/backend.ts";
import {
  createCompositionFrameCache,
  releaseCompositionFrameCache,
  renderCompositionExposure,
} from "../../packages/renderer-core/src/composition/render/exposure.ts";
import { WebglVisualKey } from "../../packages/renderer-core/src/composition/render/webgl-visual-key.ts";
import type { ManagedMetadataText } from "../../packages/renderer-core/src/managed-metadata.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

function composition(moving = false): Composition {
  return {
    schemaVersion: "composition-1",
    id: "frame-key",
    width: 32,
    height: 24,
    fps: 30,
    frameCount: 12,
    assets: [],
    motionBlur: {
      enabled: true,
      shutterAngle: 180,
      shutterPhase: 0,
      samples: 4,
    },
    layers: [
      {
        id: "box",
        type: "solid",
        size: [4, 4],
        color: "#ffffff",
        motionBlur: true,
        transform: {
          position: {
            x: moving
              ? {
                  keys: [
                    { frame: 0, value: 0 },
                    { frame: 11, value: 22, interpolation: "linear" },
                  ],
                }
              : 8,
            y: 8,
          },
        },
      },
    ],
  };
}
function harness() {
  const keys = new WebglVisualKey(),
    texts: ManagedMetadataText[] = [],
    clear = vi.fn();
  const backend: RenderBackend = {
    version: "metadata-control-test",
    createSurface: (width, height) => ({ width, height }),
    releaseSurface() {},
    clear,
    fillRect() {},
    drawImage() {},
    drawText() {},
    drawShape() {},
    drawProvider() {},
    composite() {},
    applyEffects() {},
    applyMask() {},
    applyMatte() {},
    lerp() {},
    readPixels: () => new Uint8ClampedArray(),
    accumulateExposure(_target, count, draw) {
      for (let index = 0; index < count; index++) draw(index);
    },
    frameMetadataKey(root) {
      const text = keys.metadata(root);
      texts.push(text);
      return text;
    },
  };
  return { backend, keys, texts, clear };
}
const limits = { pixels: 1, metadata: 65536 };

it("retains only the current exact key across scratch and releases replacement keys", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const cache = createCompositionFrameCache(),
      { backend, keys, texts, clear } = harness();
    const doc = composition(),
      target = { width: doc.width, height: doc.height };
    let retainedBytes = 0;
    for (let frame = 2; frame < 6; frame++) {
      memory.beginScratch();
      const previous = cache.keyOwner;
      const report = renderCompositionExposure(
        backend,
        target,
        doc,
        frame,
        {},
        cache,
      );
      expect(report.samples).toBe(frame === 2 ? 1 : 0);
      const native = new WebglVisualKey();
      expect(cache.key).toBe(native.of(cache.root));
      native.dispose();
      if (previous) expect(previous.value).toBeUndefined();
      memory.endScratch();
      expect(cache.keyOwner!.value).toBe(cache.key);
      expect(texts.filter((text) => text.value !== undefined)).toEqual([
        cache.keyOwner,
      ]);
      if (frame === 2) retainedBytes = memory.statistics.current.metadata;
      expect(memory.statistics.current.metadata).toBe(retainedBytes);
      expect(memory.statistics.reservations).toBe(3);
    }
    expect(clear).toHaveBeenCalledTimes(1);
    releaseCompositionFrameCache(cache);
    expect(cache).toEqual({
      root: undefined,
      key: undefined,
      keyOwner: undefined,
    });
    expect(memory.statistics.current.metadata).toBe(256);
    keys.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("releases first and shutter comparison keys when no frame cache retains them", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const { backend, keys, texts } = harness(),
      doc = composition();
    memory.beginScratch();
    expect(renderCompositionExposure(backend, doc, doc, 5).samples).toBe(1);
    expect(texts).toHaveLength(4);
    expect(texts.every((text) => text.value === undefined)).toBe(true);
    expect(memory.statistics.current.metadata).toBe(256);
    memory.endScratch();
    keys.dispose();
    memory.dispose();
  });
});

it("invalidates the retained key before moving exposures consume the target", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const cache = createCompositionFrameCache(),
      { backend, keys, texts, clear } = harness();
    const doc = composition(),
      moving = composition(true);
    renderCompositionExposure(backend, doc, doc, 5, {}, cache);
    const previous = cache.keyOwner!;
    const accumulate = backend.accumulateExposure;
    backend.accumulateExposure = (...args) => {
      expect(cache.root).toBeUndefined();
      expect(cache.key).toBeUndefined();
      expect(previous.value).toBeUndefined();
      return accumulate(...args);
    };
    expect(
      renderCompositionExposure(backend, moving, moving, 5, {}, cache).samples,
    ).toBe(4);
    expect(clear).toHaveBeenCalledTimes(5);
    expect(texts.every((text) => text.value === undefined)).toBe(true);
    expect(memory.statistics.current.metadata).toBe(448);
    releaseCompositionFrameCache(cache);
    keys.dispose();
    memory.dispose();
  });
});

it("drops previous and new keys before propagating an original null draw failure", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const cache = createCompositionFrameCache(),
      { backend, keys, texts, clear } = harness();
    const doc = composition();
    renderCompositionExposure(backend, doc, doc, 5, {}, cache);
    const previous = cache.keyOwner!;
    const changed = composition();
    changed.layers[0]!.transform!.opacity = 0.5;
    clear.mockImplementation(() => {
      expect(previous.value).toBeUndefined();
      throw null;
    });
    let caught: unknown = "missing";
    try {
      renderCompositionExposure(backend, changed, changed, 5, {}, cache);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeNull();
    expect(cache.root).toBeUndefined();
    expect(cache.key).toBeUndefined();
    expect(texts.every((text) => text.value === undefined)).toBe(true);
    expect(memory.statistics.current.metadata).toBe(448);
    releaseCompositionFrameCache(cache);
    keys.dispose();
    memory.dispose();
  });
});

it("denies new key serialization before drawing and preserves the previous retained frame", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const cache = createCompositionFrameCache(),
      { backend, keys, clear } = harness();
    const doc = composition();
    renderCompositionExposure(backend, doc, doc, 5, {}, cache);
    const previous = cache.keyOwner!,
      root = cache.root,
      bytes = memory.statistics.current.metadata;
    const blocker = memory.reserve("metadata", limits.metadata - bytes - 128);
    expect(() =>
      renderCompositionExposure(backend, doc, doc, 6, {}, cache),
    ).toThrow("metadata");
    expect(clear).toHaveBeenCalledTimes(1);
    expect(cache.root).toBe(root);
    expect(cache.keyOwner).toBe(previous);
    expect(previous.value).toBe(cache.key);
    blocker.release();
    expect(memory.statistics.current.metadata).toBe(bytes);
    releaseCompositionFrameCache(cache);
    keys.dispose();
    expect(memory.statistics.current.metadata).toBe(0);
    memory.dispose();
  });
});

it("admits frame cache control before construction and clears it on allocator disposal", async () => {
  const small = new ManagedMemory({ pixels: 1, metadata: 191 });
  await withManagedMemory(small, async () => {
    expect(createCompositionFrameCache).toThrow("metadata");
    expect(small.statistics.reservations).toBe(0);
    small.dispose();
  });
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const cache = createCompositionFrameCache(),
      { backend, keys, texts } = harness(),
      doc = composition();
    renderCompositionExposure(backend, doc, doc, 5, {}, cache);
    memory.dispose();
    expect(cache.root).toBeUndefined();
    expect(cache.key).toBeUndefined();
    expect(texts.every((text) => text.value === undefined)).toBe(true);
    releaseCompositionFrameCache(cache);
    keys.dispose();
    expect(memory.statistics.reservations).toBe(0);
  });
});

it("preserves legacy native frame keys and the structural comparison fallback", () => {
  for (const key of [true, false]) {
    const { backend, keys, clear } = harness(),
      doc = composition(),
      moving = composition(true),
      cache = createCompositionFrameCache();
    delete backend.frameMetadataKey;
    if (key) backend.frameKey = (root) => keys.of(root);
    expect(
      renderCompositionExposure(backend, doc, doc, 5, {}, cache).samples,
    ).toBe(1);
    expect(
      renderCompositionExposure(backend, doc, doc, 6, {}, cache).samples,
    ).toBe(0);
    expect(
      renderCompositionExposure(backend, moving, moving, 5, {}, cache).samples,
    ).toBe(4);
    expect(clear).toHaveBeenCalledTimes(5);
    releaseCompositionFrameCache(cache);
    keys.dispose();
  }
});
