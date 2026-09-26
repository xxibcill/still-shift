import { describe, expect, it } from "vitest";
import {
  CommerceBriefSchema,
  CommerceSceneSchema,
} from "../../packages/scene-contract/src/commerce.ts";
import { buildCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
} from "../../packages/renderer-core/src/prepared-scene.ts";

const hash = "sha256:" + "a".repeat(64);
const assets = {
  product: {
    id: "product-image",
    path: "product.png",
    sha256: hash,
    width: 800,
    height: 1000,
  },
  font: {
    id: "commerce-font",
    path: "font.ttf",
    sha256: hash,
    weight: "600" as const,
  },
};
const brief = () => ({
  schemaVersion: "commerce-brief-1",
  catalogVersion: "1.0",
  selection: { kind: "format", id: "H03" },
  title: "Original product fixture",
  locale: "en",
  product: {
    id: "sample",
    name: "Sample",
    imagePath: "product.png",
    preparation: "cutout",
    provenance: "Original synthetic fixture",
    protectedRegion: [0.34, 0.3, 0.32, 0.3],
  },
  copy: {
    headlines: ["A small daily ritual."],
    cta: "Explore the collection",
    source: "Fixture copy only",
    callouts: [],
  },
  profile: "landscape",
  fps: 30,
  frameCount: 240,
});

describe("commerce preparation and exact-frame scenes", () => {
  it("prepares every supported layout and preserves the asset aspect ratio", () => {
    for (const profile of ["landscape", "portrait", "square", "feed"]) {
      const scene = buildCommerceScene({ ...brief(), profile }, assets);
      expect(CommerceSceneSchema.safeParse(scene).success).toBe(true);
      const image = scene.nodes.find((node) => node.type === "image")!;
      expect(image.width / image.height).toBeCloseTo(0.8);
      expect(scene.metadata.selection.id).toBe("H03");
      expect(scene.assets[0]!.sha256).toBe(hash);
      expect(scene.fonts![0]!.sha256).toBe(hash);
    }
  });

  it("rejects missing factual sources, missing cutouts and unsupported choices", () => {
    const input = brief();
    expect(() =>
      buildCommerceScene(
        { ...input, selection: { kind: "format", id: "P08" } },
        assets,
      ),
    ).toThrow(/reference only/);
    expect(() =>
      buildCommerceScene(
        {
          ...input,
          selection: { kind: "format", id: "H01" },
          product: { ...input.product, preparation: "photo" },
        },
        assets,
      ),
    ).toThrow(/cutout/);
    expect(
      CommerceBriefSchema.safeParse({
        ...input,
        copy: { ...input.copy, source: "" },
      }).success,
    ).toBe(false);
    expect(() =>
      buildCommerceScene(
        { ...input, selection: { kind: "format", id: "H04" } },
        assets,
      ),
    ).toThrow(/callout/);
  });

  it("holds the hero and close deterministically across backward seeks", () => {
    const prepared = buildCommerceScene(brief(), assets);
    const scene = compilePreparedScene(prepared);
    const cta = prepared.nodes.find((node) => node.id === "cta")!;
    expect(evaluatePreparedNode(scene, cta, 0).opacity).toBe(0);
    const end = evaluatePreparedNode(scene, cta, 239);
    expect(end.opacity).toBe(1);
    evaluatePreparedNode(scene, cta, 100);
    expect(evaluatePreparedNode(scene, cta, 239)).toEqual(end);
    expect(() => evaluatePreparedNode(scene, cta, 240)).toThrow(/outside/);
  });

  it("settles the rigid product group before callouts and supports 24/30 fps", () => {
    for (const fps of [24, 30]) {
      const input = brief();
      const scene = buildCommerceScene(
        {
          ...input,
          selection: { kind: "recipe", id: "A01" },
          fps,
          frameCount: fps * 10,
          copy: {
            ...input.copy,
            callouts: [
              {
                text: "Illustrated cap",
                target: [0.5, 0.12],
                source: "Visible fixture cap",
              },
              {
                text: "Sample bottle",
                target: [0.5, 0.84],
                source: "Visible fixture outline",
              },
            ],
          },
        },
        assets,
      );
      const rendered = compilePreparedScene(scene);
      const product = scene.nodes.find((node) => node.id === "product")!;
      expect(evaluatePreparedNode(rendered, product, 0).x).not.toBe(product.x);
      const firstPath = scene.events.find(
        (event) => event.property === "reveal",
      )!;
      expect(evaluatePreparedNode(rendered, product, firstPath.start).x).toBe(
        product.x,
      );
      expect(evaluatePreparedNode(rendered, product, fps * 10 - 1).x).toBe(
        product.x,
      );
      expect(rendered.timeline.durationMs).toBe(10000);
    }
  });

  it("rejects events outside the scene and overlapping writes", () => {
    const scene = buildCommerceScene(brief(), assets);
    const overflow = structuredClone(scene);
    overflow.events[0]!.end = scene.frameCount + 1;
    expect(CommerceSceneSchema.safeParse(overflow).success).toBe(false);
    const conflict = structuredClone(scene);
    conflict.events.push({ ...conflict.events[0]! });
    expect(() => compilePreparedScene(conflict)).toThrow(/Conflicting/);
  });

  it("keeps text inside the largest safe inset and rejects a line through the label", () => {
    for (const profile of ["landscape", "portrait", "square", "feed"]) {
      const scene = buildCommerceScene(
        { ...brief(), profile, safeInset: 0.1 },
        assets,
      );
      const padding = Math.min(scene.width, scene.height) * 0.1;
      for (const node of scene.nodes.filter((node) => node.type === "text")) {
        expect(node.x).toBeGreaterThanOrEqual(padding);
        expect(node.y).toBeGreaterThanOrEqual(padding);
        expect(node.x + node.width).toBeLessThanOrEqual(scene.width - padding);
        expect(node.y + node.height).toBeLessThanOrEqual(
          scene.height - padding,
        );
      }
    }
    const input = brief();
    expect(() =>
      buildCommerceScene(
        {
          ...input,
          selection: { kind: "format", id: "H04" },
          copy: {
            ...input.copy,
            callouts: [
              { text: "Label", target: [0.5, 0.4], source: "Fixture label" },
              { text: "Cap", target: [0.5, 0.12], source: "Fixture cap" },
            ],
          },
        },
        assets,
      ),
    ).toThrow(/protected product label/);
  });
  it("layers a 4:5 editorial photograph behind editable copy without distorting it", () => {
    const scene = buildCommerceScene(
      { ...brief(), profile: "feed", artDirection: "editorial" },
      assets,
    );
    expect([scene.width, scene.height]).toEqual([1080, 1350]);
    expect(scene.nodes.slice(0, 2).map((node) => node.id)).toEqual([
      "product",
      "product-art",
    ]);
    const image = scene.nodes[1]!;
    expect([image.x, image.y, image.width, image.height]).toEqual([
      0, 0, 1080, 1350,
    ]);
    expect(() =>
      buildCommerceScene(
        { ...brief(), profile: "square", artDirection: "editorial" },
        assets,
      ),
    ).toThrow(/H03 in 4:5/);
    expect(() =>
      buildCommerceScene(
        { ...brief(), profile: "feed", artDirection: "editorial" },
        { ...assets, product: { ...assets.product, width: 1000 } },
      ),
    ).toThrow(/4:5 photo/);
  });
});

describe("A01 basic floating product", () => {
  const input = () => ({
    ...brief(),
    selection: { kind: "recipe", id: "A01" },
    profile: "feed",
    artDirection: "floating",
    frameCount: 300,
    copy: { headlines: [], cta: "", source: "No copy", callouts: [] },
    floating: {
      imagePath: "palm.png",
      provenance: "Separate palm",
      placement: [0.275, 0.12, 0.55],
      palmTop: 0.71,
    },
  });
  const layers = {
    ...assets,
    backdrop: { ...assets.product, id: "palm-image", path: "palm.png" },
  };
  it("preserves the whole product asset and keeps it separated from a fixed hand for the entire loop", () => {
    for (const fps of [24, 30]) {
      const prepared = buildCommerceScene(
        { ...input(), fps, frameCount: fps * 10 },
        layers,
      );
      const scene = compilePreparedScene(prepared);
      const product = prepared.nodes.find((node) => node.id === "product")!;
      const hand = prepared.nodes.find(
        (node) => node.id === "palm-background",
      )!;
      const original = evaluatePreparedNode(scene, product, 0);
      const fixedHand = evaluatePreparedNode(scene, hand, 0);
      expect(prepared.assets[0]).toEqual(assets.product);
      expect(
        prepared.nodes.filter((node) => node.type === "text"),
      ).toHaveLength(0);
      expect(
        prepared.nodes.filter((node) => node.parent === "product"),
      ).toHaveLength(1);
      for (let frame = 0; frame < prepared.frameCount; frame++) {
        const state = evaluatePreparedNode(scene, product, frame);
        expect(state.x).toBe(original.x);
        expect(state.y).toBeGreaterThanOrEqual(original.y - 18);
        expect(state.y).toBeLessThanOrEqual(original.y);
        expect(state.y + product.height + 40).toBeLessThanOrEqual(0.71 * 1350);
        expect([
          state.scaleX,
          state.scaleY,
          state.opacity,
          state.rotation,
        ]).toEqual([1, 1, 1, 0]);
        expect(evaluatePreparedNode(scene, hand, frame)).toEqual(fixedHand);
      }
      expect(
        evaluatePreparedNode(scene, product, prepared.frameCount - 1),
      ).toEqual(original);
    }
  });
  it("rejects contact, missing backgrounds and product decomposition inputs", () => {
    expect(() => buildCommerceScene(input(), assets)).toThrow(
      /palm-up background/,
    );
    expect(() =>
      buildCommerceScene(
        {
          ...input(),
          floating: { ...input().floating, placement: [0.275, 0.5, 0.55] },
        },
        layers,
      ),
    ).toThrow(/40 pixels/);
    expect(() =>
      buildCommerceScene(
        { ...input(), product: { ...input().product, preparation: "photo" } },
        layers,
      ),
    ).toThrow(/intact product cutout/);
    expect(() =>
      buildCommerceScene({ ...input(), copy: brief().copy }, layers),
    ).toThrow(/no copy/);
  });
});
