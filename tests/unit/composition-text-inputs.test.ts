import { expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { collectCompositionTextFrames } from "../../packages/renderer-core/src/composition/render/text-frames.ts";

const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "text-input",
  width: 96,
  height: 64,
  fps: 24,
  frameCount: 12,
  assets: [
    {
      id: "font",
      type: "font",
      path: "font.ttf",
      sha256: `sha256:${"0".repeat(64)}`,
      weight: "500",
    },
  ],
  layers: [
    {
      id: "owner",
      type: "solid",
      size: [96, 64],
      color: "#ffffff",
      effects: [
        {
          id: "wipe",
          effect: "transition.gradient-wipe",
          inputs: { map: "map" },
        },
      ],
    },
    {
      id: "map",
      type: "text",
      enabled: false,
      text: "Aa",
      fontSize: 32,
      fontAsset: "font",
      color: "#ffffff",
    },
  ],
  textAnimators: [
    {
      node: "map",
      unit: "glyph",
      start: 0,
      end: 11,
      stagger: 0,
      selector: { start: 0, end: 1 },
      from: { strokeWidth: 1 },
      to: { strokeWidth: 5 },
    },
  ],
});

it.each(["text", "group"])(
  "collects hidden %s input glyph clocks without an echo",
  (source) => {
    const comp = fixture();
    if (source === "group") {
      comp.layers[1]!.id = "label";
      comp.layers[1]!.enabled = true;
      comp.layers[1]!.parent = "map";
      comp.textAnimators![0]!.node = "label";
      comp.layers.push({
        id: "map",
        type: "group",
        enabled: false,
        size: [96, 64],
      });
    }
    expect(validateComposition(comp).ok).toBe(true);
    const key = source === "group" ? "label" : "map";
    expect(
      collectCompositionTextFrames(comp, {
        [key]: [{ left: 0, top: 0, right: 48, bottom: 32 }],
      }),
    ).toEqual({ [key]: Array.from({ length: 12 }, (_, frame) => frame) });
  },
);

it("does not prepare unused hidden text and respects the input owner's active window", () => {
  const comp = fixture();
  comp.layers[0]!.inPoint = 3;
  comp.layers[0]!.outPoint = 7;
  const bounds = { map: [{ left: 0, top: 0, right: 48, bottom: 32 }] };
  expect(collectCompositionTextFrames(comp, bounds)).toEqual({
    map: [3, 4, 5, 6],
  });
  comp.layers[0]!.effects = [];
  expect(collectCompositionTextFrames(comp, bounds)).toEqual({ map: [] });
});
