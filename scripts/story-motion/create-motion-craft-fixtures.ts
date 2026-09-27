import { readFile, mkdir, writeFile } from "node:fs/promises";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";

const directory = "benchmarks/fixtures/motion-craft";
await mkdir(directory, { recursive: true });
const legacy = StorySceneSchema.parse(
  JSON.parse(
    await readFile(
      "benchmarks/fixtures/story-motion-buffer-press/unequal-margins.json",
      "utf8",
    ),
  ),
);
const recipe = legacy.recipe;
if (recipe.preset !== "unequal_margins")
  throw new Error("Expected Buffer Press");
const signal = {
  id: "pressure",
  cue: "shared-strain",
  keys: [
    { frame: 50, value: 0 },
    { frame: 104, value: 77, easing: "in-out-quint" },
  ],
  add: [
    { pulse: { at: 128, half: 12, depth: 10 } },
    { pulse: { at: 179, half: 12, depth: 10 } },
  ],
};
const scene = StorySceneSchema.parse({
  ...legacy,
  motionModel: "curves-1",
  recipe: {
    preset: "generic",
    entrances: [
      ...(recipe.entrances ?? []),
      ...recipe.labels.map((node, i) => ({
        node,
        verb: "attach",
        window: recipe.labelWindows![i],
      })),
    ],
    moves: [],
    emphasis: [],
  },
  signals: [signal],
  drivers: [
    { target: "pressure-a.y", signal: "pressure", blend: "add" },
    { target: "pressure-b.y", signal: "pressure", blend: "add" },
    {
      target: "house-a.y",
      signal: "pressure",
      layer: "response",
      blend: "add",
    },
    {
      target: "house-b.y",
      signal: "pressure",
      layer: "response",
      blend: "add",
      map: { clamp: [0, 28] },
    },
    {
      target: "house-b.rotation",
      signal: "pressure",
      map: { range: [28, 77], to: [0, -4.5] },
    },
    {
      target: "margin-a.scaleY",
      signal: "pressure",
      map: { range: [0, 170], to: [1, 0] },
    },
    {
      target: "margin-b.scaleY",
      signal: "pressure",
      map: { range: [0, 28], to: [1, 0], clamp: [0.08, 1] },
    },
  ],
  constraints: [
    {
      type: "contact",
      target: "house-b",
      surface: "pressure-b",
      point: [406 / 600, 49 / 440],
      solve: ["scaleY"],
      weight: [
        { frame: 0, value: 0 },
        { frame: 49, value: 0 },
        { frame: 50, value: 1, interpolation: "hold" },
      ],
    },
  ],
});
await writeFile(
  `${directory}/buffer-press.json`,
  JSON.stringify(scene, null, 2) + "\n",
);
const accelerated = StorySceneSchema.parse({
  ...scene,
  entranceProfile: "accelerate",
  periodic: [
    {
      node: "house-a",
      property: "y",
      start: 0,
      end: 191,
      layer: "carrier",
      oscillate: { period: 96, amplitude: 0.6 },
      weight: [
        { frame: 0, value: 1 },
        { frame: 50, value: 0 },
        { frame: 104, value: 0 },
        { frame: 140, value: 1 },
      ],
    },
  ],
});
await writeFile(
  `${directory}/buffer-press-accelerate.json`,
  JSON.stringify(accelerated, null, 2) + "\n",
);
const before = compileStoryScene(legacy),
  after = compileStoryScene(scene);
const differences = Array.from({ length: scene.frameCount }, (_, frame) => {
  let maximum = 0;
  const nodes = [
    "house-a",
    "house-b",
    "margin-a",
    "margin-b",
    "pressure-a",
    "pressure-b",
  ];
  for (const id of nodes) {
    const a = evaluatePreparedNode(
        before,
        before.nodes.find((n) => n.id === id)!,
        frame,
      ),
      b = evaluatePreparedNode(
        after,
        after.nodes.find((n) => n.id === id)!,
        frame,
      );
    for (const property of ["x", "y", "scaleY", "rotation"] as const)
      maximum = Math.max(maximum, Math.abs(a[property] - b[property]));
  }
  return { frame, maximum };
});
await writeFile(
  `${directory}/buffer-press-pose-comparison.json`,
  JSON.stringify(
    {
      legacyKeys: legacy.recipe.moves.reduce(
        (n, m) => n + (m.keys?.length ?? 0),
        0,
      ),
      replacementKeys: 0,
      tolerance: 0.001,
      maximum: Math.max(...differences.map((d) => d.maximum)),
      frames: differences,
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  `${directory}/catalog.json`,
  JSON.stringify(
    [
      {
        id: "buffer-press",
        title: "Buffer Press · declared contact",
        description:
          "One pressure signal drives houses, margins and bands; roof contact is solved analytically.",
      },
      {
        id: "buffer-press-accelerate",
        title: "Buffer Press · acceleration and layers",
        description: "Opt-in accelerated entrances and a ducked carrier layer.",
      },
    ],
    null,
    2,
  ) + "\n",
);
console.log({
  directory,
  maximumPoseDifference: Math.max(...differences.map((d) => d.maximum)),
});
const gallery = StorySceneSchema.parse({
  ...legacy,
  title: "Motion craft · primitive gallery",
  frameCount: 61,
  motionGrammar: "v2",
  motionModel: "curves-1",
  camera: undefined,
  review: undefined,
  nodes: [
    {
      id: "box",
      type: "rect",
      x: 200,
      y: 360,
      width: 180,
      height: 140,
      fill: "#245849",
      stroke: "#122C24",
      lineWidth: 4,
    },
    {
      id: "route",
      type: "path",
      points: [
        [200, 700],
        [600, 450],
        [1100, 700],
      ],
      stroke: "#B56538",
      lineWidth: 16,
      width: 1200,
      height: 800,
    },
    {
      id: "morph",
      type: "path",
      points: [
        [1200, 500],
        [1400, 350],
        [1600, 500],
      ],
      stroke: "#3D6580",
      lineWidth: 12,
      width: 1800,
      height: 800,
    },
    {
      id: "caption",
      type: "text",
      text: "Motion carries the idea",
      x: 120,
      y: 100,
      width: 1500,
      height: 100,
      fontAsset: "label",
      fontSize: 64,
      color: "#243C32",
    },
  ],
  connectors: [],
  recipe: {
    preset: "generic",
    emphasis: [],
    moves: [
      {
        node: "box",
        keys: [
          {
            frame: 0,
            x: 200,
            y: 360,
            fill: "#245849",
            skewX: 0,
            skewY: 0,
            anchorX: 0.5,
            anchorY: 0.5,
            blur: 0,
          },
          {
            frame: 30,
            x: 700,
            y: 330,
            smooth: true,
            fill: "#B56538",
            skewX: 12,
            skewY: -4,
            anchorX: 0.8,
            anchorY: 0.2,
            blur: 2,
          },
          {
            frame: 60,
            x: 1000,
            y: 360,
            fill: "#3D6580",
            skewX: 0,
            skewY: 0,
            anchorX: 0.5,
            anchorY: 0.5,
            blur: 0,
          },
        ],
      },
      {
        node: "route",
        keys: [
          {
            frame: 0,
            trimStart: 0,
            trimEnd: 0,
            trimOffset: 0,
            stroke: "#B56538",
            strokeWidth: 8,
          },
          {
            frame: 30,
            trimStart: 0,
            trimEnd: 1,
            trimOffset: 0,
            stroke: "#3D6580",
            strokeWidth: 16,
          },
          {
            frame: 60,
            trimStart: 0.2,
            trimEnd: 1,
            trimOffset: 0.2,
            strokeWidth: 8,
          },
        ],
      },
    ],
  },
  spatialPaths: [
    {
      node: "route",
      segments: [
        [
          [200, 700],
          [400, 380],
          [900, 400],
          [1100, 700],
        ],
      ],
    },
  ],
  pathMorphs: [
    {
      node: "morph",
      keys: [
        {
          frame: 0,
          points: [
            [1200, 500],
            [1400, 350],
            [1600, 500],
          ],
        },
        {
          frame: 60,
          points: [
            [1200, 450],
            [1400, 650],
            [1600, 450],
          ],
          easing: "in-out-cubic",
        },
      ],
    },
  ],
  textAnimators: [
    {
      node: "caption",
      unit: "glyph",
      start: 0,
      end: 40,
      stagger: 1,
      selector: { start: 0, end: 1, shape: "square" },
      from: {
        opacity: 0,
        offset: [0, 18],
        scale: 0.9,
        rotation: -4,
        blur: 3,
        color: "#B56538",
      },
    },
  ],
  effectsVersion: "effects-1",
  effects: [{ type: "motion-blur", shutterAngle: 180, samples: 3 }],
});
await writeFile(
  `${directory}/gallery.json`,
  JSON.stringify(gallery, null, 2) + "\n",
);
const catalog = JSON.parse(await readFile(`${directory}/catalog.json`, "utf8"));
const supply = StorySceneSchema.parse({
  ...JSON.parse(
    await readFile(
      "benchmarks/fixtures/reusable-components/story-supply-sequence.json",
      "utf8",
    ),
  ),
  motionModel: "curves-1",
});
if (
  supply.componentData &&
  supply.componentData.schemaVersion !== "scene-components-1"
)
  for (const state of supply.componentData.states)
    for (const cut of state.cuts) cut.ramp = 3;
await writeFile(
  `${directory}/supply-ramps.json`,
  JSON.stringify(supply, null, 2) + "\n",
);
const intents = StorySceneSchema.parse({
  ...gallery,
  title: "Motion craft · intent presets",
  effects: [],
  textAnimators: [],
  pathMorphs: [],
  spatialPaths: [],
  recipe: { preset: "generic", moves: [], emphasis: [] },
  intentPresets: {
    schemaVersion: "story-motion-presets-1",
    motions: [
      {
        preset: "land",
        node: "box",
        amount: 50,
        window: { start: 0, end: 24 },
      },
      {
        preset: "recoil",
        node: "box",
        amount: 8,
        window: { start: 30, end: 55 },
      },
    ],
  },
});
await writeFile(
  `${directory}/intent-presets.json`,
  JSON.stringify(intents, null, 2) + "\n",
);
catalog.push(
  {
    id: "supply-ramps",
    title: "Supply sequence · three-frame state ramps",
    description: "Measured text and image changes blend across three frames.",
  },
  {
    id: "intent-presets",
    title: intents.title,
    description:
      "Land and recoil authored entirely with serializable intent presets.",
  },
);
catalog.push({
  id: "gallery",
  title: gallery.title,
  description:
    "Smooth keys, color, trim, width, blur, skew, Bézier paths, path morph and glyph selectors.",
});
await writeFile(
  `${directory}/catalog.json`,
  JSON.stringify(catalog, null, 2) + "\n",
);
