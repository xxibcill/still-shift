import { describe, expect, it } from "vitest";
import { WebglVisualKey } from "../../packages/renderer-core/src/composition/render/webgl-visual-key.ts";
import { WebglIsolates } from "../../packages/renderer-core/src/composition/render/webgl-isolates.ts";
import type {
  IsolateOp,
  ProviderContent,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import type { WebglSurface } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";

const op = (layer: string): IsolateOp => ({
  kind: "isolate",
  layer,
  ops: [],
  effects: [],
  masks: [],
  matte: null,
  opacity: 1,
  blend: "normal",
  clips: [],
});
const surface = (): WebglSurface => ({
  width: 8,
  height: 8,
  opaque: false,
  floating: false,
  screen: false,
  texture: {} as WebGLTexture,
  framebuffer: {} as WebGLFramebuffer,
});

describe("GPU surface reuse", () => {
  it("retains pixel content while outer compositing changes", () => {
    const removed: WebglSurface[] = [];
    const cache = new WebglIsolates(new WebglVisualKey(), (s) =>
      removed.push(s),
    );
    const layer = op("box"),
      like = surface(),
      first = surface();
    expect(cache.render(layer, like, () => first)).toBe(first);
    expect(cache.release(first)).toBe(true);
    expect(
      cache.render(
        {
          ...layer,
          opacity: 0.3,
          blend: "screen",
          clips: [{ matrix: [1, 0, 0, 1, 2, 2], width: 4, height: 4 }],
        },
        like,
        () => {
          throw new Error("Unexpected repaint");
        },
      ),
    ).toBe(first);
    cache.release(first);
    cache.dispose();
    expect(removed).toEqual([first]);
  });

  it("does not evict a borrowed surface or exceed its budget for nested renders", () => {
    const removed: WebglSurface[] = [];
    const cache = new WebglIsolates(
      new WebglVisualKey(),
      (s) => removed.push(s),
      256,
    );
    const like = surface(),
      parent = surface(),
      child = surface();
    expect(
      cache.render(op("parent"), like, () => {
        expect(cache.render(op("child"), like, () => child)).toBe(child);
        cache.release(child);
        return parent;
      }),
    ).toBe(parent);
    expect(removed).toEqual([child]);
    const uncached = surface();
    expect(cache.render(op("other"), like, () => uncached)).toBe(uncached);
    expect(cache.release(uncached)).toBe(false);
    expect(removed).toEqual([child]);
    cache.release(parent);
    cache.dispose();
    expect(removed).toEqual([child, parent]);
  });

  it("repaints changed content and releases each retained surface once", () => {
    const removed: WebglSurface[] = [];
    const cache = new WebglIsolates(new WebglVisualKey(), (s) =>
      removed.push(s),
    );
    const like = surface(),
      first = surface(),
      second = surface(),
      layer = op("box");
    cache.render(layer, like, () => first);
    cache.release(first);
    const changed = {
      ...layer,
      effects: [
        {
          id: "blur",
          effect: "blur.gaussian",
          enabled: true,
          params: { radius: 4 },
        },
      ],
    };
    expect(cache.render(changed, like, () => second)).toBe(second);
    expect(removed).toEqual([first]);
    cache.release(second);
    cache.dispose();
    expect(removed).toEqual([first, second]);
  });
});

describe("GPU visual keys", () => {
  it("only ignores a provider clock with an explicit visual key", () => {
    const layer: ProviderContent["layer"] = {
      id: "rect",
      type: "provider",
      provider: "test.rect@1.0.0",
      params: {},
    };
    const first: ProviderContent = {
      type: "provider",
      key: "rect",
      layer,
      time: 0,
      state: 0,
    };
    const later = { ...first, time: 10, sourceTime: 2 };
    const unknown = new WebglVisualKey();
    expect(unknown.of(first)).not.toBe(unknown.of(later));
    const prepared = new WebglVisualKey(() => "same-pixels");
    expect(prepared.of(first)).toBe(prepared.of(later));
    expect(prepared.of({ ...later, state: 1 })).not.toBe(prepared.of(first));
    expect(
      prepared.of({
        ...later,
        layer: { ...layer, params: { fill: "#ffffff" } },
      }),
    ).not.toBe(prepared.of(first));
  });

  it("shares only Gaussian radii with the same integer kernel", () => {
    const key = new WebglVisualKey();
    const blur = (radius: number) => ({
      effect: "blur.gaussian",
      params: { radius },
    });
    expect(key.of(blur(4))).toBe(key.of(blur(4.1)));
    expect(key.of(blur(4))).not.toBe(key.of(blur(4.6)));
    expect(key.of(blur(0))).toBe(key.of(blur(0.1)));
    expect(key.of({ effect: "light.glow", params: { radius: 0 } })).not.toBe(
      key.of({ effect: "light.glow", params: { radius: 0.1 } }),
    );
  });
});
