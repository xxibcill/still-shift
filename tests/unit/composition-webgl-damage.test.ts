import { describe, expect, it } from "vitest";
import { WebglDamage } from "../../packages/renderer-core/src/composition/render/webgl-damage.ts";
import { WebglVisualKey } from "../../packages/renderer-core/src/composition/render/webgl-visual-key.ts";
import type {
  DrawOp,
  IsolateOp,
  RenderOp,
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
const root = (...ops: RenderOp[]): SurfaceNode => ({
  id: "root",
  width: 100,
  height: 80,
  background: [0, 0, 0, 1],
  ops,
});
const isolate = (...ops: RenderOp[]): IsolateOp => ({
  kind: "isolate",
  layer: "group",
  ops,
  effects: [],
  masks: [],
  matte: null,
  opacity: 1,
  blend: "normal",
  clips: [],
});
describe("GPU framebuffer damage", () => {
  it("repaints when the composition color domain changes", () => {
    const damage = new WebglDamage(new WebglVisualKey()),
      scene = root(layer("box", 0));
    damage.next(scene);
    expect(damage.next(scene)).toBeNull();
    expect(
      damage.next({ ...scene, colorSpace: "linear-srgb" }),
    ).toBeUndefined();
    expect(damage.next(scene)).toBeUndefined();
  });
  it("unions nested group coverage across motion, opacity changes and reverse seeks", () => {
    const damage = new WebglDamage(new WebglVisualKey());
    const scene = (x: number, opacity = 1) =>
      root({
        ...isolate(isolate(layer("moving", x)), layer("fixed", 50, 30)),
        opacity,
      });
    expect(damage.next(scene(10))).toBeUndefined();
    expect(damage.next(scene(10))).toBeNull();
    const bounds = { left: 8, top: 8, right: 62, bottom: 42 };
    expect(damage.next(scene(20))).toEqual(bounds);
    expect(damage.next(scene(10, 0.5))).toEqual(bounds);
    expect(damage.next(scene(10))).toEqual(bounds);
  });
  it("includes destination coverage when a matte changes outside the group", () => {
    const damage = new WebglDamage(new WebglVisualKey());
    const scene = (x: number) =>
      root({
        ...isolate(layer("target", 10)),
        matte: {
          mode: "alpha-inverted" as const,
          layer: "mask",
          ops: [layer("mask", x)],
        },
      });
    damage.next(scene(60));
    expect(damage.next(scene(70))).toEqual({
      left: 8,
      top: 8,
      right: 22,
      bottom: 22,
    });
    expect(damage.next(scene(70))).toBeNull();
  });
  it("falls back for nested effects, blends and unknown provider bounds", () => {
    const damage = new WebglDamage(new WebglVisualKey());
    const unknown: DrawOp = {
      ...layer("unknown", 10),
      content: {
        type: "provider",
        key: "unknown",
        time: 0,
        layer: {
          id: "unknown",
          type: "provider",
          provider: "test.unknown@1.0.0",
          params: {},
        },
      },
    };
    const unsupported: IsolateOp[] = [
      {
        ...isolate(layer("blur", 10)),
        effects: [
          {
            id: "blur",
            effect: "blur.gaussian",
            enabled: true,
            params: { radius: 3 },
          },
        ],
      },
      { ...isolate(layer("blend", 10)), blend: "multiply" },
      isolate(unknown),
      isolate({ ...layer("primitive", 10), paintBlur: 3 }),
    ];
    for (const group of unsupported) {
      const scene = root(isolate(group));
      expect(damage.next(scene)).toBeUndefined();
      expect(damage.next(scene)).toBeUndefined();
    }
  });
  it("tracks empty groups and conservatively repaints after group ordering changes", () => {
    const damage = new WebglDamage(new WebglVisualKey());
    const scene = root(isolate());
    damage.next(scene);
    expect(damage.next(scene)).toBeNull();
    expect(damage.next(root(isolate(layer("new", 10))))).toEqual({
      left: 0,
      top: 0,
      right: 22,
      bottom: 22,
    });
    expect(
      damage.next(root({ ...isolate(layer("new", 10)), layer: "replacement" })),
    ).toBeUndefined();
  });
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
