import { describe, expect, it } from "vitest";
import {
  compositionSurfaceVisualKey,
  compositionSurfaceVisualMetadata,
} from "../../packages/renderer-core/src/composition/render/surface-cache.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

describe("cross-page composition surface identity", () => {
  it("owns canonical text through explicit retention and preserves original normalization/getter/callback output", async () => {
    let reads = 0,
      keys = 0;
    const content = {
      type: "provider",
      layer: { id: "p" },
      time: 3,
      sourceTime: 3,
      get payload() {
        reads++;
        return { z: "ไทย", a: [null, true] };
      },
      effects: [
        { effect: "blur.gaussian", params: { radius: 2.01, quality: 3 } },
      ],
    };
    const key = () => {
      keys++;
      return "static";
    };
    const original = compositionSurfaceVisualKey(content, key);
    expect(reads).toBe(1);
    expect(keys).toBe(1);
    reads = keys = 0;
    const memory = new ManagedMemory({ pixels: 1, metadata: 65536 });
    await withManagedMemory(memory, async () => {
      memory.beginScratch();
      const text = compositionSurfaceVisualMetadata(content, key);
      expect(text.value).toBe(original);
      expect(reads).toBe(1);
      expect(keys).toBe(1);
      expect(memory.statistics.reservations).toBe(1);
      text.retain();
      memory.endScratch();
      expect(text.value).toBe(original);
      text.release();
      expect(text.value).toBe(undefined);
      expect(memory.statistics.current.metadata).toBe(0);
      memory.dispose();
    });
  });
  it("denies prepared normalization before its original spread reads payload getters", async () => {
    const memory = new ManagedMemory({ pixels: 1, metadata: 256 });
    let reads = 0,
      keys = 0;
    await withManagedMemory(memory, async () => {
      expect(() =>
        compositionSurfaceVisualMetadata(
          {
            type: "provider",
            layer: { id: "p" },
            time: 3,
            get payload() {
              reads++;
              return "original";
            },
          },
          () => {
            keys++;
            return "static";
          },
        ),
      ).toThrow("aggregate worker quota");
      expect(reads).toBe(0);
      expect(keys).toBe(1);
      expect(memory.statistics.reservations).toBe(0);
      memory.dispose();
    });
  });
  it("retains full definitions independently of allocation and visit order", () => {
    const state = {
      type: "text",
      layer: { id: "title", states: [{ text: "First" }] },
      time: 2,
    };
    const key = compositionSurfaceVisualKey(state);
    compositionSurfaceVisualKey({
      type: "text",
      layer: { id: "other" },
      time: 0,
    });
    expect(compositionSurfaceVisualKey(structuredClone(state))).toBe(key);
    const changed = structuredClone(state);
    changed.layer.states[0]!.text = "Second";
    expect(compositionSurfaceVisualKey(changed)).not.toBe(key);
  });
  it("sorts object properties but preserves authored array order", () => {
    expect(compositionSurfaceVisualKey({ a: 1, b: { x: 2, y: 3 } })).toBe(
      compositionSurfaceVisualKey({ b: { y: 3, x: 2 }, a: 1 }),
    );
    expect(compositionSurfaceVisualKey([1, 2])).not.toBe(
      compositionSurfaceVisualKey([2, 1]),
    );
  });
  it("does not mistake authored text or provider definitions for prepared draw content", () => {
    const key = compositionSurfaceVisualKey(
      {
        type: "provider",
        layer: {
          type: "provider",
          id: "p",
          provider: "paint",
          params: {},
        },
        time: 2,
      },
      (content) => {
        expect(content.layer.id).toBe("p");
        return "static";
      },
    );
    expect(key).toContain('"provider":"paint"');
  });
  it("removes provider clocks only when actual prepared content proves identity", () => {
    const first = {
      type: "provider",
      layer: { id: "p" },
      time: 1,
      sourceTime: 1,
    };
    const second = { ...first, time: 2, sourceTime: 2 };
    expect(compositionSurfaceVisualKey(first)).not.toBe(
      compositionSurfaceVisualKey(second),
    );
    expect(compositionSurfaceVisualKey(first, () => "static")).toBe(
      compositionSurfaceVisualKey(second, () => "static"),
    );
    expect(
      compositionSurfaceVisualKey(second, () => "native-frame-2"),
    ).not.toBe(compositionSurfaceVisualKey(first, () => "native-frame-1"));
  });
  it("retains evaluated transforms, alpha, native ordinals and source hashes", () => {
    const state = {
      matrix: [1, 0, 0, 1, 0, 0],
      opacity: 0.5,
      sources: [{ asset: "source", sha256: "original" }],
      media: {
        sourceHash: "original",
        pair: { first: 3, second: 4, mix: 0.5 },
      },
    };
    const key = compositionSurfaceVisualKey(state);
    for (const change of [
      { ...state, opacity: 1 },
      { ...state, matrix: [1, 0, 0, 1, 1, 0] },
      { ...state, media: { ...state.media, sourceHash: "replacement" } },
      {
        ...state,
        media: { ...state.media, pair: { ...state.media.pair, first: 4 } },
      },
      { ...state, sources: [{ asset: "source", sha256: "replacement" }] },
    ])
      expect(compositionSurfaceVisualKey(change)).not.toBe(key);
  });
  it("normalizes Gaussian radius to the real box kernel while retaining other effects", () => {
    const blur = { effect: "blur.gaussian", params: { radius: 2 } };
    expect(compositionSurfaceVisualKey(blur)).toBe(
      compositionSurfaceVisualKey({ ...blur, params: { radius: 2.01 } }),
    );
    expect(compositionSurfaceVisualKey(blur)).not.toBe(
      compositionSurfaceVisualKey({ ...blur, params: { radius: 8 } }),
    );
    expect(
      compositionSurfaceVisualKey({
        effect: "blur.lens",
        params: { radius: 2 },
      }),
    ).not.toBe(
      compositionSurfaceVisualKey({
        effect: "blur.lens",
        params: { radius: 2.01 },
      }),
    );
  });
});
