import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { imageSize } from "image-size";
import { PreparedSceneSchema } from "../packages/scene-contract/src/prepared.ts";

const output = resolve("benchmarks/fixtures/history-offstage-v2");
await mkdir(output, { recursive: true });
const assets = await Promise.all(
  ["landscape.png", "objects-v1.png", "bowl-states.png"].map(async (name) => {
    const bytes = await readFile(resolve("assets/history-offstage-v2", name));
    const dimensions = imageSize(bytes);
    return {
      id: name.split(".")[0]!.replace("-v1", ""),
      path: `../../../assets/history-offstage-v2/${name}`,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      width: dimensions.width!,
      height: dimensions.height!,
    };
  }),
);
type Node = Record<string, unknown>;
const ink = "#211F1B",
  green = "#59664D",
  ochre = "#B47A2A",
  paper = "#E8DFC9",
  red = "#8B3F36";
const crops: Record<string, number[]> = {
  bin: [36, 66, 466, 386],
  pouch: [580, 31, 386, 455],
  bowl: [1034, 130, 474, 286],
  token: [60, 575, 416, 366],
  gate: [565, 516, 408, 478],
  grain: [1078, 512, 404, 480],
};
const img = (
  id: string,
  kind: string,
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
  states: [{ asset: "objects", crop: crops[kind] }],
  ...extra,
});
const text = (
  id: string,
  label: string,
  x: number,
  y: number,
  size = 34,
  extra: Node = {},
): Node => ({
  id,
  type: "text",
  text: label,
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
const curve = (a: number[], b: number[], c: number[], d: number[]) =>
  Array.from({ length: 49 }, (_, i) => {
    const t = i / 48,
      u = 1 - t;
    return [0, 1].map(
      (k) =>
        u * u * u * a[k]! +
        3 * u * u * t * b[k]! +
        3 * u * t * t * c[k]! +
        t * t * t * d[k]!,
    );
  });
const path = (
  id: string,
  points: number[][],
  stroke = green,
  extra: Node = {},
): Node => ({ id, type: "path", points, stroke, lineWidth: 16, ...extra });
const heading = (index: string, title: string, subtitle: string): Node[] => [
  text("kicker", `STILL SHIFT   /   MOTION STUDY ${index}`, 112, 72, 25, {
    color: green,
    weight: "bold",
  }),
  text("title", title, 110, 119, 76, { font: "serif" }),
  text("subtitle", subtitle, 114, 217, 31, { color: green }),
  rect("footer-rule", 112, 971, 1696, 2, ink),
  text(
    "footer",
    "LAYERED CHRONICLE   ·   ORIGINAL ILLUSTRATION / SCHEMATIC DEMONSTRATION",
    112,
    994,
    22,
    { color: green },
  ),
];
const scenes: {
  id: string;
  title: string;
  description: string;
  nodes: Node[];
  recipe: Node;
}[] = [];
scenes.push({
  id: "chronicle-reveal",
  title: "Layered reveal",
  description:
    "The foreground shifts; a route to the threshold becomes visible.",
  nodes: [
    ...heading(
      "01",
      "Beyond the store",
      "A foreground layer gives way to the relationship behind it.",
    ),
    {
      id: "land",
      type: "image",
      x: 112,
      y: 287,
      width: 1696,
      height: 650,
      states: [{ asset: "landscape" }],
      fit: "cover",
    },
    img("threshold", "gate", 702, 403, 399, 486),
    group("connection", 0, 0, 1920, 1080),
    path(
      "connection-path",
      curve([858, 815], [1100, 918], [1150, 747], [1370, 747]),
      ochre,
      { parent: "connection" },
    ),
    img("destination", "pouch", 1330, 620, 225, 276, { parent: "connection" }),
    img("foreground", "bin", 248, 541, 670, 400),
  ],
  recipe: {
    preset: "chronicle_reveal",
    foreground: "foreground",
    middle: "threshold",
    reveal: "connection",
    travel: -76,
  },
});

scenes.push({
  id: "resource-flow",
  title: "Resource flow",
  description:
    "Branches form in sequence; tokens arrive at two different uses.",
  nodes: [
    ...heading(
      "02",
      "One store. Several claims.",
      "The paths explain where a resource can go.",
    ),
    path("food-path", curve([656, 613], [920, 594], [1050, 441], [1430, 442])),
    path(
      "seed-path",
      curve([656, 645], [942, 678], [1004, 837], [1410, 812]),
      ochre,
    ),
    img("store", "bin", 167, 422, 510, 427),
    text("store-label", "THE RESOURCE", 417, 872, 30, {
      align: "center",
      weight: "bold",
    }),
    group("food", 0, 0, 1920, 1080),
    img("food-art", "bowl", 1370, 332, 350, 230, { parent: "food" }),
    text("food-label", "USE NOW", 1545, 578, 30, {
      parent: "food",
      align: "center",
      weight: "bold",
    }),
    group("seed", 0, 0, 1920, 1080),
    img("seed-art", "pouch", 1370, 646, 220, 250, { parent: "seed" }),
    text("seed-label", "KEEP FOR LATER", 1480, 916, 27, {
      parent: "seed",
      align: "center",
      weight: "bold",
    }),
    img("food-token", "token", 0, 0, 66, 58),
    img("seed-token", "token", 0, 0, 66, 58),
  ],
  recipe: {
    preset: "resource_flow",
    branches: [
      { path: "food-path", token: "food-token", destination: "food" },
      { path: "seed-path", token: "seed-token", destination: "seed" },
    ],
  },
});

scenes.push({
  id: "access-pressure",
  title: "Access pressure",
  description: "The route exists, but a restriction stops the token short.",
  nodes: [
    ...heading(
      "03",
      "Available is not accessible.",
      "A resource remains in sight while the connection becomes restricted.",
    ),
    path(
      "route",
      curve([565, 664], [871, 550], [1130, 550], [1440, 650]),
      green,
      { gapAt: 0.64, gapSize: 0.13 },
    ),
    img("source", "bin", 157, 435, 417, 377),
    img("destination", "gate", 1370, 358, 315, 470),
    text("source-label", "AVAILABLE", 364, 864, 31, {
      align: "center",
      weight: "bold",
    }),
    text("destination-label", "OUT OF REACH", 1540, 864, 31, {
      align: "center",
      weight: "bold",
    }),
    group("restriction", 0, 0, 1920, 1080),
    path(
      "slash-one",
      [
        [1100, 496],
        [1080, 537],
        [1120, 575],
        [1085, 616],
        [1117, 657],
      ],
      red,
      { parent: "restriction", lineWidth: 12 },
    ),
    path(
      "slash-two",
      [
        [1140, 496],
        [1120, 537],
        [1160, 575],
        [1125, 616],
        [1157, 657],
      ],
      red,
      { parent: "restriction", lineWidth: 12 },
    ),
    text("restriction-label", "ACCESS NARROWS", 1110, 725, 27, {
      parent: "restriction",
      color: red,
      align: "center",
      weight: "bold",
    }),
    img("traveller", "token", 0, 0, 74, 66),
  ],
  recipe: {
    preset: "access_pressure",
    route: "route",
    token: "traveller",
    barrier: "restriction",
    stopAt: 0.49,
  },
});

const comparisonNodes: Node[] = [];
for (let side = 0; side < 2; side++) {
  const p = side === 0 ? "left" : "right";
  comparisonNodes.push(
    group(p, side === 0 ? 112 : 1004, 294, 804, 640, { clip: true }),
    rect(`${p}-paper`, 0, 0, 804, 640, "#F1EADA", { parent: p }),
    {
      id: `${p}-land`,
      type: "image",
      parent: p,
      x: 0,
      y: 0,
      width: 804,
      height: 380,
      states: [{ asset: "landscape" }],
      fit: "cover",
    },
    img(`${p}-marker`, "gate", 309, 129, 190, 245, { parent: p }),
    text(
      `${p}-label`,
      side === 0 ? "LESS BUFFER" : "MORE BUFFER",
      42,
      409,
      32,
      { parent: p, weight: "bold" },
    ),
    rect(`${p}-baseline`, 42, 499, 720, 3, ink, { parent: p }),
    rect(`${p}-reserve`, 42, 531, 720, 42, side === 0 ? ochre : green, {
      parent: p,
      origin: [0, 0.5],
      radius: 3,
    }),
    text(`${p}-note`, "Same setting · qualitative margin", 42, 597, 25, {
      parent: p,
      color: green,
    }),
  );
}
scenes.push({
  id: "comparison-build",
  title: "Comparison builds",
  description:
    "Aligned panels share a condition; only their reserve margins change.",
  nodes: [
    ...heading(
      "04",
      "Same season. Unequal margins.",
      "A shared baseline makes the difference legible.",
    ),
    ...comparisonNodes,
  ],
  recipe: {
    preset: "comparison_build",
    panels: ["left", "right"],
    variables: ["left-reserve", "right-reserve"],
    remaining: [0.32, 0.76],
  },
});

scenes.push({
  id: "pose-prop-change",
  title: "Pose and prop change",
  description:
    "The prop advances, makes contact, then the bowl switches to its authored filled state.",
  nodes: [
    ...heading(
      "05",
      "From the store to the table.",
      "One allocation changes what is ready to use.",
    ),
    rect("surface", 112, 883, 1696, 4, green),
    img("store", "bin", 192, 443, 487, 428),
    {
      id: "bowl",
      type: "image",
      x: 1080,
      y: 505,
      width: 626,
      height: 370,
      states: [
        { asset: "bowl-states", crop: [62, 237, 794, 470] },
        { asset: "bowl-states", crop: [915, 237, 794, 470] },
      ],
    },
    img("portion", "token", 685, 607, 88, 79),
    text("store-name", "SHARED STORE", 420, 910, 27, {
      align: "center",
      color: green,
    }),
    text("bowl-name", "READY FOR USE", 1390, 910, 27, {
      align: "center",
      color: green,
    }),
  ],
  recipe: {
    preset: "pose_prop_change",
    actor: "bowl",
    prop: "portion",
    target: [1310, 565],
  },
});

scenes.push({
  id: "crisis-fracture",
  title: "Crisis fracture",
  description:
    "Named connections break in order while the context remains stable.",
  nodes: [
    ...heading(
      "06",
      "When connections fail",
      "A connected system becomes a fragmented one.",
    ),
    path(
      "upper-route",
      curve([656, 624], [860, 416], [1120, 398], [1390, 470]),
      ochre,
      { gapAt: 0.55, gapSize: 0.14 },
    ),
    path(
      "lower-route",
      curve([656, 664], [876, 840], [1114, 884], [1400, 795]),
      green,
      { gapAt: 0.59, gapSize: 0.17 },
    ),
    img("store", "bin", 162, 446, 493, 414),
    group("upper-panel", 1280, 305, 440, 300),
    rect("upper-paper", 0, 0, 440, 300, "#D0D7D9", {
      parent: "upper-panel",
      stroke: "#4B5F70",
      lineWidth: 4,
    }),
    img("upper-object", "pouch", 140, 13, 190, 260, { parent: "upper-panel" }),
    group("lower-panel", 1280, 659, 440, 270),
    rect("lower-paper", 0, 0, 440, 270, "#F1EADA", {
      parent: "lower-panel",
      stroke: ink,
      lineWidth: 4,
    }),
    img("lower-object", "bowl", 54, 31, 340, 210, { parent: "lower-panel" }),
    text("context", "TWO CONNECTIONS · TWO BREAKS", 819, 914, 27, {
      align: "center",
      color: red,
      weight: "bold",
    }),
  ],
  recipe: {
    preset: "crisis_fracture",
    paths: ["upper-route", "lower-route"],
    panels: ["upper-panel", "lower-panel"],
    context: "context",
  },
});

for (const scene of scenes) {
  const parsed = PreparedSceneSchema.parse({
    schemaVersion: "illustrated-scene-1",
    title: scene.title,
    durationMs: 7000,
    fps: 24,
    background: paper,
    assets,
    nodes: scene.nodes,
    recipe: scene.recipe,
    provenance:
      "Original Codex-generated illustration assets. See assets/history-offstage-v2/provenance.json. Engineering and creative proof only; no selected episode assets.",
  });
  await writeFile(
    resolve(output, `${scene.id}.json`),
    JSON.stringify(parsed, null, 2) + "\n",
  );
}
await writeFile(
  resolve(output, "catalog.json"),
  JSON.stringify(
    scenes.map(({ id, title, description }) => ({ id, title, description })),
    null,
    2,
  ) + "\n",
);
console.log(`Prepared ${scenes.length} illustrated scenes at ${output}`);
