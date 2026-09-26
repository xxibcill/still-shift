import {
  StorySceneSchema,
  type StoryScene,
} from "../../packages/scene-contract/src/story.ts";
import { art, cue, group, path, text } from "./design.ts";
import { palette } from "./art.ts";

export function comparisonAccessProof(
  comparison: StoryScene,
  access: StoryScene,
) {
  if (
    comparison.recipe.preset !== "unequal_margins" ||
    access.recipe.preset !== "access_constraint"
  )
    throw new Error("Proof requires comparison and access recipes");
  const first = StorySceneSchema.parse({
    ...comparison,
    title: "S01E01 ST-013 · unequal margins candidate",
    frameCount: 334,
    episodeStartFrame: 4748,
    recipe: {
      ...comparison.recipe,
      strain: cue(
        114,
        242,
        "price-rise-lost-work-and-other-strain",
        "in-out-quint",
      ),
      labelWindows: [cue(114, 136, "more-room"), cue(243, 263, "less-room")],
    },
  });
  const retained = new Set([
    "paper",
    "ground",
    "common-ground",
    "house-a",
    "house-b",
    "room",
    "strained",
  ]);
  const second = StorySceneSchema.parse({
    ...access,
    title: "S01E01 ST-014 · access candidate",
    frameCount: 312,
    episodeStartFrame: 5082,
    nodes: [
      ...first.nodes.filter((node) => retained.has(node.id)),
      text("title", "Available grain.", 112, 94, 82),
      text("subtitle", "Access can differ.", 116, 207, 62, {
        color: palette.red,
      }),
      art("store", "store", 804, 120, 310, 269),
      text("source-label", "Available", 960, 85, 42, { align: "center" }),
      path(
        "route-a",
        [
          [844, 326],
          [742, 615],
        ],
        { lineWidth: 16, lineStyle: "brush" },
      ),
      path(
        "route-b",
        [
          [1077, 326],
          [1181, 735],
        ],
        { lineWidth: 16, lineStyle: "brush" },
      ),
      group("side-a", 0, 0, 160, 52, { clip: true }),
      art("side-a-art", "pressure", 0, 0, 160, 52, {
        parent: "side-a",
        fit: "stretch",
      }),
      group("side-b", 0, 0, 160, 52, { clip: true }),
      art("side-b-art", "pressure", 0, 0, 160, 52, {
        parent: "side-b",
        rotation: 180,
        fit: "stretch",
      }),
      text(
        "qualifier",
        "Illustrative relationship · no measured quantities",
        112,
        966,
        42,
      ),
    ],
    recipe: {
      ...access.recipe,
      route: "route-b",
      position: 0.3,
      openWidth: 110,
      constrainedWidth: 40,
      clearance: 10,
      reveal: cue(0, 40, "markets-and-storage"),
      narrow: cue(52, 145, "not-equal-access", "in-out-quint"),
    },
  });
  return [first, second] as const;
}
