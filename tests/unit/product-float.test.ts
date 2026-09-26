import { describe, expect, it } from "vitest";
import fixture from "../../benchmarks/fixtures/ecommerce-motion/a01-beauty-feed.json" with { type: "json" };
import { buildProductFloat } from "../../packages/renderer-core/src/product-float.ts";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
} from "../../packages/renderer-core/src/prepared-scene.ts";

const product = Object.freeze({
  id: "approved-product",
  path: "approved.png",
  sha256: "sha256:" + "a".repeat(64),
  width: 800,
  height: 1000,
});
const options = {
  id: "hero",
  product,
  x: 100,
  y: 160,
  width: 240,
  travel: 18,
  cycleDurationSeconds: 5,
  cycles: 2,
  fps: 30 as const,
};
// Only the scene fields are serialized; bounds belong to composition planning.
const prepare = (clip: ReturnType<typeof buildProductFloat>) => {
  return CommerceSceneSchema.parse({
    ...fixture,
    fps: clip.fps,
    frameCount: clip.frameCount,
    assets: clip.assets,
    nodes: clip.nodes,
    events: clip.events,
  });
};

describe("Product Float component", () => {
  it("works without a background and preserves any product's aspect ratio and source", () => {
    for (const [width, height] of [
      [800, 1000],
      [1400, 600],
    ]) {
      const asset = { ...product, width: width!, height: height! };
      const clip = buildProductFloat({ ...options, product: asset });
      expect(clip.assets).toEqual([asset]);
      expect(clip.nodes).toHaveLength(2);
      const image = clip.nodes[1]!;
      expect(image.width / image.height).toBeCloseTo(
        asset.width / asset.height,
      );
      expect(image.type === "image" && image.states).toEqual([
        { asset: asset.id },
      ]);
      expect(clip.bounds).toEqual({
        x: 100,
        y: 142,
        width: 240,
        height: image.height + 18,
      });
      expect(() => prepare(clip)).not.toThrow();
    }
  });

  it("supports custom travel and cycle duration with deterministic backward seeks at 24/30 fps", () => {
    for (const fps of [24, 30] as const) {
      const clip = buildProductFloat({
        ...options,
        fps,
        travel: 32,
        cycleDurationSeconds: 3,
        cycles: 3,
      });
      expect(clip.frameCount).toBe(fps * 9);
      const scene = compilePreparedScene(prepare(clip));
      const node = clip.nodes[0]!;
      const initial = evaluatePreparedNode(scene, node, 0);
      let highest = Infinity;
      for (let frame = 0; frame < clip.frameCount; frame++) {
        const state = evaluatePreparedNode(scene, node, frame);
        highest = Math.min(highest, state.y);
        expect(state.y).toBeGreaterThanOrEqual(options.y - 32);
        expect(state.y).toBeLessThanOrEqual(options.y);
        expect({ ...state, y: initial.y }).toEqual(initial);
      }
      expect(highest).toBe(options.y - 32);
      expect(evaluatePreparedNode(scene, node, clip.frameCount - 1)).toEqual(
        initial,
      );
      const middle = evaluatePreparedNode(scene, node, 40);
      evaluatePreparedNode(scene, node, 2);
      expect(evaluatePreparedNode(scene, node, 40)).toEqual(middle);
    }
  });

  it("composes independently named products on one timeline", () => {
    const first = buildProductFloat(options);
    const second = buildProductFloat({
      ...options,
      id: "other",
      x: 600,
      travel: 30,
    });
    const scene = prepare({
      ...first,
      nodes: [...first.nodes, ...second.nodes],
      events: [...first.events, ...second.events],
    });
    const compiled = compilePreparedScene(scene);
    expect(new Set(scene.nodes.map((node) => node.id)).size).toBe(4);
    expect(evaluatePreparedNode(compiled, scene.nodes[0]!, 75).y).toBe(142);
    expect(evaluatePreparedNode(compiled, scene.nodes[2]!, 75).y).toBe(130);
  });

  it("preserves the existing production scene's nodes and animation exactly", () => {
    const original = CommerceSceneSchema.parse(fixture);
    const clip = buildProductFloat({
      ...options,
      id: "product",
      product: original.assets[0]!,
      x: 0.275 * 1080,
      y: 0.12 * 1350,
      width: 0.55 * 1080,
    });
    expect(clip.nodes).toEqual(original.nodes.slice(1));
    expect(clip.events).toEqual(original.events);
  });

  it("rejects invalid geometry, timing and assets before returning a clip", () => {
    for (const change of [
      { travel: -1 },
      { travel: NaN },
      { x: Infinity },
      { width: 0 },
      { cycleDurationSeconds: 0 },
      { cycleDurationSeconds: 0.01 },
      { cycles: 1.5 },
      { cycles: 0 },
      { cycles: 51 },
      { cycleDurationSeconds: 100000 },
      { id: "invalid id" },
      { product: { ...product, height: 0 } },
    ])
      expect(() => buildProductFloat({ ...options, ...change })).toThrow();
  });
});
