import { describe, expect, it } from "vitest";
import { WebglDamage } from "../../packages/renderer-core/src/composition/render/webgl-damage.ts";
import { WebglVisualKey } from "../../packages/renderer-core/src/composition/render/webgl-visual-key.ts";
import type {
  DrawOp,
  SurfaceNode,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
const layer = (id: string, x: number, y = 10): DrawOp => ({
  kind: "draw",
  layer: id,
  content: { type: "solid", width: 10, height: 10, color: [1, 0, 0, 1] },
  matrix: [1, 0, 0, 1, x, y],
  transforms: [[1, 0, 0, 1, x, y]],
  opacity: 1,
  blend: "normal",
  clips: [],
});
const root = (...ops: DrawOp[]): SurfaceNode => ({
  id: "root",
  width: 100,
  height: 80,
  background: [0, 0, 0, 1],
  ops,
});
describe("GPU framebuffer damage", () => {
  it("includes old and new positions while preserving static content", () => {
    const damage = new WebglDamage(new WebglVisualKey());
    expect(
      damage.next(root(layer("static", 70), layer("moving", 10))),
    ).toBeUndefined();
    expect(
      damage.next(root(layer("static", 70), layer("moving", 10))),
    ).toBeNull();
    expect(damage.next(root(layer("static", 70), layer("moving", 20)))).toEqual(
      { left: 8, top: 8, right: 32, bottom: 22 },
    );
    expect(damage.next(root(layer("static", 70), layer("moving", 10)))).toEqual(
      { left: 8, top: 8, right: 32, bottom: 22 },
    );
  });
  it("invalidates ordering, membership, background and unknown geometry", () => {
    const damage = new WebglDamage(new WebglVisualKey());
    const scene = root(layer("first", 10), layer("second", 20));
    damage.next(scene);
    expect(
      damage.next(root(layer("second", 20), layer("first", 10))),
    ).toBeUndefined();
    expect(damage.next(root(layer("first", 10)))).toBeUndefined();
    expect(
      damage.next({ ...root(layer("first", 10)), background: [1, 1, 1, 1] }),
    ).toBeUndefined();
    damage.next(root(layer("first", 10)));
    expect(
      damage.next(root({ ...layer("first", 10), paintBlur: 3 })),
    ).toBeUndefined();
  });
  it("repaints completely around backdrop effects and after exposure invalidation", () => {
    const damage = new WebglDamage(new WebglVisualKey());
    const scene = root(layer("first", 10));
    damage.next(scene);
    damage.reset();
    expect(damage.next(scene)).toBeUndefined();
    expect(
      damage.next({
        ...scene,
        ops: [
          {
            kind: "isolate",
            layer: "fx",
            ops: scene.ops,
            effects: [],
            masks: [],
            matte: null,
            opacity: 1,
            blend: "normal",
            clips: [],
          },
        ],
      }),
    ).toBeUndefined();
    expect(damage.next(scene)).toBeUndefined();
  });
  it("clips damage to the framebuffer and ignores motion wholly outside it", () => {
    const damage = new WebglDamage(new WebglVisualKey());
    damage.next(root(layer("box", 120)));
    expect(damage.next(root(layer("box", 130)))).toBeNull();
    expect(damage.next(root(layer("box", 95)))).toEqual({
      left: 93,
      top: 8,
      right: 100,
      bottom: 22,
    });
  });
});
