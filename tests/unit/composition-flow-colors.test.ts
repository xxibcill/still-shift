import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "@still-shift/scene-contract";
import { storyToComposition } from "../../packages/renderer-core/src/composition/adapters/story.ts";
import { STORY_CONTENT_PROVIDERS } from "../../packages/renderer-core/src/composition/adapters/story-providers.ts";
import { COMMERCE_CONTENT_PROVIDERS } from "../../packages/renderer-core/src/composition/adapters/commerce-providers.ts";
import {
  MOTION_PATH_PROVIDERS,
  MotionFlowParamsSchema,
} from "../../packages/renderer-core/src/composition/adapters/motion-path.ts";
import type { ProviderLayer } from "../../packages/renderer-core/src/composition/render/providers.ts";
import { motionPathVariants } from "../helpers/composition-motion-path.ts";

const original = StorySceneSchema.parse(
  JSON.parse(
    readFileSync(
      "benchmarks/fixtures/reusable-components/story-leader.json",
      "utf8",
    ),
  ),
);
const input = motionPathVariants("component/story-leader", original)[0]!.scene;
input.flows![0]!.colorStates = [{ frame: 100, color: "#ff0000" }];
const compiled = storyToComposition(input).layers.find(
  (layer) =>
    layer.type === "provider" && layer.provider === "component.flow@1.1.0",
) as ProviderLayer;
const data = MotionFlowParamsSchema.parse(compiled.params);
const providers = [
  ...STORY_CONTENT_PROVIDERS,
  ...COMMERCE_CONTENT_PROVIDERS,
  ...MOTION_PATH_PROVIDERS,
];

describe("compiled story flow colors", () => {
  it("persists the source motion model's interpolation setting", () => {
    expect(compiled.params.interpolateColors).toBe(true);
    const legacy = storyToComposition({ ...original, flows: input.flows });
    const flow = legacy.layers.find(
      (layer) =>
        layer.type === "provider" &&
        layer.provider.startsWith("component.flow@"),
    ) as ProviderLayer;
    expect(flow.params.interpolateColors).toBe(false);
  });

  it.each([
    "story.flow@1.0.0",
    "story.flow@1.1.0",
    "component.flow@1.0.0",
    "component.flow@1.1.0",
  ])("preserves interpolated and legacy held colors through %s", (id) => {
    for (const interpolateColors of [true, false, undefined]) {
      const params = {
        node: data.node,
        flow: data.flow,
        samples: data.samples,
        ...(interpolateColors === undefined ? {} : { interpolateColors }),
        ...(id === "story.flow@1.1.0"
          ? {
              geometry: {
                bend: 0,
                endpoints: [[data.node.points[0], data.node.points.at(-1)]],
              },
            }
          : {}),
        ...(id === "component.flow@1.0.0"
          ? { geometry: { points: [data.node.points] } }
          : {}),
        ...(id === "component.flow@1.1.0"
          ? { motion: data.motion, geometry: data.geometry }
          : {}),
      };
      const draw = providers
        .find((provider) => provider.id === id)!
        .prepare(
          {
            ...compiled,
            provider: id,
            params: JSON.parse(JSON.stringify(params)),
          },
          { images: new Map(), fonts: new Map() },
          "layers[0]",
        );
      for (const frame of [50, 120, 50]) {
        const colors: string[] = [];
        const ctx = {
          globalAlpha: 1,
          fillStyle: "",
          save() {},
          restore() {},
          translate() {},
          rotate() {},
          beginPath() {},
          arc() {},
          fill() {
            colors.push(this.fillStyle);
          },
        };
        draw(ctx as unknown as CanvasRenderingContext2D, frame);
        expect(colors.length).toBeGreaterThan(0);
        expect(new Set(colors)).toEqual(
          new Set([
            frame >= 100
              ? "#ff0000"
              : interpolateColors
                ? "#a45768"
                : "#345d97",
          ]),
        );
      }
    }
  });
});
