import { describe, expect, it } from "vitest";
import commerce from "../../benchmarks/fixtures/ecommerce-motion/atoms/studio.json" with { type: "json" };
import story from "../../benchmarks/fixtures/story-authoring/comparison-template.json" with { type: "json" };
import { ComponentDefinitionSchema } from "../../packages/scene-contract/src/components.ts";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import {
  addCommerceComponents,
  addStoryComponents,
  instantiateComponent,
} from "../../packages/renderer-core/src/component-instances.ts";
import { sequenceComponents } from "../../packages/renderer-core/src/component-sequence.ts";
import {
  compilePreparedScene,
  evaluatePreparedNodeAtTime,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  indexStoryEvents,
  retimeStoryEvents,
} from "../../packages/renderer-core/src/story-event-index.ts";
import { prepareComponentTextFits } from "../../packages/renderer-core/src/component-text-fit.ts";
import { ComponentDataV3Schema } from "../../packages/scene-contract/src/component-data.ts";
import { buildReusableDemo } from "../../packages/renderer-core/src/reusable-component-demo.ts";
import { ReusableDemoSchema } from "../../packages/scene-contract/src/reusable-component-demo.ts";
import { worldMatrix } from "../../packages/renderer-core/src/commerce-geometry.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";

const definition = () =>
  ComponentDefinitionSchema.parse({
    schemaVersion: "component-3",
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    exports: { subject: "body" },
    nodes: [
      {
        id: "body",
        type: "rect",
        width: 100,
        height: 60,
        fill: "#cc6655",
        opacity: 0.5,
      },
    ],
    componentData: {
      schemaVersion: "scene-components-3",
      visibility: [
        { id: "visible", target: "body", window: { start: 5, end: 10 } },
      ],
    },
  });

it("preserves masks, state cuts and local gates through one scheduling offset", () => {
  const demo = buildReusableDemo(
    ReusableDemoSchema.parse({
      schemaVersion: "reusable-demo-3",
      example: "supply-sequence",
      mode: "story",
    }),
  );
  const data = demo.componentData;
  if (data?.schemaVersion !== "scene-components-3")
    throw new Error("v3 expected");
  expect(
    data.states.find((s) => s.id === "phase2__crop")!.cuts[0],
  ).toMatchObject({ frame: 96 });
  expect(
    data.values.find((v) => v.id === "phase2__aperture")!.window,
  ).toMatchObject({ start: 72, end: 107 });
  expect(
    data.travels.find((v) => v.id === "phase2__journey")!.window,
  ).toMatchObject({ start: 72, end: 107 });
  expect(data.masks[1]).toEqual({
    target: "phase2__detail",
    mask: "phase2__mask",
    invert: false,
  });
  expect(data.pins[1]!.anchor.node).toBe("phase2__detail");
  expect(compilePreparedScene(demo).rendererVersion).toBe(
    "story-canvas-0.18.0",
  );
});

it("rejects local overflow, foreign parents, cross-clip dependencies and generated cue collisions", () => {
  const d = definition();
  expect(() =>
    sequenceComponents({ fps: 24, frameCount: 192 }, [
      { id: "short", definition: d, duration: 9 },
    ]),
  ).toThrow(/short.*visibility/i);
  expect(() =>
    sequenceComponents({ fps: 24, frameCount: 192 }, [
      { id: "late", definition: d, duration: 10, start: 190 },
    ]),
  ).toThrow(/late.*timeline/i);
  d.externals = ["other"];
  d.nodes[0]!.parent = "other";
  expect(() =>
    sequenceComponents({ fps: 24, frameCount: 192 }, [
      {
        id: "parented",
        definition: d,
        duration: 10,
        external: { other: "scene-parent" },
      },
    ]),
  ).toThrow(/scene roots/);
  delete d.nodes[0]!.parent;
  expect(() =>
    sequenceComponents({ fps: 24, frameCount: 192 }, [
      {
        id: "first",
        definition: d,
        duration: 10,
        external: { other: "second__body" },
      },
      { id: "second", definition: definition(), duration: 10 },
    ]),
  ).toThrow(/another clip/);
  d.componentData = ComponentDataV3Schema.parse({
    schemaVersion: "scene-components-3",
  });
  d.motions = [
    {
      id: "lifetime-body",
      node: "body",
      property: "y",
      to: 3,
      window: { start: 0, end: 5, easing: "linear" },
    },
  ];
  expect(() =>
    sequenceComponents({ fps: 24, frameCount: 192 }, [
      {
        id: "collision",
        definition: d,
        duration: 10,
        external: { other: "persistent" },
      },
    ]),
  ).toThrow(/cue/);
});

it("rejects duplicate native gates, shared masks and incompatible fit ownership", () => {
  const scene = sources()[0]!;
  if (scene.schemaVersion !== "commerce-scene-1")
    throw new Error("commerce expected");
  scene.visibility = [{ target: "demo__body", start: 0, end: 20 }];
  expect(() => compilePreparedScene(scene)).toThrow(
    /Conflicting native\/component visibility/,
  );
  const masked = buildReusableDemo(
    ReusableDemoSchema.parse({
      schemaVersion: "reusable-demo-3",
      example: "mask",
      mode: "commerce",
    }),
  );
  if (
    masked.schemaVersion !== "commerce-scene-1" ||
    masked.componentData?.schemaVersion !== "scene-components-3"
  )
    throw new Error("v3 expected");
  masked.mattes = [
    {
      target: "timing__detail",
      mask: "timing__mask",
      invert: false,
      space: "canvas",
      order: "after-effects",
    },
  ];
  expect(() => compilePreparedScene(masked)).toThrow(
    /Conflicting native\/component mask/,
  );
  delete masked.mattes;
  masked.componentData.masks.push({
    target: "timing__mask",
    mask: "timing__detail",
    invert: false,
  });
  expect(() => compilePreparedScene(masked)).toThrow(/chains/);
  const fit = buildReusableDemo(
    ReusableDemoSchema.parse({
      schemaVersion: "reusable-demo-3",
      example: "text-fit",
      mode: "commerce",
    }),
  );
  if (fit.schemaVersion !== "commerce-scene-1")
    throw new Error("commerce expected");
  fit.textFits = [
    { target: "timing__caption", minSize: 16, maxSize: 40, padding: 0 },
  ];
  expect(() => compilePreparedScene(fit)).toThrow(/ownership|Conflicting/);
});

it("pins an independently rotated badge and rejects mixed position cycles", () => {
  const d = definition();
  if (d.componentData.schemaVersion !== "scene-components-3")
    throw new Error("v3 expected");
  d.nodes.push({
    ...d.nodes[0]!,
    id: "source",
    x: 200,
    y: 100,
    width: 80,
    height: 40,
    rotation: 90,
    origin: [0, 0],
  });
  d.componentData.pins = [
    {
      id: "pin",
      target: "body",
      anchor: {
        node: "source",
        point: [80, 0],
        space: "node",
        offset: [10, 20],
      },
    },
  ];
  for (const source of sources(d)) {
    const scene = compilePreparedScene(source),
      node = scene.nodes.find((n) => n.id === "demo__body")!;
    expect(evaluatePreparedNodeAtTime(scene, node, 6)).toMatchObject({
      x: 160,
      y: 170,
      rotation: 0,
    });
  }
  d.componentData.pins.push({
    id: "cycle",
    target: "source",
    anchor: { node: "body", point: [0, 0], space: "node", offset: [0, 0] },
  });
  expect(() => sources(d)).toThrow(/cycle/);
});

it("fits every caption state once without changing authored data", () => {
  const d = definition();
  d.nodes = ComponentDefinitionSchema.parse({
    ...d,
    nodes: [
      {
        id: "label",
        type: "text",
        text: "short",
        color: "#222222",
        states: ["short", "abcdefghij"],
        width: 100,
        height: 40,
        fontSize: 60,
        fontAsset: "font",
        textBox: { locale: "en", maxLines: 1, lineHeight: 1.2 },
      },
    ],
  }).nodes;
  if (d.componentData.schemaVersion !== "scene-components-3")
    throw new Error("v3 expected");
  d.componentData.textFits = [{ target: "label", minSize: 16, maxSize: 60 }];
  const context = {
    font: "",
    measureText(this: { font: string }, text: string) {
      const size = Number(/(\d+)px/.exec(this.font)?.[1]);
      return {
        width: (text.length * size) / 2,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: (text.length * size) / 2,
        actualBoundingBoxAscent: size,
        actualBoundingBoxDescent: 0,
      };
    },
  } as unknown as CanvasRenderingContext2D;
  const fonts = new Map([
    ["font", { family: "test", weight: "400" }],
  ]) as unknown as Parameters<typeof prepareComponentTextFits>[2];
  const fitted = prepareComponentTextFits(d, context, fonts);
  expect(fitted.nodes[0]).toMatchObject({
    fontSize: 20,
    width: 100,
    height: 40,
  });
  expect(d.nodes[0]).toMatchObject({ fontSize: 60 });
  d.componentData.textFits[0]!.minSize = 21;
  expect(() => prepareComponentTextFits(d, context, fonts)).toThrow(/minimum/);
});
const sources = (d = definition()) => {
  const instances = [instantiateComponent(d, { id: "demo" })];
  return [
    addCommerceComponents(CommerceSceneSchema.parse(commerce), instances),
    addStoryComponents(StorySceneSchema.parse(story.scene), instances),
  ];
};

it("pins through a rotating parent into screen space without inheriting source rotation or scale", () => {
  const d = definition();
  d.componentData = ComponentDataV3Schema.parse({
    schemaVersion: "scene-components-3",
    pins: [
      {
        id: "pin",
        target: "body",
        anchor: { node: "source", point: [80, 0], offset: [10, 20] },
      },
    ],
  });
  d.nodes.push({
    ...d.nodes[0]!,
    id: "source",
    x: 200,
    y: 100,
    width: 80,
    height: 40,
    rotation: 90,
    origin: [0, 0],
  });
  const parent = ComponentDefinitionSchema.parse({
    ...d,
    nodes: [
      {
        id: "screen",
        type: "group",
        x: 30,
        y: 20,
        rotation: -90,
        width: 400,
        height: 400,
        origin: [0, 0],
      },
    ],
  }).nodes[0]!;
  d.nodes.push(parent);
  d.nodes[0]!.parent = "screen";
  const source = addStoryComponents(StorySceneSchema.parse(story.scene), [
    instantiateComponent(d, { id: "demo" }),
  ]);
  source.camera = {
    keys: [
      { frame: 0, x: 950, y: 540, zoom: 1.2 },
      { frame: source.frameCount - 1, x: 950, y: 540, zoom: 1.2 },
    ],
    depth: { demo__source: 1, demo__screen: 0 },
  };
  const scene = compilePreparedScene(source);
  if (scene.schemaVersion !== "story-scene-1")
    throw new Error("story expected");
  const node = scene.nodes.find((n) => n.id === "demo__body")!;
  for (const frame of [0, 100, 10]) {
    const point = transformPoint(worldMatrix(scene, node, frame), [50, 30]);
    expect(point[0]).toBeCloseTo(70);
    expect(point[1]).toBeCloseTo(128);
    expect(evaluatePreparedNodeAtTime(scene, node, frame)).toMatchObject({
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });
  }
});

describe("shared lifetimes and sequences", () => {
  it("rejects cyclic pins before camera coverage evaluates their geometry", () => {
    const scene = StorySceneSchema.parse({
      ...story.scene,
      motionGrammar: "v2",
      camera: {
        keys: [
          { frame: 0, x: 960, y: 540, zoom: 1 },
          { frame: 191, x: 960, y: 540, zoom: 1 },
        ],
        cover: ["house-a"],
        depth: {},
      },
      componentData: {
        schemaVersion: "scene-components-3",
        pins: [
          {
            id: "a",
            target: "house-a",
            anchor: { node: "house-b", point: [0, 0] },
          },
          {
            id: "b",
            target: "house-b",
            anchor: { node: "house-a", point: [0, 0] },
          },
        ],
      },
    });
    expect(() => compilePreparedScene(scene)).toThrow(/dependency cycle/);
  });
  it("gates both renderers with half-open fractional edges and preserves opacity", () => {
    for (const source of sources()) {
      const scene = compilePreparedScene(source),
        node = scene.nodes.find((n) => n.id === "demo__body")!;
      expect(
        (scene.schemaVersion === "commerce-scene-1"
          ? [10, 4.99, 5, 9.99, 3, 6]
          : [10, 4, 5, 9, 3, 6]
        ).map(
          (frame) => evaluatePreparedNodeAtTime(scene, node, frame).opacity,
        ),
      ).toEqual([0, 0, 0.5, 0.5, 0, 0.5]);
    }
  });
  it("sequences static one-frame clips and rejects local behavior overflow", () => {
    const d = definition();
    if (d.componentData.schemaVersion !== "scene-components-3")
      throw new Error("v3 expected");
    d.componentData.visibility = [];
    const result = sequenceComponents({ fps: 24, frameCount: 192 }, [
      { definition: d, id: "first", duration: 1 },
      { definition: d, id: "second", duration: 12 },
    ]);
    expect(
      result.map(
        (i) =>
          i.componentData.schemaVersion === "scene-components-3" &&
          i.componentData.visibility[0]!.window,
      ),
    ).toMatchObject([
      { start: 0, end: 1 },
      { start: 1, end: 13 },
    ]);
    d.motions.push({
      id: "move",
      node: "body",
      property: "x",
      to: 20,
      window: { start: 0, end: 12, easing: "linear" },
    });
    expect(() =>
      sequenceComponents({ fps: 24, frameCount: 192 }, [
        { definition: d, id: "bad", duration: 12 },
      ]),
    ).toThrow(/clip.*bad|bad.*clip/i);
  });
  it("reports the clip and expanded count when a consumer limit is crossed", () => {
    const d = definition();
    if (d.schemaVersion !== "component-3") throw new Error("v3 expected");
    d.componentData = ComponentDataV3Schema.parse({
      schemaVersion: "scene-components-3",
    });
    d.motions = [
      {
        id: "move-x",
        node: "body",
        property: "x",
        to: 10,
        window: { start: 0, end: 1, easing: "linear" },
      },
      {
        id: "move-y",
        node: "body",
        property: "y",
        to: 10,
        window: { start: 0, end: 1, easing: "linear" },
      },
    ];
    const clips = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: "phase" + (index + 1),
        definition: d,
        duration: 2,
      }));
    expect(() =>
      sequenceComponents({ fps: 24, frameCount: 192 }, clips(21)),
    ).toThrow(/phase21.*storyMoves count 42 exceeds 40/);

    d.motions.push({
      id: "grow",
      node: "body",
      property: "scale",
      to: 1.2,
      window: { start: 0, end: 1, easing: "linear" },
    });
    expect(
      sequenceComponents(
        { fps: 24, frameCount: 192, consumer: "commerce" },
        clips(14),
      ),
    ).toHaveLength(14);
    expect(() =>
      sequenceComponents(
        { fps: 24, frameCount: 192, consumer: "commerce" },
        clips(26),
      ),
    ).toThrow(/phase26.*commerceEvents count 104 exceeds 100/);
  });
  it("indexes an exclusive lifetime through the final scene edge", () => {
    const source = sources()[1]!;
    if (source.schemaVersion !== "story-scene-1")
      throw new Error("story expected");
    expect(
      indexStoryEvents(source).find((e) => e.id === "demo__visible"),
    ).toMatchObject({ kind: "visibility", endExclusive: true });
    retimeStoryEvents(
      source,
      [],
      {},
      {
        demo__visible: { start: source.frameCount - 1, end: source.frameCount },
      },
    );
    expect(() => compilePreparedScene(source)).not.toThrow();
  });
});
