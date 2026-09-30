import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import {
  StorySceneSchema,
  type StoryScene,
} from "../../packages/scene-contract/src/story.ts";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { parseNarrationTiming } from "../../packages/renderer-core/src/narration-timing.ts";
import { readFontMetrics } from "../../packages/renderer-core/src/font-metrics.ts";

const directory = resolve("benchmarks/fixtures/typography");
await mkdir(directory, { recursive: true });
const font = async (id: string, path: string, weight: string) => {
  const bytes = await readFile(path),
    metrics = readFontMetrics(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
  return {
    id,
    path: relative(directory, resolve(path)),
    weight,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    ...(Object.keys(metrics.axes).length ? { variable: metrics.axes } : {}),
  };
};
const fonts = await Promise.all([
  font("body", "assets/story-motion/fonts/plex-sans-semibold.ttf", "600"),
  font("serif", "assets/story-motion/fonts/source-serif-4-semibold.otf", "600"),
  font("thai", "assets/ecommerce-motion/fonts/noto-sans-thai.ttf", "400"),
]);
const reference = JSON.parse(
  await readFile(
    "benchmarks/fixtures/story-motion/evidence-boundary.json",
    "utf8",
  ),
);
const base = {
  schemaVersion: "story-scene-1",
  title: "Typography",
  width: 1920,
  height: 1080,
  fps: 30,
  frameCount: 151,
  background: "#f4f1e8",
  assets: [reference.assets[0]],
  fonts,
  typography: "type-1",
  motionModel: "curves-1",
  authoringVersion: "1",
  textStyles: {
    display: { fontAsset: "body", size: 96, tracking: -15 },
    prose: { fontAsset: "body", size: 48 },
    emphasis: { fontAsset: "serif", size: 96 },
    number: { fontAsset: "body", size: 96, figures: "tabular" },
    variable: { fontAsset: "thai", size: 80, axes: { wdth: 100 } },
  },
  recipe: { preset: "generic" },
};
const text = (id: string, value: string, y: number, style = "display") => ({
  type: "text",
  id,
  text: value,
  x: 140,
  y,
  color: "#292827",
  fontSize: style === "prose" ? 48 : 96,
  style,
  textRole: style === "prose" ? "qualification" : "heading",
  anchor: "cap",
});
const animator = (node: string, from: object, extra: object = {}) => ({
  node,
  unit: "glyph",
  start: 0,
  end: 40,
  stagger: 0,
  selector: { start: 0, end: 1 },
  from,
  layer: "action",
  ...extra,
});
const save = async (name: string, input: unknown) => {
  const scene = StorySceneSchema.parse(input);
  await writeFile(
    resolve(directory, `${name}.json`),
    JSON.stringify(scene, null, 2) + "\n",
  );
  return scene;
};
await save("editorial", {
  ...base,
  title: "Rich editorial type",
  nodes: [
    {
      ...text(
        "headline",
        "A record supports categories, not every detail.",
        160,
      ),
      spans: [
        {
          id: "emphasis",
          start: 30,
          end: 46,
          style: "emphasis",
          color: "#a4362f",
        },
      ],
      wrap: "balance",
      textLayout: {
        width: 1460,
        height: 320,
        lineHeight: 1.2,
        overflow: "error",
      },
      decorations: [
        {
          span: "emphasis",
          kind: "underline",
          color: "#a4362f",
          lineStyle: "brush",
          reveal: [
            { frame: 42, value: 0 },
            { frame: 65, value: 1 },
          ],
        },
      ],
    },
    {
      ...text("rag", "Not a recovered pantry", 580, "prose"),
      decorations: [
        {
          kind: "strike",
          color: "#a4362f",
          lineStyle: "ink",
          reveal: [
            { frame: 80, value: 0 },
            { frame: 100, value: 1 },
          ],
        },
      ],
      wrap: "pretty",
      textLayout: {
        width: 450,
        height: 220,
        lineHeight: 1.4,
        overflow: "error",
      },
    },
  ],
  textAnimators: [
    animator(
      "headline",
      { offset: [0, 110], opacity: 0 },
      { mask: "line", lineOverlap: 0.6, anchor: "glyph" },
    ),
  ],
});
await save("selectors", {
  ...base,
  title: "Selectors and held span emphasis",
  nodes: [
    {
      ...text("headline", "AVATAR office affine typography", 200),
      spans: [{ id: "focus", start: 7, end: 13 }],
    },
    text("tracking", "Words share the same constraint", 480, "prose"),
  ],
  signals: [
    {
      id: "margin",
      keys: [
        { frame: 0, value: 0 },
        { frame: 60, value: 1 },
        { frame: 100, value: 1 },
        { frame: 140, value: 0 },
      ],
    },
  ],
  textAnimators: [
    animator(
      "tracking",
      { offset: [0, 60], opacity: 0 },
      {
        unit: "word",
        mask: "word",
        anchor: "word",
        stagger: 2,
        selector: { start: 0, end: 1, order: "center-out" },
      },
    ),
    animator(
      "headline",
      { scale: 0.25, opacity: 0, rotation: -15 },
      {
        anchor: "glyph",
        selector: { start: 0, end: 1, order: "seeded", seed: 44 },
        stagger: 1,
      },
    ),
    animator(
      "headline",
      { tracking: 0 },
      {
        start: 50,
        end: 80,
        span: "focus",
        to: { tracking: -60, fill: "#a4362f", skew: -8, baselineShift: 5 },
        layer: "response",
      },
    ),
    animator(
      "tracking",
      { tracking: 0 },
      {
        start: 0,
        end: 140,
        signal: "margin",
        to: { tracking: -80 },
        layer: "current",
        selectors: [
          {
            start: 0,
            end: 1,
            shape: "round",
            basedOn: "words",
            mode: "intersect",
          },
        ],
      },
    ),
  ],
});
await save("transitions", {
  ...base,
  title: "Source text transitions",
  nodes: [
    {
      ...text("crossfade", "Supported categories", 140, "prose"),
      states: ["Supported categories", "Exact details"],
      transition: { kind: "crossfade", window: { start: 30, end: 80 } },
    },
    {
      ...text("roll", "1908", 330),
      states: ["1908", "1928"],
      transition: { kind: "roll", window: { start: 30, end: 80 }, stagger: 4 },
    },
    {
      ...text("retype", "Not every detail", 550, "prose"),
      states: ["Not every detail", "Not a recovered pantry"],
      transition: {
        kind: "retype",
        window: { start: 30, end: 80 },
        caret: true,
      },
    },
    {
      ...text("count", "12", 760, "number"),
      states: ["12", "1,280"],
      transition: { kind: "count", window: { start: 30, end: 80 } },
    },
  ],
});
const alignment = parseNarrationTiming(
  await readFile("assets/parcel-story/narration-v001/alignment.json", "utf8"),
  "json",
);
const timing = {
  ...alignment,
  segments: alignment.segments.filter((w) => w.start < 5),
};
const narrated = await save("semantic", {
  ...base,
  title: "Parcel narration and text verbs",
  frameCount: 181,
  drivers: [
    {
      target: "pressure.scaleX",
      signal: "margin-pressure",
      map: { range: [0, 1], to: [1, 0.35] },
    },
  ],
  narrationTiming: timing,
  nodes: [
    {
      id: "pressure",
      type: "rect",
      x: 140,
      y: 530,
      width: 800,
      height: 96,
      fill: "#a4362f",
    },
    {
      ...text(
        "claim",
        "The parcel was waiting at the wrong door.",
        160,
        "prose",
      ),
      textRole: "heading",
      fontSize: 48,
      spans: [{ id: "wrong", start: 30, end: 35 }],
    },
    {
      ...text("margin", "Less room", 390),
      spans: [{ id: "room", start: 5, end: 9 }],
    },
    {
      ...text("qualifier", "Not every detail", 650, "prose"),
      textRole: "qualification",
    },
  ],
  signals: [
    {
      id: "margin-pressure",
      keys: [
        { frame: 0, value: 0 },
        { frame: 60, value: 1 },
        { frame: 100, value: 1 },
        { frame: 140, value: 0 },
      ],
    },
  ],
  textEvents: [
    {
      id: "spoken-emphasis",
      node: "claim",
      span: "wrong",
      verb: "emphasize",
      manner: "color",
      color: "#a4362f",
      at: { narrationWord: "wrong" },
      duration: 8,
    },
    {
      id: "compress",
      node: "margin",
      span: "room",
      verb: "emphasize",
      manner: "compress",
      signal: "margin-pressure",
      at: 0,
      duration: 140,
    },
    {
      id: "qualification",
      node: "qualifier",
      verb: "qualify",
      target: "margin",
      at: 45,
      duration: 25,
    },
    {
      id: "correct",
      node: "claim",
      span: "wrong",
      verb: "correct",
      replacement: "opposite",
      at: 100,
      duration: 30,
    },
    {
      id: "release",
      node: "margin",
      span: "room",
      verb: "release",
      at: 145,
      duration: 20,
    },
  ],
});
await save("variable-thai", {
  ...base,
  title: "Variable Thai shared layout",
  nodes: [
    {
      ...text("thai", "พื้นที่และเวลาเปลี่ยนความหมาย", 260, "variable"),
      textRole: "body",
      fontSize: 80,
      textBox: { locale: "th", maxLines: 3, lineHeight: 1.5 },
      width: 1300,
      height: 400,
      wrap: "greedy",
    },
  ],
  textAnimators: [
    animator(
      "thai",
      { axes: { wdth: -35 } },
      { unit: "line", anchor: "line", end: 60 },
    ),
  ],
});
await save("glyph-performance", {
  ...base,
  title: "Sixty glyph performance",
  nodes: [
    {
      ...text(
        "glyphs",
        "AV office text motion keeps kerning and stable anchors. 01234",
        240,
        "prose",
      ),
      fontSize: 48,
    },
  ],
  textAnimators: [
    animator(
      "glyphs",
      { scale: 0.4, rotation: 10, offset: [0, 40] },
      { anchor: "glyph", end: 60 },
    ),
  ],
});
const vertical: StoryScene = StorySceneSchema.parse({
  ...narrated,
  width: 1080,
  height: 1920,
  format: "vertical",
  title: "Vertical type hierarchy",
  nodes: narrated.nodes.map((n) =>
    n.type === "text"
      ? {
          ...n,
          x: 90,
          y: n.y * 1.8,
          textLayout: {
            width: 900,
            height: 350,
            lineHeight: 1.4,
            overflow: "error",
          },
        }
      : { ...n, x: 90, y: n.y * 1.8 },
  ),
});
await writeFile(
  resolve(directory, "vertical.json"),
  JSON.stringify(vertical, null, 2) + "\n",
);
// Commerce uses the same type evaluator and opt-in renderer identity.
const commerceSource = JSON.parse(
  await readFile("benchmarks/fixtures/ecommerce-motion/h03-thai.json", "utf8"),
);
const commerce = CommerceSceneSchema.parse({
  ...commerceSource,
  typography: "type-1",
  motionModel: "curves-1",
  fonts: [...commerceSource.fonts],
  nodes: commerceSource.nodes.map((n: { type: string; textRole?: string }) =>
    n.type === "text"
      ? { ...n, textRole: n.textRole ?? "body", wrap: "greedy" }
      : n,
  ),
});
await writeFile(
  resolve(directory, "commerce.json"),
  JSON.stringify(commerce, null, 2) + "\n",
);
console.log(`Wrote typography acceptance fixtures to ${directory}`);
