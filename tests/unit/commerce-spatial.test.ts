import { describe, it, expect } from "vitest";
import fixture from "../../benchmarks/fixtures/ecommerce-motion/a01-beauty-feed.json" with { type: "json" };
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { buildProductLayer } from "../../packages/renderer-core/src/product-layer.ts";
import {
  resolveProductAnchor,
  fitVisibleProduct,
  evaluateAttachedPath,
} from "../../packages/renderer-core/src/commerce-geometry.ts";
import {
  buildScaleMotion,
  buildRotateMotion,
} from "../../packages/renderer-core/src/commerce-motion.ts";
import { buildDetailWindow } from "../../packages/renderer-core/src/commerce-detail.ts";
import { sequenceCommerceFragments } from "../../packages/renderer-core/src/commerce-sequence.ts";
const original = CommerceSceneSchema.parse(fixture);
const asset = original.assets[0]!;
const layer = buildProductLayer({
  id: "hero",
  product: asset,
  x: 100,
  y: 200,
  width: asset.width / 2,
});
const geometry = {
  node: "hero-art",
  asset: asset.id,
  sha256: asset.sha256,
  visibleBounds: [300, 80, 510, 1240],
  anchors: { cap: [560, 170] },
  protectedRegions: [[400, 600, 300, 250]],
};
const base = () => ({
  ...original,
  nodes: structuredClone(layer.nodes),
  events: [],
  geometry: [geometry],
  metadata: { ...original.metadata, registration: { status: "experimental" } },
});
describe("commerce spatial primitives", () => {
  it("resolves original image coordinates and fractional motion through parent transforms", () => {
    const scene = compileCommerceScene(
      CommerceSceneSchema.parse({
        ...base(),
        events: [
          {
            node: "hero",
            property: "x",
            start: 0,
            end: 30,
            from: 100,
            to: 160,
            easing: "linear",
          },
        ],
      }),
    );
    expect(resolveProductAnchor(scene, "hero-art", "cap", 15.5)).toEqual([
      411, 285,
    ]);
    expect(resolveProductAnchor(scene, "hero-art", "cap", 0)).toEqual([
      380, 285,
    ]);
  });
  it("rejects stale geometry and invalid landmarks", () => {
    expect(() =>
      CommerceSceneSchema.parse({
        ...base(),
        geometry: [{ ...geometry, sha256: "sha256:" + "0".repeat(64) }],
      }),
    ).toThrow(/hash/);
    expect(() =>
      CommerceSceneSchema.parse({
        ...base(),
        geometry: [{ ...geometry, anchors: { cap: [9999, 0] } }],
      }),
    ).toThrow(/bounds/);
  });
  it("fits visible bounds without altering source proportions", () => {
    const fit = fitVisibleProduct(asset, [300, 80, 510, 1240], {
      x: 0,
      y: 0,
      width: 510,
      height: 1240,
    });
    expect(fit).toEqual({
      x: -300,
      y: -80,
      width: asset.width,
      height: asset.height,
    });
  });
  it("builds uniform scale and rotation events with explicit validation", () => {
    const clock = { fps: 30 as const, frameCount: 120 };
    const options = { target: "hero", start: 0, end: 30, from: 1, to: 1.1 };
    expect(buildScaleMotion(clock, options).map((e) => e.property)).toEqual([
      "scaleX",
      "scaleY",
    ]);
    expect(
      buildRotateMotion(clock, { ...options, from: 0, to: 3 })[0]!.to,
    ).toBe(3);
    expect(() => buildScaleMotion(clock, { ...options, to: -1 })).toThrow();
  });
  it("keeps detail references intact and validates source resolution", () => {
    const detail = buildDetailWindow({
      id: "detail",
      product: asset,
      crop: [300, 80, 500, 300],
      box: { x: 0, y: 0, width: 250, height: 150 },
    });
    expect(detail.assets![0]!.sha256).toBe(asset.sha256);
    expect(() =>
      buildDetailWindow({
        id: "detail",
        product: asset,
        crop: [0, 0, 10, 10],
        box: { x: 0, y: 0, width: 250, height: 150 },
      }),
    ).toThrow(/resolution/);
  });
  it("shifts local motion, adds exact visibility, and merges dependencies", () => {
    const fragment = {
      nodes: layer.nodes,
      assets: layer.assets,
      events: buildRotateMotion(
        { fps: 30, frameCount: 60 },
        { target: "hero", start: 0, end: 20, from: 0, to: 3 },
      ),
    };
    const result = sequenceCommerceFragments({ fps: 30, frameCount: 120 }, [
      { fragment, start: 30, duration: 60 },
    ]);
    expect(result.events![0]!.start).toBe(30);
    expect(result.visibility).toEqual([{ target: "hero", start: 30, end: 90 }]);
    expect(() =>
      sequenceCommerceFragments({ fps: 30, frameCount: 60 }, [
        { fragment, start: 30, duration: 60 },
      ]),
    ).toThrow(/timeline/);
  });
});

describe("spatial validation and temporal composition", () => {
  it("resolves a cropped image under a rotated parent", () => {
    const input = base();
    input.nodes[0] = {
      ...input.nodes[0]!,
      x: 10,
      y: 20,
      rotation: 90,
      origin: [0, 0],
    };
    input.nodes[1] = {
      ...input.nodes[1]!,
      x: 5,
      y: 8,
      width: 100,
      height: 50,
      origin: [0, 0],
      type: "image",
      fit: "contain",
      states: [{ asset: asset.id, crop: [0, 0, 1000, 500] }],
    };
    const scene = compileCommerceScene(
      CommerceSceneSchema.parse({
        ...input,
        geometry: [{ ...geometry, anchors: { cap: [500, 250] } }],
      }),
    );
    const point = resolveProductAnchor(scene, "hero-art", "cap", 0);
    expect(point[0]).toBeCloseTo(-23);
    expect(point[1]).toBeCloseTo(75);
    expect(() =>
      resolveProductAnchor(
        compileCommerceScene(
          CommerceSceneSchema.parse({
            ...input,
            geometry: [{ ...geometry, anchors: { cap: [500, 1000] } }],
          }),
        ),
        "hero-art",
        "cap",
        0,
      ),
    ).toThrow(/crop/);
  });
  it("follows the source at subframes and rejects a path through protected copy", () => {
    const scene = compileCommerceScene(
      CommerceSceneSchema.parse({
        ...base(),
        nodes: [
          ...layer.nodes,
          {
            type: "path",
            id: "line",
            points: [
              [0, 285],
              [1, 1],
            ],
            stroke: "#000000",
            lineWidth: 3,
          },
        ],
        attachments: [
          { path: "line", endpoint: "end", source: "hero-art", anchor: "cap" },
        ],
      }),
    );
    const path = scene.nodes.find((n) => n.id === "line")!;
    if (path.type !== "path") throw new Error("path");
    expect(evaluateAttachedPath(scene, path, 3.5).points.at(-1)).toEqual([
      380, 285,
    ]);
    const blocked = {
      ...scene,
      geometry: [
        {
          ...scene.geometry![0]!,
          anchors: { cap: [500, 700] as [number, number] },
        },
      ],
    };
    expect(() => evaluateAttachedPath(blocked, path, 3.5)).toThrow(/protected/);
  });
  it("rejects cyclic mattes, nested targets, stale anchors and production additions", () => {
    const nodes = [
      ...layer.nodes,
      { type: "rect", id: "mask", width: 100, height: 100, fill: "#FFFFFF" },
    ];
    expect(() =>
      CommerceSceneSchema.parse({
        ...base(),
        nodes,
        mattes: [
          { target: "hero", mask: "mask" },
          { target: "mask", mask: "hero" },
        ],
      }),
    ).toThrow(/cycles/);
    expect(() =>
      CommerceSceneSchema.parse({
        ...base(),
        nodes,
        mattes: [{ target: "hero-art", mask: "mask" }],
      }),
    ).toThrow(/root/);
    expect(() =>
      CommerceSceneSchema.parse({
        ...base(),
        metadata: {
          ...original.metadata,
          registration: {
            status: "production",
            id: "test-registration",
            version: "1.0",
          },
        },
      }),
    ).toThrow(/Experimental/);
  });
  it("shifts effect phases and scopes, preserving exact half-open visibility", () => {
    const fragment = {
      nodes: layer.nodes,
      assets: layer.assets,
      effects: [
        {
          type: "drift" as const,
          target: "hero",
          start: 0,
          end: 59,
          cycles: 1,
          travelX: 4,
          tilt: 1,
        },
      ],
    };
    const result = sequenceCommerceFragments({ fps: 30, frameCount: 120 }, [
      { fragment, start: 30, duration: 60 },
    ]);
    expect(result.effects![0]).toMatchObject({
      start: 30,
      end: 89,
      active: { start: 30, end: 90 },
    });
    const scene = CommerceSceneSchema.parse({
      ...base(),
      ...result,
      fonts: original.fonts,
    });
    expect(() =>
      CommerceSceneSchema.parse({
        ...scene,
        effects: [{ ...scene.effects![0]!, active: { start: 90, end: 999 } }],
      }),
    ).toThrow(/timeline/);
    expect(() =>
      sequenceCommerceFragments({ fps: 30, frameCount: 120 }, [
        {
          fragment: {
            ...fragment,
            effects: [{ type: "motion-blur", shutterAngle: 180, samples: 8 }],
          },
          duration: 60,
        },
      ]),
    ).toThrow(/complete scene/);
  });
});

it("evaluates effect offsets at the same subframe as anchors", () => {
  const scene = compileCommerceScene(
    CommerceSceneSchema.parse({
      ...base(),
      effects: [
        {
          type: "drift",
          target: "hero",
          start: 0,
          end: 239,
          cycles: 1,
          travelX: 4,
          tilt: 0,
        },
      ],
    }),
  );
  const point = resolveProductAnchor(scene, "hero-art", "cap", 59.75);
  expect(point[0]).toBeCloseTo(384);
  expect(point[1]).toBe(285);
});
it("accepts an explicit product pivot without changing the original image", () => {
  const result = buildProductLayer({
    id: "pivoted",
    product: asset,
    x: 0,
    y: 0,
    width: 200,
    pivot: [0.5, 0.9],
  });
  expect(result.nodes[0]!.origin).toEqual([0.5, 0.9]);
  expect(result.assets[0]).toEqual(asset);
});
