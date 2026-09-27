import { validateStateOwnership } from "../../packages/renderer-core/src/component-state.ts";
import { StoryPassagePlanSchema } from "../../packages/scene-contract/src/story-passage.ts";
import { StoryAuthoringPlanSchema } from "../../packages/scene-contract/src/story-authoring.ts";
import { describe, expect, it } from "vitest";
import commerceFixture from "../../benchmarks/fixtures/ecommerce-motion/atoms/studio.json" with { type: "json" };
import storyFixture from "../../benchmarks/fixtures/story-authoring/comparison-template.json" with { type: "json" };
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { ComponentDefinitionSchema } from "../../packages/scene-contract/src/components.ts";
import {
  ComponentDataSchema,
  ComponentDataV2Schema,
} from "../../packages/scene-contract/src/component-data.ts";
import {
  instantiateComponent,
  repeatComponent,
  addCommerceComponents,
  addStoryComponents,
} from "../../packages/renderer-core/src/component-instances.ts";
import {
  scaleComponent,
  rotateComponent,
  drawComponent,
} from "../../packages/renderer-core/src/component-behaviors.ts";
import {
  compilePreparedScene,
  evaluatePreparedNodeAtTime,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import { worldMatrix } from "../../packages/renderer-core/src/commerce-geometry.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";
import {
  indexStoryEvents,
  retimeStoryEvents,
} from "../../packages/renderer-core/src/story-event-index.ts";

const window = { start: 10, end: 30, easing: "linear" as const };
function definition() {
  const result = ComponentDefinitionSchema.parse({
    schemaVersion: "component-2",
    fonts: commerceFixture.fonts,
    bounds: { x: 0, y: 0, width: 300, height: 200 },
    exports: { subject: "marker", route: "route", label: "label" },
    nodes: [
      {
        id: "plane",
        type: "group",
        x: 100,
        y: 50,
        rotation: 90,
        width: 300,
        height: 200,
        origin: [0, 0],
      },
      {
        id: "route",
        parent: "plane",
        type: "path",
        points: [
          [0, 0],
          [0, 0],
          [100, 0],
          [100, 100],
        ],
        stroke: "#227755",
        lineWidth: 4,
      },
      {
        id: "marker",
        type: "rect",
        width: 20,
        height: 30,
        origin: [0.25, 0.75],
        fill: "#ff0000",
        rotation: 20,
      },
      {
        id: "label",
        type: "text",
        text: "A",
        fontSize: 32,
        fontAsset: commerceFixture.fonts[0]!.id,
        textBox: { locale: "en", maxLines: 1, lineHeight: 1.2 },
        color: "#222222",
        states: ["A", "B", "C"],
        width: 200,
        height: 80,
      },
    ],
    motions: [
      scaleComponent("grow", "plane", 2, window),
      rotateComponent("turn", "marker", -340, window),
    ],
    componentData: {
      schemaVersion: "scene-components-2",
      states: [
        {
          id: "caption",
          target: "label",
          initial: 0,
          cuts: [
            { id: "first", frame: 0, state: 1 },
            { id: "change", frame: 20, state: 2 },
          ],
        },
      ],
      travels: [
        {
          id: "journey",
          target: "marker",
          path: "route",
          from: 0,
          to: 1,
          window,
        },
      ],
    },
  });
  if (result.schemaVersion !== "component-2") throw new Error("v2 expected");
  return result;
}
function commerce(input = definition(), fps: 24 | 30 = 24) {
  return addCommerceComponents(
    CommerceSceneSchema.parse({
      ...commerceFixture,
      fps,
      frameCount: fps * 8,
      events: [],
    }),
    [instantiateComponent(input, { id: "tour" })],
  );
}

describe("component behavior batch", () => {
  it("keeps v1 contracts strict and opts v2 into new renderer identity", () => {
    expect(() =>
      ComponentDefinitionSchema.parse({
        ...definition(),
        schemaVersion: "component-1",
      }),
    ).toThrow();
    expect(() =>
      ComponentDataSchema.parse({
        schemaVersion: "scene-components-1",
        states: [],
      }),
    ).toThrow();
    expect(
      StoryPassagePlanSchema.shape.beats.element.shape.timing.safeParse({
        cut: { start: 20, end: 20 },
      }).success,
    ).toBe(false);
    expect(
      StoryAuthoringPlanSchema.shape.beats.element.shape.timing.safeParse({
        cut: { start: 20, end: 20 },
      }).success,
    ).toBe(true);
    expect(compilePreparedScene(commerce()).rendererVersion).toBe(
      "commerce-canvas-0.18.0",
    );
  });
  for (const fps of [24, 30] as const)
    it(`samples exact cuts and signed motion without seek history at ${fps}fps`, () => {
      const scene = compilePreparedScene(commerce(definition(), fps));
      const label = scene.nodes.find((n) => n.id === "tour__label")!;
      const marker = scene.nodes.find((n) => n.id === "tour__marker")!;
      const plane = scene.nodes.find((n) => n.id === "tour__plane")!;
      for (const frame of [31, 0, 19, 20, 21, 10, 30, 9, 20, 19.75]) {
        expect(evaluatePreparedNodeAtTime(scene, label, frame).state).toBe(
          frame < 20 ? 1 : 2,
        );
        const progress = Math.max(0, Math.min(1, (frame - 10) / 20));
        const state = evaluatePreparedNodeAtTime(scene, marker, frame);
        expect(state.rotation).toBeCloseTo(20 - 360 * progress);
        expect(
          evaluatePreparedNodeAtTime(scene, plane, frame).scaleX,
        ).toBeCloseTo(1 + progress);
        if (scene.schemaVersion !== "commerce-scene-1")
          throw new Error("commerce expected");
        const origin = transformPoint(
          worldMatrix(scene, marker, frame),
          [5, 22.5],
        );
        // Independently derive a 90-degree route transform, uniformly scaled around (0,0).
        const distance = progress * 200,
          x = Math.min(100, distance),
          y = Math.max(0, distance - 100);
        expect(origin[0]).toBeCloseTo(100 - y * (1 + progress));
        expect(origin[1]).toBeCloseTo(50 + x * (1 + progress));
      }
    });
  it("supports partial retract through the existing value engine and rejects competing draws", () => {
    const d = definition();
    d.componentData = ComponentDataV2Schema.parse({
      ...d.componentData,
      ...drawComponent("retract", "route", 0.8, 0.2, window),
      schemaVersion: "scene-components-2",
    });
    const scene = compilePreparedScene(commerce(d)),
      path = scene.nodes.find((n) => n.id === "tour__route")!;
    expect(
      [0, 10, 20, 30, 40].map(
        (f) => evaluatePreparedNodeAtTime(scene, path, f).reveal,
      ),
    ).toEqual([0.8, 0.8, 0.5, 0.2, 0.2]);
    d.componentData.bindings.push(...d.componentData.bindings);
    expect(() => commerce(d)).toThrow(/Duplicate component binding/);
  });
  it("namespaces point events and retimes only the middle repeated instance", () => {
    const copies = repeatComponent({ fps: 24, frameCount: 192 }, definition(), {
      ids: ["a", "b", "c"],
      start: 5,
      stagger: 10,
    });
    const source = addStoryComponents(
      StorySceneSchema.parse(storyFixture.scene),
      copies,
    );
    const unchanged = structuredClone(source.componentData);
    expect(
      indexStoryEvents(source).find((e) => e.id === "b__change"),
    ).toMatchObject({ kind: "cut", start: 35, end: 35, nodes: ["b__label"] });
    retimeStoryEvents(
      source,
      [],
      {},
      { b__change: { start: 40, end: 40 }, b__journey: { start: 35, end: 55 } },
    );
    expect(() => compilePreparedScene(source)).not.toThrow();
    if (
      source.componentData?.schemaVersion !== "scene-components-2" ||
      unchanged?.schemaVersion !== "scene-components-2"
    )
      throw new Error("v2 expected");
    expect(
      source.componentData.states.filter((s) => s.target !== "b__label"),
    ).toEqual(unchanged.states.filter((s) => s.target !== "b__label"));
    expect(() =>
      retimeStoryEvents(source, [], {}, { b__change: { start: 40, end: 41 } }),
    ).toThrow(/zero duration/);
  });
  it("rejects invalid state schedules, motion writers and route dependency cycles", () => {
    const duplicate = definition();
    if (duplicate.componentData.schemaVersion !== "scene-components-2")
      throw new Error("v2 expected");
    duplicate.componentData.states[0]!.cuts[1]!.frame = 0;
    expect(() => commerce(duplicate)).toThrow(/increasing/);
    const missing = definition();
    if (missing.componentData.schemaVersion !== "scene-components-2")
      throw new Error("v2 expected");
    missing.componentData.states[0]!.cuts[0]!.state = 3;
    expect(() => commerce(missing)).toThrow(/state index/);
    const competing = definition();
    competing.motions.push({
      id: "slide",
      node: "marker",
      property: "x",
      to: 10,
      window,
    });
    expect(() => commerce(competing)).toThrow(/ownership/);
    const cycle = definition();
    if (cycle.componentData.schemaVersion !== "scene-components-2")
      throw new Error("v2 expected");
    cycle.componentData.travels[0]!.target = "plane";
    expect(() => commerce(cycle)).toThrow(/dependency/);
  });
});

it.each([24, 30] as const)(
  "converts reverse travel between nested parents and screen/camera coordinates at %sfps",
  (fps) => {
    const d = definition();
    if (d.componentData.schemaVersion !== "scene-components-2")
      throw new Error("v2 expected");
    d.componentData.travels[0]!.from = 1;
    d.componentData.travels[0]!.to = 0;
    d.nodes.push({
      type: "group",
      id: "screen",
      clip: false,
      x: 50,
      y: 25,
      width: 100,
      height: 100,
      rotation: -90,
      origin: [0, 0],
      opacity: 1,
    });
    d.nodes.find((n) => n.id === "marker")!.parent = "screen";
    const source = addStoryComponents(
      StorySceneSchema.parse({
        ...storyFixture.scene,
        fps,
        frameCount: fps * 8,
      }),
      [instantiateComponent(d, { id: "tour" })],
    );
    source.motionGrammar = "v2";
    source.camera = {
      keys: [
        { frame: 0, x: 1000, y: 520, zoom: 1.2 },
        { frame: fps * 8 - 1, x: 1000, y: 520, zoom: 1.2 },
      ],
      depth: { tour__screen: 0, tour__plane: 1 },
    };
    const scene = compilePreparedScene(source);
    if (scene.schemaVersion !== "story-scene-1")
      throw new Error("story expected");
    const marker = scene.nodes.find((n) => n.id === "tour__marker")!;
    for (const frame of [31, 0, 10, 20, 30, 9, 20]) {
      const p = Math.max(0, Math.min(1, (frame - 10) / 20));
      const distance = (1 - p) * 200,
        x = Math.min(100, distance),
        y = Math.max(0, distance - 100);
      const expected = [
        960 + (100 - y * (1 + p) - 1000) * 1.2,
        540 + (50 + x * (1 + p) - 520) * 1.2,
      ];
      const actual = transformPoint(
        worldMatrix(scene, marker, frame),
        [5, 22.5],
      );
      expect(actual[0]).toBeCloseTo(expected[0]!);
      expect(actual[1]).toBeCloseTo(expected[1]!);
    }
  },
);

it("keeps adjacent scale segments continuous and expands to two native commerce events", () => {
  const d = definition();
  d.motions.push(
    scaleComponent("shrink", "plane", 0.5, {
      start: 30,
      end: 50,
      easing: "linear",
    }),
  );
  const sources = [
    commerce(d),
    addStoryComponents(StorySceneSchema.parse(storyFixture.scene), [
      instantiateComponent(d, { id: "tour", offset: [200, 300] }),
    ]),
  ];
  expect(
    sources[0]!.schemaVersion === "commerce-scene-1" &&
      sources[0]!.events.length,
  ).toBe(5);
  for (const source of sources) {
    const scene = compilePreparedScene(source),
      plane = scene.nodes.find((n) => n.id === "tour__plane")!;
    for (const [f, expected] of [
      [9, 1],
      [10, 1],
      [30, 2],
      [40, 1.25],
      [50, 0.5],
      [51, 0.5],
    ]) {
      const state = evaluatePreparedNodeAtTime(scene, plane, f!);
      expect(state.scaleX).toBe(expected);
      expect(state.scaleY).toBe(expected);
    }
  }
});

it("rejects missing routes, cue collisions, expanded limits and non-invertible parents", () => {
  const d = definition();
  if (d.componentData.schemaVersion !== "scene-components-2")
    throw new Error("v2 expected");
  d.componentData.travels[0]!.path = "missing";
  expect(() => commerce(d)).toThrow(/reference/);
  d.componentData.travels[0]!.path = "marker";
  expect(() => commerce(d)).toThrow(/path|dependency/);
  d.componentData.travels[0]!.path = "route";
  d.componentData.states[0]!.cuts[1]!.id = "journey";
  expect(() => commerce(d)).toThrow(/cue/);
  d.componentData.states[0]!.cuts[1]!.id = "change";
  expect(() =>
    repeatComponent({ fps: 24, frameCount: 192 }, d, {
      ids: ["a"],
      start: 180,
    }),
  ).toThrow(/timeline/);
  const states = d.componentData.states[0]!;
  states.cuts = Array.from({ length: 40 }, (_, i) => ({
    id: "cut" + i,
    frame: i,
    state: i % 3,
  }));
  expect(() =>
    addCommerceComponents(
      CommerceSceneSchema.parse({ ...commerceFixture, events: [] }),
      repeatComponent({ fps: 24, frameCount: 192 }, d, {
        ids: ["a", "b", "c"],
      }),
    ),
  ).toThrow(/100/);
  expect(() =>
    ComponentDataSchema.parse({
      schemaVersion: "scene-components-2",
      states: [
        {
          ...states,
          cuts: [...states.cuts, { id: "last", frame: 45, state: 0 }],
        },
      ],
    }),
  ).toThrow(/40/);
  expect(() =>
    ComponentDataSchema.parse({
      schemaVersion: "scene-components-2",
      travels: Array.from(
        { length: 33 },
        () =>
          d.componentData.schemaVersion === "scene-components-2" &&
          d.componentData.travels[0],
      ),
    }),
  ).toThrow(/32/);
  const collapsed = definition();
  collapsed.nodes.push({
    type: "group",
    id: "tiny",
    clip: false,
    width: 1,
    height: 1,
    x: 0,
    y: 0,
    rotation: 0,
    origin: [0, 0],
    opacity: 1,
  });
  collapsed.nodes.find((n) => n.id === "marker")!.parent = "tiny";
  collapsed.motions.push(scaleComponent("collapse", "tiny", 1e-10, window));
  expect(() => commerce(collapsed)).toThrow(/collapsed transform/);
});

it("rejects native state ownership, generated routes and image geometry on multi-state nodes", () => {
  const source = commerce();
  const shared = source.componentData;
  if (shared?.schemaVersion !== "scene-components-2")
    throw new Error("v2 expected");
  const image = source.nodes.find((n) => n.type === "image")!;
  if (image.type !== "image") throw new Error("image expected");
  image.states.push(...image.states);
  shared.states.push({
    id: "image",
    target: image.id,
    initial: 0,
    cuts: [{ id: "swap-image", frame: 20, state: 1 }],
  });
  const asset = source.assets.find((a) => a.id === image.states[0]!.asset)!;
  source.geometry = [
    {
      node: image.id,
      asset: asset.id,
      sha256: asset.sha256,
      visibleBounds: [0, 0, asset.width, asset.height],
      anchors: {},
      protectedRegions: [],
    },
  ];
  expect(() => CommerceSceneSchema.parse(source)).toThrow(/one|single|state/i);
  const story = addStoryComponents(StorySceneSchema.parse(storyFixture.scene), [
    instantiateComponent(definition(), { id: "tour" }),
  ]);
  if (story.componentData?.schemaVersion !== "scene-components-2")
    throw new Error("v2 expected");
  expect(() =>
    validateStateOwnership({
      ...story,
      tracks: { tour__label: { state: [{}] } },
    }),
  ).toThrow(/ownership/);
  story.componentData.annotations.push({
    path: "tour__route",
    points: [
      { node: "tour__marker", point: [0, 0], space: "node", offset: [0, 0] },
      { node: "tour__plane", point: [100, 0], space: "node", offset: [0, 0] },
    ],
    protect: [],
  });
  story.nodes.find((n) => n.id === "tour__route")!.parent = undefined;
  expect(() => compilePreparedScene(story)).toThrow(/authored route/);
});

it("keeps native recipe state ownership and expanded event caps authoritative", async () => {
  const fixture = (
    await import("../../benchmarks/fixtures/story-motion/category-swap.json", {
      with: { type: "json" },
    })
  ).default;
  const story = StorySceneSchema.parse({
    ...fixture,
    componentData: {
      schemaVersion: "scene-components-2",
      states: [
        {
          id: "category-change",
          target: "category",
          initial: 0,
          cuts: [{ id: "cut", frame: 60, state: 1 }],
        },
      ],
    },
  });
  expect(() => compilePreparedScene(story)).toThrow(/state ownership/);
  const scale = ComponentDefinitionSchema.parse({
    schemaVersion: "component-2",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    exports: { subject: "subject" },
    nodes: [{ id: "subject", type: "group", width: 10, height: 10 }],
    motions: [scaleComponent("grow", "subject", 2, window)],
  });
  const copies = repeatComponent({ fps: 24, frameCount: 192 }, scale, {
    ids: Array.from({ length: 51 }, (_, i) => "copy" + i),
  });
  expect(() =>
    addCommerceComponents(
      CommerceSceneSchema.parse({ ...commerceFixture, events: [] }),
      copies,
    ),
  ).toThrow(/100/);
  expect(() =>
    addStoryComponents(StorySceneSchema.parse(storyFixture.scene), copies),
  ).toThrow(/40/);
});

it("samples local arc length under a nonuniform route transform", () => {
  const d = definition();
  d.motions = d.motions.filter((m) => m.id !== "grow");
  const source = commerce(d);
  source.events.push({
    node: "tour__plane",
    property: "scaleX",
    start: 10,
    end: 30,
    to: 2,
    easing: "linear",
  });
  const scene = compilePreparedScene(CommerceSceneSchema.parse(source));
  const marker = scene.nodes.find((n) => n.id === "tour__marker")!;
  for (const frame of [0, 20, 25, 30, 20]) {
    const p = Math.max(0, Math.min(1, (frame - 10) / 20));
    const distance = 200 * p;
    const origin = transformPoint(worldMatrix(scene, marker, frame), [5, 22.5]);
    expect(origin[0]).toBeCloseTo(100 - Math.max(0, distance - 100));
    expect(origin[1]).toBeCloseTo(50 + Math.min(100, distance) * (1 + p));
  }
});

it("rejects route dependencies through effects and nonfinite path length", () => {
  const source = commerce();
  source.effects = [
    {
      type: "height-shadow",
      target: "tour__plane",
      source: "tour__marker",
      restY: 50,
      travel: 20,
      spread: 0.1,
      fade: 0.1,
    },
  ];
  expect(() => compilePreparedScene(CommerceSceneSchema.parse(source))).toThrow(
    /dependency cycle/,
  );
  const d = definition(),
    path = d.nodes.find((n) => n.id === "route")!;
  if (path.type !== "path") throw new Error("path expected");
  path.points = [
    [-1e308, 0],
    [1e308, 0],
  ];
  expect(() => commerce(d)).toThrow(/finite path length/);
  path.points = [
    [0, 0],
    [0, 0],
  ];
  expect(() => commerce(d)).toThrow(/zero (path )?length/);
});

it("holds the supplied fractional travel endpoints exactly", () => {
  const d = definition(),
    path = d.nodes.find((n) => n.id === "route")!,
    marker = d.nodes.find((n) => n.id === "marker")!;
  if (path.type !== "path") throw new Error("path expected");
  delete path.parent;
  path.points = [
    [0, 0],
    [1, 0],
  ];
  marker.origin = [0, 0];
  Object.assign(d.componentData.travels[0]!, { from: 0.2, to: 0.9 });
  const scene = compilePreparedScene(commerce(d));
  const node = scene.nodes.find((n) => n.id === "tour__marker")!;
  for (const frame of [0, 9, 10])
    expect(evaluatePreparedNodeAtTime(scene, node, frame).x).toBe(0.2);
  for (const frame of [30, 31, 191])
    expect(evaluatePreparedNodeAtTime(scene, node, frame).x).toBe(0.9);
});
