import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import {
  analyzeTypography,
  contrastRatio,
} from "../../packages/renderer-core/src/typography-quality.ts";
import {
  indexStoryEvents,
  retimeStoryEvents,
} from "../../packages/renderer-core/src/story-event-index.ts";
import { evaluateTextPoses } from "../../packages/renderer-core/src/typography-animation.ts";
import type { ShapedLayout } from "../../packages/renderer-core/src/shaped-text.ts";

const input = () => ({
  schemaVersion: "story-scene-1",
  title: "Type events",
  width: 1920,
  height: 1080,
  fps: 30,
  frameCount: 121,
  background: "#ffffff",
  motionModel: "curves-1",
  authoringVersion: "1",
  typography: "type-1",
  assets: [
    {
      id: "art",
      path: "art.svg",
      sha256: `sha256:${"0".repeat(64)}`,
      width: 1,
      height: 1,
    },
  ],
  fonts: [
    {
      id: "font",
      path: "font.ttf",
      sha256: `sha256:${"0".repeat(64)}`,
      weight: "400",
    },
  ],
  textStyles: { number: { fontAsset: "font", figures: "tabular" } },
  nodes: [
    {
      type: "text",
      id: "claim",
      fontAsset: "font",
      text: "Less room",
      textRole: "heading",
      fontSize: 80,
      color: "#222222",
      spans: [{ id: "room", start: 5, end: 9 }],
    },
    {
      type: "text",
      id: "qualifier",
      text: "Not every detail",
      textRole: "qualification",
      fontAsset: "font",
      fontSize: 36,
      color: "#222222",
    },
    {
      type: "text",
      id: "count",
      text: "12",
      states: ["12", "1,280"],
      textRole: "label",
      fontSize: 80,
      color: "#222222",
      style: "number",
    },
  ],
  recipe: { preset: "generic" },
  signals: [
    {
      id: "margin",
      keys: [
        { frame: 0, value: 0 },
        { frame: 60, value: 1 },
      ],
    },
  ],
  narrationTiming: {
    schemaVersion: "narration-timing-1",
    granularity: "word",
    segments: [{ text: "room", start: 1.5, end: 1.7 }],
  },
});

describe("semantic typography and lint", () => {
  it("compiles compression to the same geometry signal and releases held values", () => {
    const scene = compileStoryScene(
      StorySceneSchema.parse({
        ...input(),
        textEvents: [
          {
            id: "press",
            node: "claim",
            span: "room",
            verb: "emphasize",
            manner: "compress",
            signal: "margin",
            at: 0,
            duration: 60,
          },
          {
            node: "claim",
            span: "room",
            verb: "release",
            at: 80,
            duration: 20,
          },
        ],
      }),
    );
    expect(scene.rendererVersion).toBe("story-canvas-0.22.0");
    expect(scene.textAnimators?.[0]).toMatchObject({
      signal: "margin",
      span: "room",
      to: { tracking: -45 },
    });
    expect(scene.textAnimators?.[1]).toMatchObject({
      from: { tracking: -45 },
      to: {},
    });
  });
  it("lands emphasis on the spoken onset and indexes its editable window", () => {
    const source = StorySceneSchema.parse({
      ...input(),
      textEvents: [
        {
          id: "spoken",
          node: "claim",
          span: "room",
          verb: "emphasize",
          manner: "color",
          at: { narrationWord: "room" },
          duration: 10,
        },
      ],
    });
    expect(compileStoryScene(source).textAnimators?.[0]?.end).toBe(45);
    const firstWord = structuredClone(source);
    firstWord.narrationTiming!.segments[0]!.start = 0;
    expect(compileStoryScene(firstWord).textAnimators?.[0]).toMatchObject({
      start: 0,
      end: 1,
    });
    expect(
      indexStoryEvents(source).find((e) => e.id === "spoken"),
    ).toMatchObject({ start: 35, end: 45 });
    retimeStoryEvents(source, [], {}, { spoken: { start: 50, end: 65 } });
    expect(compileStoryScene(source).textAnimators?.[0]).toMatchObject({
      start: 50,
      end: 65,
    });
  });
  it("compiles reveal, marks, correction, qualification, retype, count, and redaction", () => {
    for (const verb of [
      "reveal",
      "emphasize",
      "correct",
      "qualify",
      "retype",
      "count",
      "redact",
    ] as const) {
      const event = {
        node: ["count", "retype"].includes(verb)
          ? "count"
          : verb === "qualify"
            ? "qualifier"
            : "claim",
        verb,
        at: 10,
        duration: 20,
        ...(verb === "correct"
          ? { replacement: "More room", span: "room" }
          : {}),
        ...(verb === "qualify" ? { target: "claim" } : {}),
      };
      const scene = compileStoryScene(
        StorySceneSchema.parse({ ...input(), textEvents: [event] }),
      );
      expect(
        scene.textAnimators?.length ||
          scene.nodes.some(
            (n) =>
              n.type === "text" &&
              (n.decorations?.length || n.transitions?.length),
          ),
      ).toBeTruthy();
    }
  });
  it("expands MC8 text intents through the semantic compiler", () => {
    const scene = compileStoryScene(
      StorySceneSchema.parse({
        ...input(),
        intentPresets: {
          schemaVersion: "story-motion-presets-1",
          motions: [
            {
              preset: "text-emphasize",
              node: "claim",
              span: "room",
              manner: "compress",
              window: { start: 10, end: 30 },
            },
          ],
        },
      }),
    );
    expect(scene.textAnimators?.[0]?.to?.tracking).toBe(-45);
  });
  it("finds the legacy recovered-pantry orphan split across sibling nodes", () => {
    const legacy = compileStoryScene(
      StorySceneSchema.parse(
        JSON.parse(
          readFileSync(
            "benchmarks/fixtures/story-motion/evidence-boundary.json",
            "utf8",
          ),
        ),
      ),
    );
    expect(
      analyzeTypography(legacy).diagnostics.some(
        (d) => d.code === "rag" && d.nodes.includes("composite-note-end"),
      ),
    ).toBe(true);
  });
  it("keeps lint advisory unless an explicit gate is requested", () => {
    const scene = compileStoryScene(
      StorySceneSchema.parse({ ...input(), frameCount: 61 }),
    );
    expect(
      analyzeTypography(scene, { readingFloorSeconds: 3 }).diagnostics.some(
        (d) => d.code === "reading-time",
      ),
    ).toBe(true);
    expect(() =>
      analyzeTypography(scene, {
        readingFloorSeconds: 3,
        failOn: ["reading-time"],
      }),
    ).toThrow("typography-quality-gate");
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    const hidden = structuredClone(scene);
    hidden.nodes[0]!.opacity = 0;
    expect(
      analyzeTypography(hidden).diagnostics.some(
        (d) =>
          d.code === "reading-time" &&
          d.nodes.includes("claim") &&
          d.measured === 0,
      ),
    ).toBe(true);
    expect(
      analyzeTypography(scene, {
        pixels: [
          { node: "claim", frame: 1, contrast: 1.2 },
          { node: "claim", frame: 20, handoffPixels: 12 },
        ],
      }).diagnostics.map((d) => d.code),
    ).toEqual(
      expect.arrayContaining(["text-contrast", "animator-handoff-snap"]),
    );
  });
  it("combines signal selectors, excludes spaces, and keeps held destinations after end", () => {
    const scene = compileStoryScene(StorySceneSchema.parse(input())),
      node = scene.nodes[0]!;
    if (node.type !== "text") throw new Error("wrong fixture");
    const clusters = Array.from("A B", (text, i) => ({
      text,
      sourceIndex: i,
      spanIndex: -1,
      wordIndex: i === 2 ? 1 : 0,
      lineIndex: 0,
      x: i * 20,
      advance: 20,
      baseline: 60,
      ascent: 60,
      descent: 10,
      runIndex: 0,
    }));
    const layout: ShapedLayout = {
      text: "A B",
      lines: [
        {
          text: "A B",
          x: 0,
          width: 60,
          baseline: 60,
          ascent: 60,
          descent: 10,
          clusters: [0, 1, 2],
        },
      ],
      clusters,
      runs: [
        {
          text: "A B",
          x: 0,
          baseline: 60,
          width: 60,
          style: { size: 80 },
          color: "#222222",
          clusters: [0, 1, 2],
        },
      ],
      width: 60,
      height: 70,
      left: 0,
      top: 0,
      lineHeight: 96,
      ascent: 60,
      descent: 10,
      capHeight: 55,
      xHeight: 40,
      tracking: 0,
      leading: 1.2,
      underlinePosition: 3,
      underlineThickness: 2,
      overflow: false,
    };
    const animator = {
      node: "claim",
      unit: "glyph" as const,
      start: 0,
      end: 20,
      stagger: 5,
      selector: { start: 0, end: 1 },
      from: { opacity: 0 },
      to: { opacity: 0.5 },
    };
    const poses = evaluateTextPoses(node, layout, [animator], 30, scene);
    expect(poses.map((p) => p.opacity)).toEqual([0.5, 1, 0.5]);
    expect(evaluateTextPoses(node, layout, [animator], 20, scene)).toEqual(
      poses,
    );
  });
});
