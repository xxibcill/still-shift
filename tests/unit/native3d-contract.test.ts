import { describe, expect, it } from "vitest";
import {
  SolidSceneSchema,
  Native3DSourceSchema,
} from "../../packages/scene-contract/src/native3d/scene.ts";
import { CompositionSchema } from "../../packages/scene-contract/src/composition/composition.ts";
import { Native3DLayerSchema } from "../../packages/scene-contract/src/composition/layers.ts";
import { Native3DSourceOverridesSchema } from "../../packages/scene-contract/src/composition/native3d.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

const controller = (id = "world", start = 0, end = 30) => ({
  id,
  type: "native3d",
  asset: "solid",
  sourceStartFrame: start,
  sourceFps: 30,
  startFrame: start,
  inPoint: start,
  outPoint: end,
});
const composition = (layers: unknown[]) => ({
  schemaVersion: "composition-1",
  id: "comp",
  width: 320,
  height: 180,
  fps: 30,
  frameCount: 300,
  assets: [
    {
      id: "solid",
      type: "native3d",
      path: "scene.json",
      sha256: nativeFixtureHash,
      format: "solid-scene-1",
    },
  ],
  layers,
});
describe("native solid contracts and scoped admission", () => {
  it("admits bounded indexed solids without fabricating rig or tape dimensions", () => {
    const source = nativeSolidFixture();
    expect(Native3DSourceSchema.parse(source).schemaVersion).toBe(
      "solid-scene-1",
    );
    expect(source).not.toHaveProperty("rigs");
    expect(source.geometry).not.toHaveProperty("dimensions");
    expect(SolidSceneSchema.safeParse({ ...source, rigs: [] }).success).toBe(
      false,
    );
  });
  it("retains positive physical scale but leaves ordinary unbound mirrored artwork legal", () => {
    const source = nativeSolidFixture();
    source.parts[0]!.transform.scale[0] = -1;
    expect(SolidSceneSchema.safeParse(source).success).toBe(false);
    expect(
      CompositionSchema.safeParse(
        composition([
          {
            id: "legacy",
            type: "solid",
            size: [10, 10],
            color: "#ffffff",
            transform: { scale: [-1, 1] },
          },
        ]),
      ).success,
    ).toBe(true);
  });
  it("fails topology/parent rebinding and arbitrary texture overrides at the contract boundary", () => {
    expect(
      Native3DSourceOverridesSchema.safeParse({
        partOverrides: { root: { parent: "child" } },
      }).success,
    ).toBe(false);
    expect(
      Native3DSourceOverridesSchema.safeParse({
        materialOverrides: {
          paint: { texture: { kind: "wood-grain", seed: 1 } },
        },
      }).success,
    ).toBe(false);
    expect(
      Native3DLayerSchema.safeParse({ ...controller(), geometry: {} }).success,
    ).toBe(false);
  });
  it("admits nine disjoint controllers in one scope and rejects any interval overlap", () => {
    const layers = Array.from({ length: 9 }, (_, index) =>
      controller(`world${index}`, index * 30, (index + 1) * 30),
    );
    expect(CompositionSchema.safeParse(composition(layers)).success).toBe(true);
    expect(
      CompositionSchema.safeParse(
        composition([
          controller("one", 0, 30),
          { ...controller("two", 29, 60), enabled: false },
        ]),
      ).success,
    ).toBe(false);
  });
  it("requires same-scope controller references and rejects legacy threeD mixing", () => {
    expect(
      CompositionSchema.safeParse(
        composition([
          controller(),
          { id: "label", type: "null", overlayAfter: "absent" },
        ]),
      ).success,
    ).toBe(false);
    expect(
      CompositionSchema.safeParse(
        composition([
          controller(),
          {
            id: "legacy",
            type: "solid",
            size: [10, 10],
            color: "#ffffff",
            threeD: true,
          },
        ]),
      ).success,
    ).toBe(false);
  });
});
