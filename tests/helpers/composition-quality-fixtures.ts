import {
  PreparedNodeSchema,
  ProviderLayerSchema,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
import { StoryTextParamsSchema } from "../../packages/renderer-core/src/composition/adapters/story-providers.ts";
import {
  composition,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";

export function providerReadingComposition(
  revealStart = 145,
  reveal = 1,
): Composition {
  const node = PreparedNodeSchema.parse({
    id: "words",
    type: "text",
    text: "A reader needs time to understand all these words",
    fontSize: 24,
    color: "#ffffff",
    textRole: "body",
    width: 580,
    height: 35,
  });
  const params = StoryTextParamsSchema.parse({
    node,
    samples: Array.from({ length: 150 }, (_, frame) => ({
      reveal: frame < revealStart ? 0 : reveal,
      state: 0,
    })),
  });
  return composition(
    [
      ProviderLayerSchema.parse({
        id: "words",
        type: "provider",
        provider: "story.text@1.0.0",
        usesSystemFonts: true,
        params,
        bounds: [0, 0, 550, 35],
        transform: { anchor: [0, 0], position: [40, 40] },
      }),
      solid("motion", {
        size: [80, 80],
        transform: {
          anchor: [0, 0],
          position: {
            keys: [
              { frame: 0, value: [40, 240] },
              { frame: 149, value: [490, 240], interpolation: "linear" },
            ],
          },
        },
      }),
    ],
    { frameCount: 150 },
  );
}
