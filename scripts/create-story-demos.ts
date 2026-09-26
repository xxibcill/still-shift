import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { imageSize } from "image-size";
import { format } from "prettier";
import { StorySceneSchema } from "../packages/scene-contract/src/story.ts";

const directory = resolve("benchmarks/fixtures/story-motion");
const bytes = await readFile("assets/history-offstage-v2/objects-v1.png");
const dimensions = imageSize(bytes);
const assets = [
  {
    id: "objects",
    path: "../../../assets/history-offstage-v2/objects-v1.png",
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    width: dimensions.width,
    height: dimensions.height,
  },
];
type Node = Record<string, unknown>;
const ink = "#282C29",
  green = "#52684F",
  red = "#984D3D",
  ochre = "#AD7934",
  paper = "#EFE6D4";
const window = (start: number, end: number, cue: string) => ({
  start,
  end,
  cue,
});
const text = (
  id: string,
  value: string,
  x: number,
  y: number,
  size = 32,
  extra: Node = {},
): Node => ({
  id,
  type: "text",
  text: value,
  x,
  y,
  fontSize: size,
  color: ink,
  ...extra,
});
const group = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Node = {},
): Node => ({ id, type: "group", x, y, width, height, ...extra });
const rect = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  extra: Node = {},
): Node => ({ id, type: "rect", x, y, width, height, fill, ...extra });
const path = (id: string, points: number[][], extra: Node = {}): Node => ({
  id,
  type: "path",
  points,
  stroke: green,
  lineWidth: 9,
  ...extra,
});
const crops = {
  bin: [36, 66, 466, 386],
  pouch: [580, 31, 386, 455],
  bowl: [1034, 130, 474, 286],
  grain: [1078, 512, 404, 480],
};
const image = (
  id: string,
  crop: keyof typeof crops,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Node = {},
): Node => ({
  id,
  type: "image",
  x,
  y,
  width,
  height,
  states: [{ asset: "objects", crop: crops[crop] }],
  ...extra,
});
const heading = (title: string, subtitle: string): Node[] => [
  text("series", "HISTORY OFFSTAGE  /  STORY MOTION", 100, 55, 23, {
    color: green,
    weight: "bold",
  }),
  text("title", title, 100, 102, 62, { font: "serif" }),
  text("subtitle", subtitle, 103, 185, 28, { color: green }),
  text(
    "footer",
    "REUSABLE MOTION STUDY  ·  SCHEMATIC ARTWORK  ·  NOT A FINAL EPISODE SHOT",
    100,
    1010,
    21,
    { color: green },
  ),
];
const house = (id: string, x: number, y: number): Node[] => [
  group(id, x, y, 240, 220),
  rect(`${id}-wall`, 30, 80, 180, 140, "#D3C4A5", {
    parent: id,
    stroke: ink,
    lineWidth: 5,
  }),
  path(
    `${id}-roof`,
    [
      [8, 90],
      [120, 5],
      [232, 90],
    ],
    { parent: id, stroke: ink, lineWidth: 10 },
  ),
  rect(`${id}-door`, 97, 140, 47, 80, green, { parent: id }),
  path(
    `${id}-ground`,
    [
      [0, 220],
      [240, 220],
    ],
    { parent: id, stroke: ink, lineWidth: 5 },
  ),
];
const factor = (
  id: string,
  label: string,
  crop: keyof typeof crops,
  x: number,
  y: number,
): Node[] => [
  group(id, x, y, 260, 250),
  image(`${id}-art`, crop, 20, 0, 220, 190, { parent: id }),
  text(`${id}-label`, label, 130, 211, 28, {
    parent: id,
    align: "center",
    weight: "bold",
  }),
];
const link = (
  id: string,
  from: string,
  a: number[],
  to: string,
  b: number[],
) => ({ path: id, from: { node: from, point: a }, to: { node: to, point: b } });
type Demo = {
  id: string;
  title: string;
  description: string;
  nodes: Node[];
  recipe: Node;
  connectors?: Node[];
};
const demos: Demo[] = [];

demos.push({
  id: "unequal-margins",
  title: "Unequal Margins",
  description:
    "The same strain meets different room to absorb it. Household scale and common ground remain fixed.",
  nodes: [
    ...heading(
      "Same season. Unequal margins.",
      "One shared condition; different room to absorb strain.",
    ),
    text("season", "THE SAME SEASON", 960, 315, 32, {
      align: "center",
      color: green,
    }),
    path(
      "baseline",
      [
        [230, 800],
        [1690, 800],
      ],
      { stroke: "#B4A78D", lineWidth: 3 },
    ),
    ...house("house-a", 380, 570),
    ...house("house-b", 1280, 570),
    path(
      "pressure-a",
      [
        [0, 0],
        [0, 230],
        [25, 230],
      ],
      { x: 265, y: 555, stroke: red, lineWidth: 13 },
    ),
    path(
      "pressure-b",
      [
        [0, 0],
        [0, 230],
        [25, 230],
      ],
      { x: 1165, y: 555, stroke: ochre, lineWidth: 13 },
    ),
    text("strain", "STRAIN", 960, 470, 31, {
      align: "center",
      color: red,
      weight: "bold",
    }),
    text("less", "LESS ROOM", 500, 865, 34, { align: "center", color: red }),
    text("more", "MORE ROOM", 1400, 865, 34, { align: "center", color: green }),
  ],
  recipe: {
    preset: "unequal_margins",
    households: ["house-a", "house-b"],
    reference: "season",
    pressures: [
      { node: "pressure-a", to: [365, 555], condition: "strained" },
      { node: "pressure-b", to: [1190, 555], condition: "room" },
    ],
    labels: ["less", "more"],
    strain: window(48, 96, "shared-strain"),
  },
});

demos.push({
  id: "access-constraint",
  title: "Access Constraint",
  description:
    "Grain remains available. Both paths stay connected while the upper corridor visibly narrows.",
  nodes: [
    ...heading(
      "Available grain. Unequal access.",
      "A narrowing connection remains open.",
    ),
    path("route-a", [
      [590, 470],
      [1370, 470],
    ]),
    path("route-b", [
      [590, 770],
      [1370, 770],
    ]),
    image("store", "bin", 180, 460, 410, 340),
    text("available", "STILL AVAILABLE", 385, 845, 29, {
      align: "center",
      color: green,
    }),
    ...house("house-a", 1370, 280),
    ...house("house-b", 1370, 660),
    rect("side-a", 0, 0, 210, 16, red),
    rect("side-b", 0, 0, 210, 16, red),
    text("constraint", "ACCESS NARROWS", 1000, 605, 30, {
      align: "center",
      color: red,
    }),
  ],
  recipe: {
    preset: "access_constraint",
    source: "store",
    connections: ["route-a", "route-b"],
    route: "route-a",
    sides: ["side-a", "side-b"],
    openWidth: 170,
    constrainedWidth: 47,
    reveal: window(20, 56, "connections"),
    narrow: window(72, 120, "access-narrows"),
  },
});

demos.push({
  id: "relationship-build",
  title: "Relationship Build",
  description:
    "Connections appear as groups, then stay attached while dependencies move into a readable system.",
  nodes: [
    ...heading(
      "A store is part of a system.",
      "Relationships appear in useful groups, without token traffic.",
    ),
    path("relation-a", [
      [520, 540],
      [1150, 440],
    ]),
    path("relation-b", [
      [520, 680],
      [1250, 740],
    ]),
    image("store", "bin", 190, 420, 390, 330),
    ...factor("resources", "RESOURCES", "pouch", 1260, 295),
    ...factor("claims", "CLAIMS", "grain", 1390, 670),
  ],
  connectors: [
    link("relation-a", "store", [390, 120], "resources", [0, 125]),
    link("relation-b", "store", [390, 260], "claims", [0, 125]),
  ],
  recipe: {
    preset: "relationship_build",
    anchor: "store",
    branches: [
      {
        path: "relation-a",
        destination: "resources",
        window: window(24, 55, "resources"),
      },
      {
        path: "relation-b",
        destination: "claims",
        window: window(65, 97, "claims"),
      },
    ],
    moves: [
      {
        node: "resources",
        window: window(108, 144, "regroup"),
        to: { x: 1120, y: 305 },
      },
      {
        node: "claims",
        window: window(108, 144, "regroup"),
        to: { x: 1120, y: 650 },
      },
    ],
    emphasis: [
      { node: "resources", window: window(65, 97, "claims"), opacity: 0.65 },
      { node: "resources", window: window(144, 166, "system"), opacity: 1 },
    ],
  },
});

demos.push({
  id: "evidence-boundary",
  title: "Evidence Boundary",
  description:
    "Supported categories assemble, then make room for explicit unknowns and a separate composite household.",
  nodes: [
    ...heading(
      "What the evidence can tell us.",
      "Categories can be supported while exact details remain unknown.",
    ),
    rect("boundary", 145, 370, 1050, 520, "#E4D8BF", {
      stroke: ochre,
      lineWidth: 4,
    }),
    text(
      "qualifier",
      "ILLUSTRATIVE CATEGORIES  ·  NOT AN ITEMIZED INVENTORY",
      170,
      310,
      27,
      { color: green },
    ),
    ...factor("supported-a", "CATEGORY A", "pouch", 260, 485),
    ...factor("supported-b", "CATEGORY B", "bowl", 740, 485),
    group("unknown", 800, 430, 350, 370),
    text("question", "?", 145, 40, 125, {
      parent: "unknown",
      font: "serif",
      color: red,
      align: "center",
    }),
    text("unknown-label", "EXACT DETAILS", 145, 200, 29, {
      parent: "unknown",
      align: "center",
    }),
    text("unknown-value", "UNKNOWN", 145, 245, 35, {
      parent: "unknown",
      color: red,
      align: "center",
      weight: "bold",
    }),
    group("composite", 1380, 475, 300, 350),
    ...house("composite-house", 30, 0).map((n) =>
      n.id === "composite-house" ? { ...n, parent: "composite" } : n,
    ),
    text("composite-label", "COMPOSITE", 150, 255, 31, {
      parent: "composite",
      align: "center",
    }),
    text("composite-note", "Not a recovered pantry", 150, 303, 25, {
      parent: "composite",
      align: "center",
      color: red,
    }),
  ],
  recipe: {
    preset: "evidence_boundary",
    supported: [
      { node: "supported-a", window: window(20, 45, "category-a") },
      { node: "supported-b", window: window(45, 70, "category-b") },
    ],
    unknown: { node: "unknown", window: window(92, 122, "unknown") },
    composite: {
      node: "composite",
      window: window(138, 163, "inference-limit"),
    },
    boundary: "boundary",
    qualifier: "qualifier",
    moves: [
      {
        node: "supported-a",
        window: window(76, 108, "make-room"),
        to: { x: 205, y: 490, scale: 0.85 },
      },
      {
        node: "supported-b",
        window: window(76, 108, "make-room"),
        to: { x: 470, y: 490, scale: 0.85 },
      },
    ],
  },
});

demos.push({
  id: "dated-system-break",
  title: "Dated System Break",
  description:
    "Date first, ordered connection failures second. A hard cut introduces a distinct later period with unknown conditions.",
  nodes: [
    ...heading(
      "A crisis belongs to its context.",
      "The later local scene begins separately.",
    ),
    group("crisis", 0, 0, 1920, 1080),
    text(
      "crisis-date",
      "GREAT FAMINE  ·  1315–17  ·  COMPARISON",
      960,
      305,
      36,
      { parent: "crisis", align: "center", color: red },
    ),
    path(
      "break-a",
      [
        [590, 590],
        [1310, 470],
      ],
      { parent: "crisis", gapAt: 0.5, gapSize: 0.16 },
    ),
    path(
      "break-b",
      [
        [590, 700],
        [1310, 800],
      ],
      { parent: "crisis", gapAt: 0.6, gapSize: 0.16 },
    ),
    image("crisis-store", "bin", 200, 450, 390, 330, { parent: "crisis" }),
    ...factor("factor-a", "RESOURCES", "pouch", 1310, 360).map((n) =>
      n.id === "factor-a" ? { ...n, parent: "crisis" } : n,
    ),
    ...factor("factor-b", "ACCESS", "bowl", 1310, 680).map((n) =>
      n.id === "factor-b" ? { ...n, parent: "crisis" } : n,
    ),
    group("later", 0, 0, 1920, 1080),
    text("later-date", "WALSHAM  ·  1327–29", 960, 305, 43, {
      parent: "later",
      align: "center",
      color: green,
    }),
    ...house("later-house", 550, 530).map((n) =>
      n.id === "later-house" ? { ...n, parent: "later" } : n,
    ),
    text("later-unknown", "LOCAL CONDITIONS", 1200, 565, 32, {
      parent: "later",
      align: "center",
    }),
    text("later-state", "UNKNOWN", 1200, 625, 55, {
      parent: "later",
      align: "center",
      color: red,
      font: "serif",
    }),
  ],
  recipe: {
    preset: "dated_system_break",
    contextId: "famine-comparison",
    system: "crisis",
    context: "crisis-date",
    contextReadyFrame: 36,
    breaks: [
      { path: "break-a", window: window(40, 56, "first-stress") },
      { path: "break-b", window: window(76, 92, "second-stress") },
    ],
    reset: {
      atFrame: 144,
      group: "later",
      context: "later-date",
      contextId: "walsham-later",
    },
  },
});

demos.push({
  id: "category-swap",
  title: "Category Swap",
  description:
    "One authored category replaces another in a fixed slot. The surrounding relation stays in place.",
  nodes: [
    ...heading(
      "A different category. Same relationship.",
      "A discrete conceptual replacement, with no hybrid image.",
    ),
    text(
      "qualifier",
      "SCHEMATIC SUBSTITUTION  ·  NO SPECIES, AMOUNT OR EXCHANGE RATIO CLAIM",
      960,
      320,
      27,
      { align: "center", color: green },
    ),
    rect("slot", 240, 425, 450, 470, "#E4D8BF", {
      stroke: ochre,
      lineWidth: 4,
    }),
    path("relation", [
      [710, 655],
      [1280, 655],
    ]),
    image("category", "pouch", 335, 480, 260, 310, {
      states: [
        { asset: "objects", crop: crops.pouch },
        { asset: "objects", crop: crops.grain },
      ],
    }),
    text("slot-label", "CATEGORY", 465, 837, 30, {
      align: "center",
      color: green,
    }),
    ...house("household", 1300, 545),
    text("relation-label", "THE RELATIONSHIP PERSISTS", 1010, 735, 29, {
      align: "center",
    }),
  ],
  recipe: {
    preset: "category_swap",
    subject: "category",
    fromState: 0,
    toState: 1,
    swapFrame: 72,
    qualifier: "qualifier",
    stableAnchors: ["slot", "relation", "household"],
  },
});

demos.push({
  id: "motif-resolve",
  title: "Motif Resolve",
  description:
    "Known objects regroup into the conclusion; the outgoing land-to-claim relation gains emphasis.",
  nodes: [
    ...heading(
      "Familiar parts. A clearer answer.",
      "Resources, access and claims return as one relationship.",
    ),
    text(
      "qualifier",
      "CONCEPTUAL RELATIONSHIPS  ·  NO MEASURED QUANTITIES",
      960,
      300,
      27,
      { align: "center", color: green },
    ),
    path(
      "resource-link",
      [
        [0, 0],
        [1, 1],
      ],
      { lineWidth: 5 },
    ),
    path(
      "access-link",
      [
        [0, 0],
        [1, 1],
      ],
      { lineWidth: 5 },
    ),
    path(
      "outgoing",
      [
        [0, 0],
        [1, 1],
      ],
      { stroke: red, lineWidth: 13 },
    ),
    ...house("household", 255, 560),
    ...factor("resources", "RESOURCES", "bin", 740, 340),
    ...factor("access", "ACCESS", "pouch", 1200, 355),
    ...factor("claims", "RENT / SERVICE", "grain", 1400, 720),
    text("next", "NEXT: LAND AND ITS CLAIMS", 300, 925, 28, { color: red }),
  ],
  connectors: [
    link("resource-link", "household", [240, 70], "resources", [0, 125]),
    link("access-link", "household", [240, 110], "access", [0, 125]),
    link("outgoing", "household", [240, 170], "claims", [0, 125]),
  ],
  recipe: {
    preset: "motif_resolve",
    motifs: ["household", "resources", "access", "claims"],
    qualifier: "qualifier",
    outgoing: "outgoing",
    moves: [
      {
        node: "household",
        window: window(30, 80, "group-factors"),
        to: { x: 340, y: 570 },
      },
      {
        node: "resources",
        window: window(30, 80, "group-factors"),
        to: { x: 940, y: 380 },
      },
      {
        node: "access",
        window: window(50, 100, "group-factors"),
        to: { x: 1380, y: 380 },
      },
      {
        node: "claims",
        window: window(60, 110, "group-factors"),
        to: { x: 1250, y: 710 },
      },
    ],
    emphasis: [
      {
        node: "resources",
        window: window(124, 150, "outgoing-relation"),
        opacity: 0.45,
      },
      {
        node: "access",
        window: window(124, 150, "outgoing-relation"),
        opacity: 0.45,
      },
      {
        node: "resource-link",
        window: window(124, 150, "outgoing-relation"),
        opacity: 0.3,
      },
      {
        node: "access-link",
        window: window(124, 150, "outgoing-relation"),
        opacity: 0.3,
      },
    ],
    resolve: window(124, 154, "outgoing-relation"),
  },
});

await mkdir(directory, { recursive: true });
for (const demo of demos) {
  const scene = StorySceneSchema.parse({
    schemaVersion: "story-scene-1",
    title: demo.title,
    frameCount: 192,
    fps: 24,
    background: paper,
    assets,
    nodes: demo.nodes,
    recipe: demo.recipe,
    connectors: demo.connectors ?? [],
    provenance:
      "Reusable engineering/creative fixtures using original history-offstage-v2 artwork and procedural diagrams. Not selected episode derivatives or Phase 0 corpus evidence.",
  });
  await writeFile(
    resolve(directory, `${demo.id}.json`),
    await format(JSON.stringify(scene, null, 2), { parser: "json" }),
  );
}
await writeFile(
  resolve(directory, "catalog.json"),
  await format(
    JSON.stringify(
      demos.map(({ id, title, description }) => ({ id, title, description })),
      null,
      2,
    ),
    { parser: "json" },
  ),
);
console.log(`Prepared ${demos.length} story motion scenes in ${directory}`);
