import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import {
  analyzePassageTypography,
  analyzeTypography,
  contrastRatio,
  textReadingWindows,
} from "../../packages/renderer-core/src/typography-quality.ts";
import {
  indexStoryEvents,
  retimeStoryEvents,
} from "../../packages/renderer-core/src/story-event-index.ts";
import {
  evaluateTextPoses,
  textAnimatorSettleFrame,
} from "../../packages/renderer-core/src/typography-animation.ts";
import type { ShapedLayout } from "../../packages/renderer-core/src/shaped-text.ts";
import type { PreparedTypography } from "../../packages/renderer-core/src/typography-renderer.ts";
import { contrastSampleFrames } from "../../packages/renderer-core/src/typography-pixels.ts";
import { textVisibility } from "../../packages/renderer-core/src/typography-visibility.ts";
import { quantizeStrokeWidth } from "../../packages/renderer-core/src/typography-renderer.ts";

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

type Compiled = ReturnType<typeof compileStoryScene>;
type TextNode = Extract<Compiled["nodes"][number], { type: "text" }>;
const textNode = (scene: Compiled, id: string) => {
  const node = scene.nodes.find((n) => n.id === id);
  if (node?.type !== "text") throw new Error("missing text node " + id);
  return node;
};
/** One-line layout with 30 px glyph advances; enough for pose evaluation. */
function mockLayout(node: TextNode): ShapedLayout {
  const chars = Array.from(node.text);
  const spanIndex = (i: number) =>
    node.spans?.findIndex((s) => i >= s.start && i < s.end) ?? -1;
  const clusters = chars.map((text, i) => ({
    text,
    sourceIndex: i,
    spanIndex: spanIndex(i),
    wordIndex: chars.slice(0, i).filter((c) => c === " ").length,
    lineIndex: 0,
    x: i * 30,
    advance: 30,
    baseline: 60,
    ascent: 60,
    descent: 10,
    runIndex: 0,
  }));
  const width = chars.length * 30,
    indices = clusters.map((_, i) => i);
  return {
    text: node.text,
    lines: [
      {
        text: node.text,
        x: 0,
        width,
        baseline: 60,
        ascent: 60,
        descent: 10,
        clusters: indices,
      },
    ],
    clusters,
    runs: [
      {
        text: node.text,
        x: 0,
        baseline: 60,
        width,
        style: { size: node.fontSize },
        color: node.color,
        clusters: indices,
      },
    ],
    width,
    height: 70,
    left: 0,
    top: 0,
    lineHeight: node.fontSize * 1.2,
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
}
const preparedFor = (node: TextNode) =>
  ({
    nodes: new Map([
      [node.id, new Map([[node.text, { layout: mockLayout(node) }]])],
    ]),
    corrections: new Map(),
  }) as unknown as PreparedTypography;

describe("semantic typography and lint", () => {
  it("samples contrast inside a short text visibility window", () => {
    const scene = compileStoryScene(StorySceneSchema.parse(input()));
    scene.tracks.claim = {
      opacity: [
        { time: 0, value: 0 },
        { time: 20, value: 1, step: true },
        { time: 30, value: 0, step: true },
      ],
    };
    const frames = contrastSampleFrames(scene, textNode(scene, "claim"));
    expect(frames.some((frame) => frame >= 20 && frame < 30)).toBe(true);
  });
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
    // Release fades the emphasis layer; it does not add a second animator.
    expect(scene.textAnimators).toHaveLength(1);
    expect(scene.textAnimators?.[0]?.weight).toEqual([
      { frame: 80, value: 1 },
      { frame: 100, value: 0, easing: "in-out-cubic" },
    ]);
  });
  it("releases a signal-bound emphasis from its current value without a jump", () => {
    const source = StorySceneSchema.parse({
      ...input(),
      signals: [
        {
          id: "margin",
          keys: [
            { frame: 0, value: 0 },
            { frame: 30, value: 1 },
            { frame: 60, value: 0 },
          ],
        },
      ],
      textEvents: [
        {
          node: "claim",
          span: "room",
          verb: "emphasize",
          manner: "compress",
          signal: "margin",
          at: 0,
          duration: 70,
        },
        { node: "claim", span: "room", verb: "release", at: 80, duration: 20 },
      ],
    });
    const scene = compileStoryScene(source),
      node = textNode(scene, "claim"),
      layout = mockLayout(node);
    const x = Array.from(
      { length: scene.frameCount },
      (_, frame) =>
        evaluateTextPoses(node, layout, scene.textAnimators!, frame, scene).at(
          -1,
        )!.x,
    );
    const steps = x.slice(1).map((value, i) => Math.abs(value - x[i]!));
    expect(Math.abs(x[79]! - x[80]!)).toBeLessThan(0.01);
    expect(Math.max(...steps)).toBeLessThan(1);
    expect(x[120]).toBe(0);
  });
  it("fades a held emphasis out over the release window", () => {
    const scene = compileStoryScene(
        StorySceneSchema.parse({
          ...input(),
          textEvents: [
            {
              node: "claim",
              span: "room",
              verb: "emphasize",
              manner: "compress",
              at: 0,
              duration: 20,
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
      ),
      node = textNode(scene, "claim"),
      layout = mockLayout(node);
    const tracking = (frame: number) =>
      evaluateTextPoses(node, layout, scene.textAnimators!, frame, scene).at(
        -1,
      )!.tracking;
    expect(tracking(79)).toBe(-45);
    expect(tracking(80)).toBe(-45);
    expect(tracking(90)).toBeGreaterThan(-45);
    expect(tracking(90)).toBeLessThan(0);
    expect(tracking(100)).toBe(0);
    expect(textAnimatorSettleFrame(scene.textAnimators![0]!)).toBe(100);
  });
  it("uses a pinned weight axis for weight emphasis", () => {
    const scene = compileStoryScene(
      StorySceneSchema.parse({
        ...input(),
        fonts: [
          {
            ...input().fonts[0],
            variable: { wght: { min: 100, default: 400, max: 900 } },
          },
        ],
        textEvents: [
          {
            node: "claim",
            span: "room",
            verb: "emphasize",
            manner: "weight",
            at: 10,
            duration: 20,
          },
        ],
      }),
    );
    expect(scene.textAnimators?.[0]?.to).toEqual({ axes: { wght: 150 } });
    const outlined = compileStoryScene(
      StorySceneSchema.parse({
        ...input(),
        textEvents: [
          {
            node: "claim",
            span: "room",
            verb: "emphasize",
            manner: "weight",
            at: 10,
            duration: 20,
          },
        ],
      }),
    );
    expect(outlined.textAnimators?.[0]?.to).toEqual({
      stroke: "#222222",
      strokeWidth: 1.12,
    });
    expect(() =>
      compileStoryScene(
        StorySceneSchema.parse({
          ...input(),
          textEvents: [
            {
              node: "claim",
              verb: "emphasize",
              manner: "weight",
              amount: -1,
              at: 10,
              duration: 20,
            },
          ],
        }),
      ),
    ).toThrow("text-weight-amount");
  });
  it("checks motion in every reading window and flags a named drift layer", () => {
    const scene = compileStoryScene(StorySceneSchema.parse(input()));
    scene.tracks.claim = {
      opacity: [
        { time: 0, value: 1 },
        { time: 20, value: 0, step: true },
        { time: 40, value: 1, step: true },
      ],
    };
    scene.textAnimators = [
      {
        node: "claim",
        unit: "word",
        start: 50,
        end: 70,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: {},
        to: { offset: [20, 0] },
        layer: "current",
      },
    ];
    const diagnostics = analyzeTypography(scene, {
      prepared: preparedFor(textNode(scene, "claim")),
    }).diagnostics;
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "moving-while-read",
          nodes: ["claim"],
        }),
        expect.objectContaining({ code: "idle-type-motion", nodes: ["claim"] }),
      ]),
    );
    expect(
      diagnostics.find((d) => d.code === "moving-while-read")?.frames[0],
    ).toBeGreaterThanOrEqual(40);
  });
  it("measures only the layout displayed in each reading window", () => {
    const raw = input();
    raw.nodes[0] = {
      ...raw.nodes[0]!,
      text: "A",
      states: ["A", "AB"],
      spans: undefined,
    } as never;
    const scene = compileStoryScene(
      StorySceneSchema.parse({
        ...raw,
        textAnimators: [
          {
            node: "claim",
            unit: "glyph",
            start: 10,
            end: 60,
            stagger: 0,
            selector: { start: 1, end: 1 },
            from: {},
            to: { offset: [40, 0] },
            cue: "second-glyph",
          },
        ],
      }),
    );
    const node = textNode(scene, "claim");
    const prepared = (texts: string[]) =>
      ({
        nodes: new Map([
          [
            node.id,
            new Map(
              texts.map((text) => [
                text,
                { layout: mockLayout({ ...node, text }) },
              ]),
            ),
          ],
        ]),
        corrections: new Map(),
      }) as unknown as PreparedTypography;
    const moving = (texts: string[]) =>
      analyzeTypography(scene, {
        prepared: prepared(texts),
      }).diagnostics.filter(
        (d) => d.code === "moving-while-read" && d.nodes[0] === "claim",
      );
    // "AB" is prepared as a state but never displayed; its second glyph must not be reviewed.
    expect(moving(["A", "AB"])).toEqual(moving(["A"]));
    expect(moving(["A", "AB"])).toEqual([]);
    expect(
      textReadingWindows(scene).find((w) => w.node === "claim")?.text,
    ).toBe("A");
  });
  it("reports only the texts the renderer draws at each frame", () => {
    const raw = input();
    raw.nodes[2] = {
      ...raw.nodes[2]!,
      transition: { kind: "count", window: { start: 30, end: 80 } },
    } as never;
    raw.nodes[1] = {
      ...raw.nodes[1]!,
      text: "Not every detail",
      states: ["Not every detail", "Not every date"],
      transition: { kind: "retype", window: { start: 30, end: 80 } },
    } as never;
    const scene = compileStoryScene(StorySceneSchema.parse(raw));
    const count = textVisibility(scene, textNode(scene, "count"));
    expect(count[0]!.texts).toEqual(["12"]);
    expect(count[55]!.changing).toBe(true);
    expect(count[55]!.texts).toHaveLength(1);
    expect(count[55]!.texts[0]).not.toMatch(/^(12|1,280)$/);
    expect(count.at(-1)!.texts).toEqual(["1,280"]);
    const qualifier = textNode(scene, "qualifier");
    const layouts = new Map(
      qualifier.states!.map((text) => [
        text,
        mockLayout({ ...qualifier, text }),
      ]),
    );
    // A retype draws one of its two layouts; a blended transition would draw both.
    expect(textVisibility(scene, qualifier, layouts)[40]!.texts).toHaveLength(
      1,
    );
    expect(textVisibility(scene, qualifier)[40]!.texts).toEqual(
      qualifier.states,
    );
  });
  it("shares animated outline widths on a quarter-pixel grid", () => {
    expect(quantizeStrokeWidth(0.1)).toBe(0);
    expect(quantizeStrokeWidth(3.37)).toBe(3.25);
    expect(quantizeStrokeWidth(3.38)).toBe(3.5);
    expect(
      new Set(
        Array.from({ length: 120 }, (_, i) =>
          quantizeStrokeWidth((i / 119) * 4),
        ),
      ).size,
    ).toBe(17);
  });
  it("moves a single-line claim away from its qualifier", () => {
    for (const [qualifierY, direction] of [
      [200, -1],
      [-200, 1],
    ] as const) {
      const raw = input();
      raw.nodes[1] = { ...raw.nodes[1]!, y: qualifierY } as never;
      const scene = compileStoryScene(
          StorySceneSchema.parse({
            ...raw,
            textEvents: [
              {
                node: "qualifier",
                verb: "qualify",
                target: "claim",
                at: 10,
                duration: 20,
              },
            ],
          }),
        ),
        claim = textNode(scene, "claim"),
        layout = mockLayout(claim);
      const y = (frame: number) =>
        evaluateTextPoses(
          claim,
          layout,
          scene.textAnimators!,
          frame,
          scene,
        ).map((p) => p.y);
      expect(y(5).every((v) => v === 0)).toBe(true);
      expect(y(40)).toEqual(y(40).map(() => direction * 0.15 * 80));
    }
  });
  it("flags a single-frame glyph jump and passes the compiled release", () => {
    const signals = [
      {
        id: "margin",
        keys: [
          { frame: 0, value: 0 },
          { frame: 30, value: 1 },
          { frame: 60, value: 0 },
        ],
      },
    ];
    const emphasis = {
      node: "claim",
      unit: "word" as const,
      start: 0,
      end: 70,
      stagger: 0,
      span: "room",
      signal: "margin",
      selector: { start: 0, end: 1 },
      from: {},
      to: { tracking: -45 },
    };
    // The previous release compiled to this: a restart from the full target.
    const popping = compileStoryScene(
      StorySceneSchema.parse({
        ...input(),
        signals,
        textAnimators: [
          emphasis,
          {
            ...emphasis,
            signal: undefined,
            start: 80,
            end: 100,
            from: { tracking: -45 },
            to: {},
          },
        ],
      }),
    );
    const fixed = compileStoryScene(
      StorySceneSchema.parse({
        ...input(),
        signals,
        textEvents: [
          {
            node: "claim",
            span: "room",
            verb: "emphasize",
            manner: "compress",
            signal: "margin",
            at: 0,
            duration: 70,
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
    const jumps = (scene: typeof fixed) =>
      analyzeTypography(scene, {
        prepared: preparedFor(textNode(scene, "claim")),
      }).diagnostics.filter((d) => d.code === "text-pose-jump");
    expect(jumps(popping)).toMatchObject([
      { nodes: ["claim"], frames: [79, 80] },
    ]);
    expect(jumps(fixed)).toEqual([]);
  });
  it("checks pose jumps in glyphs introduced by later text states", () => {
    const raw = input();
    raw.nodes[0] = {
      ...raw.nodes[0]!,
      text: "A",
      states: ["A", "AB"],
      spans: undefined,
      transition: { kind: "cut", window: { start: 60, end: 61 } },
    } as never;
    const scene = compileStoryScene(
      StorySceneSchema.parse({
        ...raw,
        textAnimators: [
          {
            node: "claim",
            unit: "glyph",
            start: 80,
            end: 100,
            stagger: 0,
            selector: { start: 1, end: 1 },
            from: { offset: [20, 0] },
            to: { offset: [0, 0] },
          },
        ],
      }),
    );
    const node = textNode(scene, "claim");
    const prepared = {
      nodes: new Map([
        [
          node.id,
          new Map([
            ["A", { layout: mockLayout({ ...node, text: "A" }) }],
            ["AB", { layout: mockLayout({ ...node, text: "AB" }) }],
          ]),
        ],
      ]),
    } as unknown as PreparedTypography;
    expect(
      analyzeTypography(scene, { prepared }).diagnostics.filter(
        (diagnostic) => diagnostic.code === "text-pose-jump",
      ),
    ).toMatchObject([{ nodes: ["claim"], frames: [79, 80] }]);
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
  it("detects variable weight hierarchy drift across passage beats", () => {
    const scene = StorySceneSchema.parse({
      ...input(),
      fonts: [
        {
          ...input().fonts[0],
          variable: { wght: { min: 100, default: 400, max: 900 } },
        },
      ],
      textStyles: {
        ...input().textStyles,
        heading: { fontAsset: "font", axes: { wght: 400 } },
      },
      nodes: input().nodes.map((node) =>
        node.id === "claim" ? { ...node, style: "heading" } : node,
      ),
    });
    const heavier = structuredClone(scene);
    heavier.textStyles!.heading!.axes!.wght = 700;
    expect(analyzePassageTypography([scene, heavier])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "hierarchy-drift", nodes: ["claim"] }),
      ]),
    );
  });
  it("starts a new reading window when a text state cuts", () => {
    const scene = compileStoryScene(
      StorySceneSchema.parse({
        ...input(),
        nodes: input().nodes.map((node) =>
          node.id === "claim"
            ? { ...node, states: ["Less room", "New message"] }
            : node,
        ),
      }),
    );
    scene.tracks.claim = {
      state: [
        { time: 0, value: 0 },
        { time: 110, value: 1, step: true },
      ],
    };
    expect(textReadingWindows(scene).filter((w) => w.node === "claim")).toEqual(
      [
        expect.objectContaining({ start: 0, end: 110, characters: 9 }),
        expect.objectContaining({ start: 110, end: 121, characters: 11 }),
      ],
    );
    expect(
      analyzeTypography(scene).diagnostics.some(
        (d) => d.code === "reading-time" && d.nodes[0] === "claim",
      ),
    ).toBe(true);
  });
  it("uses selector order to choose units in a partial range", () => {
    const scene = compileStoryScene(StorySceneSchema.parse(input()));
    const node = textNode(scene, "claim");
    const layout = mockLayout(node);
    const animator = {
      node: node.id,
      unit: "word" as const,
      start: 0,
      end: 10,
      stagger: 0,
      selector: { start: 0, end: 0, order: "reverse" as const },
      from: {},
      to: { offset: [12, 0] as [number, number] },
    };
    const poses = evaluateTextPoses(node, layout, [animator], 10, scene);
    expect(poses[0]!.x).toBe(0);
    expect(poses[5]!.x).toBe(12);
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

it("loads text event errors with native Node TypeScript stripping", () => {
  const source = new URL(
    "../../packages/scene-contract/src/typography-events.ts",
    import.meta.url,
  ).href;
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { TextEventError } from ${JSON.stringify(source)};
       const cause = new Error("invalid text event");
       const error = new TextEventError(cause, 3);
       console.log(JSON.stringify({
         message: error.message,
         eventIndex: error.eventIndex,
         preservedCause: error.cause === cause,
       }));`,
    ],
    { encoding: "utf8" },
  );
  expect(JSON.parse(output)).toEqual({
    message: "invalid text event",
    eventIndex: 3,
    preservedCause: true,
  });
});
