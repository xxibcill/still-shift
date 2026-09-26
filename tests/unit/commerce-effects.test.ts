import { buildCommerceComponentDemo } from "../../packages/renderer-core/src/commerce-component-demos.ts";
import { defaultComponentDemo } from "../../packages/scene-contract/src/commerce-components.ts";
import { EFFECT_DEMOS } from "../../packages/scene-contract/src/commerce-effects.ts";
import { describe, expect, it } from "vitest";
import fixture from "../../benchmarks/fixtures/ecommerce-motion/atoms/studio.json" with { type: "json" };
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { CommerceEffectSchema } from "../../packages/scene-contract/src/commerce-effects.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
  evaluatePreparedNodeAtTime,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  exposureFrames,
  applyCommerceEffectMotion,
  seededRandom,
} from "../../packages/renderer-core/src/commerce-effect-motion.ts";

const state = {
  x: 40,
  y: 100,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.2,
};
describe("commerce effects", () => {
  it("samples exposure symmetrically in subframes and clamps shot boundaries", () => {
    expect(exposureFrames(10, 240, 180, 4)).toEqual([
      9.8125, 9.9375, 10.0625, 10.1875,
    ]);
    expect(exposureFrames(0, 240, 180, 4)).toEqual([0, 0, 0.0625, 0.1875]);
    expect(exposureFrames(239, 240, 180, 4)).toEqual([
      238.8125, 238.9375, 239, 239,
    ]);
  });
  it("allows continuous evaluation internally while rejecting fractional public seeks", () => {
    const scene = compilePreparedScene(CommerceSceneSchema.parse(fixture));
    const node = scene.nodes.find((node) => node.id === "product")!;
    const a = evaluatePreparedNodeAtTime(scene, node, 10);
    const b = evaluatePreparedNodeAtTime(scene, node, 10.25);
    expect(a.y).not.toBe(b.y);
    expect(() => evaluatePreparedNode(scene, node, 10.25)).toThrow();
    expect(() => evaluatePreparedNodeAtTime(scene, node, NaN)).toThrow();
  });
  it("uses the actual source height for centered shadow scale and opacity", () => {
    const effect = CommerceEffectSchema.parse({
      type: "height-shadow",
      target: "shadow",
      source: "product",
      restY: 220,
      travel: 18,
      spread: 0.1,
      fade: 0.25,
    });
    const lower = applyCommerceEffectMotion(
      state,
      "shadow",
      [effect],
      0,
      () => 220,
    );
    const upper = applyCommerceEffectMotion(
      state,
      "shadow",
      [effect],
      30,
      () => 202,
    );
    expect(lower).toEqual(state);
    expect(upper.scaleX).toBe(1.1);
    expect(upper.opacity).toBeCloseTo(0.15);
    expect(upper.x).toBe(state.x);
    expect(state.scaleX).toBe(1);
  });
  it("loops drift without accumulating state and settles overshoot exactly", () => {
    const effect = CommerceEffectSchema.parse({
      type: "drift",
      target: "product",
      start: 0,
      end: 239,
      cycles: 2,
      travelX: 4,
      tilt: 0.5,
    });
    const sample = (frame: number) =>
      applyCommerceEffectMotion(state, "product", [effect], frame, () => 0);
    expect(sample(239).x).toBeCloseTo(sample(0).x);
    const a = sample(30);
    sample(180);
    expect(sample(30)).toEqual(a);
    const overshoot = CommerceEffectSchema.parse({
      type: "overshoot",
      target: "product",
      axis: "x",
      start: 30,
      end: 60,
      amplitude: 20,
      oscillations: 2,
    });
    expect(
      applyCommerceEffectMotion(state, "product", [overshoot], 60, () => 0),
    ).toEqual(state);
  });
  it("rejects invalid effects, cyclic shadow dependencies and production promotion", () => {
    const blur = { type: "motion-blur", shutterAngle: 180, samples: 16 };
    expect(
      CommerceEffectSchema.safeParse({ ...blur, samples: 0 }).success,
    ).toBe(false);
    expect(
      CommerceSceneSchema.safeParse({ ...fixture, effects: [blur, blur] })
        .success,
    ).toBe(false);
    expect(
      CommerceSceneSchema.safeParse({
        ...fixture,
        effects: [
          {
            type: "glow",
            target: "missing",
            radius: 10,
            intensity: 0.5,
            threshold: 0.8,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      CommerceSceneSchema.safeParse({
        ...fixture,
        effects: [blur],
        metadata: {
          ...fixture.metadata,
          registration: {
            status: "production",
            id: "palm-up-product-float",
            version: "1.0",
          },
        },
      }).success,
    ).toBe(false);
    const shadow = {
      type: "height-shadow",
      target: "shadow",
      source: "product",
      restY: 220,
      travel: 18,
      spread: 0.1,
      fade: 0.2,
    };
    expect(
      CommerceSceneSchema.safeParse({
        ...fixture,
        effects: [shadow, { ...shadow, target: "product", source: "shadow" }],
      }).success,
    ).toBe(false);
    expect(
      CommerceSceneSchema.safeParse({
        ...fixture,
        effects: [
          {
            type: "displacement",
            target: "product",
            amount: 10,
            wavelength: 100,
            start: 0,
            end: 239,
            cycles: 2,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("has reproducible seeded randomness", () => {
    const a = seededRandom(37),
      b = seededRandom(37),
      c = seededRandom(38);
    expect(Array.from({ length: 20 }, a)).toEqual(
      Array.from({ length: 20 }, b),
    );
    expect(a()).not.toBe(c());
  });
});

describe("effect demo controls", () => {
  it("builds every effect at the control limits and retains the supplied image", () => {
    const assets = {
      product: fixture.assets.find((a) => a.id === "product-image")!,
      font: CommerceSceneSchema.parse(fixture).fonts[0]!,
      shadow: fixture.assets.find((a) => a.id !== "product-image")!,
    };
    for (const demo of EFFECT_DEMOS) {
      for (const amount of [0, 2]) {
        const options = {
          ...defaultComponentDemo(demo.id),
          fps: 24 as const,
          frameCount: 96,
          cycles: 8,
          treatment: {
            enabled: true,
            amount,
            shutterAngle: 360,
            samples: 32,
            seed: 2147483647,
          },
        };
        const scene = buildCommerceComponentDemo(options, assets);
        expect(scene.effects?.length === 0).toBe(amount === 0);
        expect(
          scene.assets.find((asset) => asset.id === assets.product.id),
        ).toEqual(assets.product);
        expect(scene.metadata.registration.status).toBe("experimental");
      }
    }
  });
});
