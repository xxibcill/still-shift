import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { TextStyleSchema } from "../../packages/scene-contract/src/typography.ts";

const scene = () => ({
  schemaVersion: "story-scene-1",
  title: "Type",
  width: 1920,
  height: 1080,
  fps: 30,
  frameCount: 120,
  background: "#ffffff",
  assets: [
    {
      id: "art",
      path: "art.svg",
      sha256: `sha256:${"0".repeat(64)}`,
      width: 1,
      height: 1,
    },
  ],
  motionModel: "curves-1",
  authoringVersion: "1",
  typography: "type-1",
  fonts: [
    {
      id: "font",
      path: "font.ttf",
      sha256: `sha256:${"0".repeat(64)}`,
      weight: "400",
    },
  ],
  textStyles: { display: { fontAsset: "font", size: 96, tracking: -15 } },
  nodes: [
    {
      id: "title",
      type: "text",
      text: "A record supports categories",
      fontSize: 96,
      color: "#222222",
      textRole: "heading",
      style: "display",
    },
  ],
  recipe: { preset: "generic" },
});
describe("versioned typography contracts", () => {
  it("accepts reusable styles and requires explicit hierarchy", () => {
    expect(StorySceneSchema.parse(scene()).typography).toBe("type-1");
    expect(
      StorySceneSchema.safeParse({
        ...scene(),
        nodes: [{ ...scene().nodes[0], textRole: undefined }],
      }).success,
    ).toBe(false);
  });
  it("requires opt-in and pinned fonts", () => {
    expect(
      StorySceneSchema.safeParse({ ...scene(), typography: undefined }).success,
    ).toBe(false);
    expect(
      StorySceneSchema.safeParse({
        ...scene(),
        textStyles: { display: { size: 96 } },
      }).success,
    ).toBe(false);
  });
  it("rejects overlapping and out-of-state spans", () => {
    const node = {
      ...scene().nodes[0],
      spans: [
        { id: "a", start: 0, end: 5 },
        { id: "b", start: 4, end: 7 },
      ],
    };
    expect(
      StorySceneSchema.safeParse({ ...scene(), nodes: [node] }).success,
    ).toBe(false);
    expect(
      StorySceneSchema.safeParse({
        ...scene(),
        nodes: [{ ...node, spans: [{ start: 0, end: 7 }], states: ["Hi"] }],
      }).success,
    ).toBe(false);
  });
  it("validates semantic counters and inherits pinned axes for partial span styles", () => {
    const source = scene();
    expect(
      StorySceneSchema.safeParse({
        ...source,
        nodes: [{ ...source.nodes[0], states: ["12", "1280"] }],
        textEvents: [{ node: "title", verb: "count", at: 10, duration: 30 }],
      }).success,
    ).toBe(false);
    const variable = {
      ...source,
      fonts: [
        {
          ...source.fonts[0],
          variable: { wdth: { min: 75, default: 100, max: 125 } },
        },
      ],
      textStyles: { ...source.textStyles, narrow: { axes: { wdth: 90 } } },
      nodes: [
        { ...source.nodes[0], spans: [{ start: 0, end: 1, style: "narrow" }] },
      ],
    };
    expect(StorySceneSchema.safeParse(variable).success).toBe(true);
    variable.textStyles.narrow.axes.wdth = 200;
    expect(StorySceneSchema.safeParse(variable).success).toBe(false);
  });
  it("keeps strict fields and validates feature tags", () => {
    expect(
      TextStyleSchema.safeParse({ fontAsset: "font", features: { eval: 1 } })
        .success,
    ).toBe(false);
    expect(
      TextStyleSchema.safeParse({
        fontAsset: "font",
        tracking: 12,
        extra: true,
      }).success,
    ).toBe(false);
  });
  it("requires tabular figures for counters", () => {
    const node = {
      ...scene().nodes[0],
      states: ["12", "1,280"],
      transition: { kind: "count", window: { start: 10, end: 60 } },
    };
    expect(
      StorySceneSchema.safeParse({ ...scene(), nodes: [node] }).success,
    ).toBe(false);
    expect(
      StorySceneSchema.safeParse({
        ...scene(),
        nodes: [node],
        textStyles: {
          display: { ...scene().textStyles.display, figures: "tabular" },
        },
      }).success,
    ).toBe(true);
  });
});
