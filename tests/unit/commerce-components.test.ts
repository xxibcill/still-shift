import { describe, expect, it } from "vitest";
import fixture from "../../benchmarks/fixtures/ecommerce-motion/a01-beauty-feed.json" with { type: "json" };
import { mergeCommerceFragments } from "../../packages/renderer-core/src/commerce-composition.ts";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { PreparedNodeSchema } from "../../packages/scene-contract/src/prepared.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
} from "../../packages/renderer-core/src/prepared-scene.ts";

const clock = { fps: 30 as const, frameCount: 300 };
const product = fixture.assets[0]!;
const node = PreparedNodeSchema.parse({
  type: "group",
  id: "hero",
  x: 20,
  y: 100,
  width: 200,
  height: 250,
});
const event = {
  node: "hero",
  property: "y" as const,
  start: 30,
  end: 60,
  from: 100,
  to: 80,
  easing: "smoothstep" as const,
};

describe("commerce composition contract", () => {
  it("merges shared dependencies and independently named nodes without mutation", () => {
    const first = { nodes: [node], assets: [product] };
    const second = {
      nodes: [{ ...node, id: "other" }],
      assets: [{ ...product }],
    };
    const merged = mergeCommerceFragments(clock, [first, second]);
    expect(merged.assets).toEqual([product]);
    expect(merged.nodes.map((n) => n.id)).toEqual(["hero", "other"]);
    expect(merged.events).toEqual([]);
    expect(first.nodes[0]).toBe(node);
    expect(() => mergeCommerceFragments(clock, [first, first])).toThrow(
      /Duplicate node/,
    );
    expect(() =>
      mergeCommerceFragments(clock, [
        first,
        { assets: [{ ...product, path: "different.png" }] },
      ]),
    ).toThrow(/Conflicting asset/);
  });
  it("resolves one initial value, delayed starts and continuous sequential handoffs", () => {
    const merged = mergeCommerceFragments(clock, [
      {
        nodes: [node],
        events: [event, { ...event, start: 90, end: 120, from: 80, to: 100 }],
      },
    ]);
    expect(merged.events[0]!.from).toBe(100);
    expect(merged.events[1]!.from).toBeUndefined();
    const scene = compilePreparedScene(
      CommerceSceneSchema.parse({
        ...fixture,
        ...merged,
        assets: fixture.assets,
        fonts: fixture.fonts,
      }),
    );
    expect(evaluatePreparedNode(scene, node, 0).y).toBe(100);
    expect(evaluatePreparedNode(scene, node, 75).y).toBe(80);
    expect(evaluatePreparedNode(scene, node, 120).y).toBe(100);
    expect(() =>
      mergeCommerceFragments(clock, [
        {
          nodes: [node],
          events: [event, { ...event, start: 90, end: 120, from: 42 }],
        },
      ]),
    ).toThrow(/Discontinuous/);
  });
  it("rejects overlapping writes, missing nodes and out-of-timeline events", () => {
    expect(() =>
      mergeCommerceFragments(clock, [
        { nodes: [node], events: [event, { ...event, start: 45, end: 75 }] },
      ]),
    ).toThrow(/Conflicting/);
    expect(() => mergeCommerceFragments(clock, [{ events: [event] }])).toThrow(
      /Missing/,
    );
    expect(() =>
      mergeCommerceFragments(clock, [
        { nodes: [node], events: [{ ...event, end: 300 }] },
      ]),
    ).toThrow(/timeline/);
  });
});

describe("independent product layer and float", () => {
  it("has no timeline until a behavior is attached and supports different source proportions", async () => {
    const { buildProductLayer } = await import(
      "../../packages/renderer-core/src/product-layer.ts"
    );
    const { buildFloatMotion } = await import(
      "../../packages/renderer-core/src/commerce-motion.ts"
    );
    for (const [width, height] of [
      [300, 1000],
      [1600, 400],
      [1000, 1000],
    ]) {
      for (const fps of [24, 30] as const) {
        const layer = buildProductLayer({
          id: "hero",
          product: { ...product, width: width!, height: height! },
          x: 10,
          y: 100,
          width: 200,
        });
        expect(layer.events).toEqual([]);
        expect(layer.bounds.width / layer.bounds.height).toBeCloseTo(
          width! / height!,
        );
        const timeline = { fps, frameCount: fps * 8 };
        const events = buildFloatMotion(timeline, {
          target: layer.target,
          restY: 100,
          travel: 18,
          start: fps,
          end: timeline.frameCount - 1,
          cycles: 2,
        });
        const merged = mergeCommerceFragments(timeline, [
          layer,
          { events, fonts: CommerceSceneSchema.parse(fixture).fonts },
        ]);
        const compiled = compilePreparedScene(
          CommerceSceneSchema.parse({ ...fixture, ...timeline, ...merged }),
        );
        expect(evaluatePreparedNode(compiled, layer.nodes[0]!, 0).y).toBe(100);
        expect(
          evaluatePreparedNode(
            compiled,
            layer.nodes[0]!,
            timeline.frameCount - 1,
          ).y,
        ).toBe(100);
      }
    }
  });
});

describe("translate and fade behaviors", () => {
  it("supports delayed entrance, hold, fade out and float on an independent axis", async () => {
    const { buildTranslateMotion, buildFadeMotion, buildFloatMotion } =
      await import("../../packages/renderer-core/src/commerce-motion.ts");
    const events = [
      ...buildTranslateMotion(clock, {
        target: "hero",
        start: 30,
        end: 60,
        x: { from: -200, to: 20 },
      }),
      ...buildFadeMotion(clock, {
        target: "hero",
        start: 30,
        end: 60,
        from: 0,
        to: 1,
      }),
      ...buildFadeMotion(clock, {
        target: "hero",
        start: 200,
        end: 240,
        from: 1,
        to: 0,
      }),
      ...buildFloatMotion(clock, {
        target: "hero",
        start: 0,
        end: 299,
        restY: 100,
        travel: 18,
        cycles: 2,
      }),
    ];
    const merged = mergeCommerceFragments(clock, [{ nodes: [node], events }]);
    const scene = compilePreparedScene(
      CommerceSceneSchema.parse({
        ...fixture,
        ...merged,
        assets: fixture.assets,
        fonts: fixture.fonts,
      }),
    );
    expect(evaluatePreparedNode(scene, node, 0)).toMatchObject({
      x: -200,
      opacity: 0,
    });
    expect(evaluatePreparedNode(scene, node, 100)).toMatchObject({
      x: 20,
      opacity: 1,
    });
    expect(evaluatePreparedNode(scene, node, 299)).toMatchObject({
      x: 20,
      y: 100,
      opacity: 0,
    });
    expect(() =>
      mergeCommerceFragments(clock, [
        {
          nodes: [node],
          events: [
            ...events,
            ...buildTranslateMotion(clock, {
              target: "hero",
              start: 0,
              end: 60,
              y: { to: 20 },
            }),
          ],
        },
      ]),
    ).toThrow(/Conflicting/);
    expect(() =>
      buildFadeMotion(clock, { target: "hero", start: 0, end: 30, to: 2 }),
    ).toThrow();
  });
});

describe("path and measured text fragments", () => {
  it("retains exact supplied English/Thai text and returns the pinned font", async () => {
    const { buildTextBlock } = await import(
      "../../packages/renderer-core/src/commerce-text.ts"
    );
    const font = CommerceSceneSchema.parse(fixture).fonts[0]!;
    for (const locale of ["en", "th"] as const) {
      const text =
        locale === "en" ? "Visible cap\nSAMPLE 01" : "เรียบง่าย\nในทุกวัน";
      const block = buildTextBlock({
        id: "copy",
        text,
        box: { x: 60, y: 60, width: 600, height: 240 },
        font,
        locale,
        fontSize: 48,
        color: "#222222",
      });
      expect(block.fonts).toEqual([font]);
      expect(block.nodes![0]).toMatchObject({
        text,
        textBox: { locale, lineHeight: locale === "th" ? 1.5 : 1.28 },
      });
    }
  });
  it("rejects connectors through the label, including diagonals, and reveals a valid connector", async () => {
    const { buildPath } = await import(
      "../../packages/renderer-core/src/commerce-path.ts"
    );
    const { buildPathDrawMotion } = await import(
      "../../packages/renderer-core/src/commerce-motion.ts"
    );
    const common = {
      id: "line",
      stroke: "#555555",
      lineWidth: 3,
      protectedRegion: { x: 100, y: 100, width: 100, height: 100 },
    };
    expect(() =>
      buildPath({
        ...common,
        points: [
          [0, 0],
          [300, 300],
        ],
      }),
    ).toThrow(/protected product label/);
    const path = buildPath({
      ...common,
      points: [
        [20, 50],
        [250, 50],
      ],
    });
    const fields = mergeCommerceFragments(clock, [
      path,
      {
        events: buildPathDrawMotion(clock, {
          target: "line",
          start: 30,
          end: 60,
          from: 0,
          to: 1,
        }),
      },
    ]);
    const compiled = compilePreparedScene(
      CommerceSceneSchema.parse({
        ...fixture,
        ...fields,
        assets: fixture.assets,
        fonts: fixture.fonts,
      }),
    );
    expect(evaluatePreparedNode(compiled, path.nodes![0]!, 0).reveal).toBe(0);
    expect(evaluatePreparedNode(compiled, path.nodes![0]!, 90).reveal).toBe(1);
  });
});
