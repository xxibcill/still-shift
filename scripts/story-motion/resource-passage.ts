import {
  StorySceneSchema,
  type StoryScene,
} from "../../packages/scene-contract/src/story.ts";
import {
  typeScale,
  art,
  bind,
  cue,
  ground,
  group,
  household,
  paper,
  relation,
  text,
} from "./design.ts";
import { palette } from "./art.ts";

// Master-frame onsets rounded from the current local-asr-v003 word alignment.
// The continuous graphic crosses ST-006/007; delivery slices preserve their cuts.
export const resourceShots = [
  { id: "st006", start: 1940, end: 2348 },
  { id: "st007", start: 2348, end: 2708 },
  { id: "st008", start: 2708, end: 3447 },
] as const;

const grain = (x: number, label = "Cereal foods") => [
  group("grain", x, 330, 480, 520),
  art("grain-art", "store", 0, 0, 480, 416, { parent: "grain" }),
  text("grain-label", label, 240, 430, typeScale.label, {
    parent: "grain",
    align: "center",
  }),
];
const home = () => [
  group("home", 1040, 350, 600, 490),
  household("home-art", 40, 0, 520, { parent: "home" }),
  text("home-label", "One household", 300, 405, typeScale.label, {
    parent: "home",
    align: "center",
  }),
];

export function resourcePassage(
  base: StoryScene,
  comparison: StoryScene,
): StoryScene[] {
  if (comparison.recipe.preset !== "unequal_margins")
    throw new Error("Resource passage requires an unequal margins scene");
  const scene = (
    start: number,
    end: number,
    title: string,
    nodes: unknown[],
    recipe: unknown,
    connectors: unknown[],
    essentialText: string[],
  ) =>
    StorySceneSchema.parse({
      ...base,
      title,
      episodeStartFrame: start,
      frameCount: end - start,
      nodes,
      recipe,
      connectors,
      review: { essentialText },
    });
  const dependencies = [
    { id: "storage", label: "Resources / storage", y: 350, onset: 2323 },
    { id: "markets", label: "Prices / markets / credit", y: 465, onset: 2353 },
    { id: "labor", label: "Labor / livestock", y: 580, onset: 2401 },
    { id: "local", label: "Local conditions", y: 695, onset: 2433 },
    { id: "loss", label: "Loss / spoilage varies", y: 840, onset: 2503 },
  ];
  const first = scene(
    1940,
    2588,
    "Resources beyond grain",
    [
      paper(),
      ground(810),
      text("title", "More than grain.", 112, 88, 112),
      text(
        "context",
        "Illustrative household resources",
        116,
        228,
        typeScale.subheading,
      ),
      ...dependencies.map((d) =>
        relation(`${d.id}-link`, {
          lineWidth: 14,
          ...(d.id === "loss" ? { stroke: palette.red } : {}),
        }),
      ),
      relation("cereal-link", { lineWidth: 10 }),
      ...grain(130).filter((node) => node.id !== "grain-label"),
      group("cereal", 130, 760, 480, 100),
      text("cereal-label", "Cereal foods", 240, 0, typeScale.label, {
        parent: "cereal",
        align: "center",
      }),
      ...dependencies.flatMap((d) => [
        group(d.id, 860, d.y, 940, 100),
        text(`${d.id}-label`, d.label, 0, 0, typeScale.label, {
          parent: d.id,
          ...(d.id === "loss" ? { color: palette.red } : {}),
        }),
      ]),
      text(
        "qualifier",
        "Symbolic relationships, not an inventory",
        112,
        968,
        typeScale.qualifier,
      ),
    ],
    {
      preset: "relationship_build",
      anchor: "grain",
      branches: [
        {
          path: "cereal-link",
          destination: "cereal",
          window: cue(74, 92, "poorer-rural-households"),
          arrival: cue(80, 98, "cereal-foods"),
        },
        ...dependencies.map((d) => ({
          path: `${d.id}-link`,
          destination: d.id,
          window: cue(d.onset - 1940, d.onset - 1940 + 18, d.id),
          arrival: cue(
            d.onset - 1940 + 6,
            d.onset - 1940 + 24,
            `${d.id}-arrives`,
          ),
        })),
      ],
      moves: [],
      emphasis: [
        {
          node: "grain-art",
          window: cue(261, 285, "more-than-grain"),
          opacity: 0.7,
        },
      ],
    },
    [
      bind("cereal-link", "grain", [240, 416], "cereal", [240, 0]),
      ...dependencies.map((d, i) =>
        bind(`${d.id}-link`, "grain", [450, 80 + i * 70], d.id, [0, 44], -16),
      ),
    ],
    [
      "cereal-label",
      ...dependencies.map((dependency) => `${dependency.id}-label`),
      "qualifier",
    ],
  );

  const second = scene(
    2588,
    2891,
    "A particular household and year",
    [
      paper(),
      ground(810),
      text("title", "No universal pantry.", 112, 88, 112),
      text("context", "A particular margin", 116, 228, typeScale.subheading),
      relation("home-link", { lineWidth: 18 }),
      relation("year-link", { lineWidth: 14 }),
      ...grain(130),
      ...home(),
      group("year", 1040, 868, 740, 100),
      text("year-label", "A particular year", 0, 0, typeScale.label, {
        parent: "year",
      }),
      text(
        "qualifier",
        "Illustrative household",
        112,
        968,
        typeScale.qualifier,
      ),
    ],
    {
      preset: "relationship_build",
      anchor: "grain",
      branches: [
        {
          path: "home-link",
          destination: "home",
          window: cue(125, 143, "a-household"),
          arrival: cue(131, 149, "household-arrives"),
        },
        {
          path: "year-link",
          destination: "year",
          window: cue(204, 222, "particular-year"),
          arrival: cue(210, 228, "year-arrives"),
        },
      ],
      moves: [],
      emphasis: [],
    },
    [
      bind("home-link", "grain", [450, 190], "home", [55, 240], -24),
      bind("year-link", "home", [580, 300], "year", [700, 35], 36),
    ],
    ["grain-label", "home-label", "year-label", "qualifier"],
  );

  const third = scene(
    2891,
    3170,
    "Stored food as an uneven bridge",
    [
      paper(),
      ground(810),
      text("title", "A bridge, not a guarantee.", 112, 88, 94),
      text(
        "context",
        "Stored and preserved food",
        116,
        228,
        typeScale.subheading,
      ),
      relation("bridge", { lineWidth: 20 }),
      relation("limit-link", { lineWidth: 14, stroke: palette.red }),
      ...grain(130, "Stored food"),
      ...home(),
      group("bridge-note", 640, 425, 430, 90),
      text("bridge-label", "Can bridge", 0, 0, typeScale.label, {
        parent: "bridge-note",
      }),
      group("limit", 720, 865, 970, 90),
      text("limit-label", "Uneven and finite", 0, 0, typeScale.label, {
        parent: "limit",
        color: palette.red,
      }),
      text(
        "qualifier",
        "Severity varies by household and year",
        112,
        968,
        typeScale.qualifier,
      ),
    ],
    {
      preset: "relationship_build",
      anchor: "grain",
      branches: [
        {
          path: "bridge",
          destination: "bridge-note",
          window: cue(31, 49, "could-bridge"),
          arrival: cue(37, 55, "can-bridge"),
        },
        {
          path: "limit-link",
          destination: "limit",
          window: cue(94, 112, "uneven"),
          arrival: cue(100, 118, "finite"),
        },
      ],
      moves: [],
      emphasis: [],
    },
    [
      bind("bridge", "grain", [450, 190], "home", [55, 240], -24),
      bind("limit-link", "grain", [450, 375], "limit", [0, 42], 20),
    ],
    ["grain-label", "home-label", "bridge-label", "limit-label", "qualifier"],
  );

  const fourth = StorySceneSchema.parse({
    ...comparison,
    title: "The same season, unequal buffers",
    episodeStartFrame: 3170,
    frameCount: 277,
    nodes: comparison.nodes.map((node) =>
      node.id === "qualifier" && node.type === "text"
        ? { ...node, text: "No shared deadline; no measured amounts" }
        : node,
    ),
    recipe: {
      ...comparison.recipe,
      strain: cue(0, 72, "one-household-lasts-longer", "in-out-quint"),
      labelWindows: [cue(48, 72, "more-room"), cue(80, 104, "less-room")],
    },
  });
  return [first, second, third, fourth];
}
