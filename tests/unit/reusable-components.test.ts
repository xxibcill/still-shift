import { describe, expect, it } from "vitest";
import commerceFixture from "../../benchmarks/fixtures/ecommerce-motion/atoms/studio.json" with { type: "json" };
import storyFixture from "../../benchmarks/fixtures/story-authoring/comparison-template.json" with { type: "json" };
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { ComponentDefinitionSchema } from "../../packages/scene-contract/src/components.ts";
import {
  instantiateComponent,
  repeatComponent,
  addCommerceComponents,
  addStoryComponents,
} from "../../packages/renderer-core/src/component-instances.ts";
import { layoutComponentBoxes } from "../../packages/renderer-core/src/component-layout.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  sampleComponentValue,
  formatComponentValue,
  componentText,
} from "../../packages/renderer-core/src/component-values.ts";
import {
  ComponentAnchorSchema,
  ComponentNumberFormatSchema,
} from "../../packages/scene-contract/src/component-data.ts";
import {
  ReusableDemoSchema,
  REUSABLE_EXAMPLES,
} from "../../packages/scene-contract/src/reusable-component-demo.ts";
import { buildReusableDemo } from "../../packages/renderer-core/src/reusable-component-demo.ts";
import {
  resolveComponentAnchor,
  evaluateComponentAnnotation,
  validateComponentAnnotations,
} from "../../packages/renderer-core/src/component-annotations.ts";
import { worldMatrix } from "../../packages/renderer-core/src/commerce-geometry.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";
import {
  indexStoryEvents,
  retimeStoryEvents,
} from "../../packages/renderer-core/src/story-event-index.ts";

const clock = { fps: 24 as const, frameCount: 192 };
const definition = () =>
  ComponentDefinitionSchema.parse({
    schemaVersion: "component-1",
    bounds: { x: 0, y: 0, width: 100, height: 60 },
    nodes: [
      { type: "group", id: "root", width: 100, height: 60 },
      {
        type: "rect",
        id: "mark",
        parent: "root",
        width: 100,
        height: 60,
        fill: "#335544",
      },
    ],
    exports: { subject: "root" },
    motions: [
      {
        id: "rise",
        node: "root",
        property: "y",
        to: 20,
        window: { start: 10, end: 30, easing: "linear" },
      },
    ],
  });
describe("shared reusable components", () => {
  it("isolates three instances and preserves named timing across both adapters", () => {
    const original = definition();
    const instances = repeatComponent(clock, original, {
      ids: ["a", "b", "c"],
      start: 5,
      stagger: 10,
      offsets: [
        [0, 0],
        [200, 0],
        [400, 0],
      ],
    });
    expect(instances[1]!.exports.subject).toBe("b__root");
    expect(instances[1]!.motions[0]!.window.start).toBe(25);
    expect(original.nodes[0]!.x).toBe(0);
    const commerce = addCommerceComponents(
      CommerceSceneSchema.parse({ ...commerceFixture, ...clock, events: [] }),
      instances,
    );
    const story = addStoryComponents(
      StorySceneSchema.parse(storyFixture.scene),
      instances,
    );
    for (const source of [commerce, story]) {
      const scene = compilePreparedScene(source);
      const node = scene.nodes.find((n) => n.id === "b__root")!;
      for (const [frame, y] of [
        [0, 0],
        [25, 0],
        [35, 10],
        [45, 20],
        [35, 10],
      ])
        expect(evaluatePreparedNode(scene, node, frame!).y).toBe(y);
    }
  });
  it("rejects namespace collisions, missing external targets and timeline overflow", () => {
    const scene = CommerceSceneSchema.parse({
      ...commerceFixture,
      ...clock,
      events: [],
    });
    const instance = instantiateComponent(definition(), { id: "copy" });
    expect(() => addCommerceComponents(scene, [instance, instance])).toThrow(
      /Duplicate/,
    );
    expect(() =>
      repeatComponent(clock, definition(), {
        ids: ["a", "b"],
        start: 180,
        stagger: 5,
      }),
    ).toThrow(/timeline/);
    const external = ComponentDefinitionSchema.parse({
      ...definition(),
      externals: ["host"],
      nodes: [{ ...definition().nodes[0]!, parent: "host" }],
    });
    expect(() => instantiateComponent(external, { id: "a" })).toThrow(
      /external/,
    );
  });
  it("lays out measured boxes with deterministic alignment and distribution", () => {
    const boxes = layoutComponentBoxes(
      { x: 10, y: 20, width: 500, height: 100 },
      [
        { width: 100, height: 40 },
        { width: 100, height: 60 },
      ],
      { axis: "x", align: "center", distribution: "space-between", gap: 20 },
    );
    expect(boxes).toEqual([
      { x: 10, y: 50, width: 100, height: 40 },
      { x: 410, y: 40, width: 100, height: 60 },
    ]);
    expect(() =>
      layoutComponentBoxes(
        { x: 0, y: 0, width: 100, height: 50 },
        [
          { width: 60, height: 40 },
          { width: 60, height: 40 },
        ],
        { axis: "x", gap: 10 },
      ),
    ).toThrow(/fit/);
    const authored = { x: 0, y: 0, width: 100, height: 40 };
    expect(
      layoutComponentBoxes(
        { x: 112, y: 800, width: 500, height: 100 },
        [authored, authored],
        { axis: "x", distribution: "space-between" },
      ).map((b) => [b.x, b.y]),
    ).toEqual([
      [112, 800],
      [512, 800],
    ]);
  });
  it("evaluates a decreasing numeric source with explicit deterministic formatting", () => {
    const value = {
      id: "quantity",
      range: [-10, 100] as [number, number],
      from: 100,
      to: -10,
      window: { start: 12, end: 34, easing: "linear" as const },
    };
    expect(sampleComponentValue(value, 23)).toBe(45);
    expect(sampleComponentValue(value, 0)).toBe(100);
    expect(sampleComponentValue(value, 80)).toBe(-10);
    expect(
      sampleComponentValue(
        { ...value, range: [-1e9, 1e9], from: 1e9, to: -1e-9 },
        34,
      ),
    ).toBe(-1e-9);
    expect(
      formatComponentValue(-12.345, {
        decimals: 2,
        rounding: "half-away-from-zero",
        decimalSeparator: ".",
        groupSeparator: ",",
        prefix: "",
        suffix: " units",
      }),
    ).toBe("-12.35 units");
  });
  it.each([24, 30] as const)(
    "compiles every shared example in both contexts at %i fps",
    (fps) => {
      for (const mode of ["commerce", "story", "isolated"] as const)
        for (const example of REUSABLE_EXAMPLES) {
          const scene = buildReusableDemo(
            ReusableDemoSchema.parse({
              schemaVersion: "reusable-demo-1",
              mode,
              example: example.id,
              fps,
              count: example.id === "stagger" ? 5 : 2,
            }),
          );
          expect(
            compilePreparedScene(JSON.parse(JSON.stringify(scene))).timeline
              .frameCount,
          ).toBe(fps * 8);
        }
    },
  );
  it("keeps middle edits and cue retiming local to the named instance", () => {
    const settings = ReusableDemoSchema.parse({
      schemaVersion: "reusable-demo-1",
      mode: "story",
    });
    const first = StorySceneSchema.parse(buildReusableDemo(settings)),
      changed = StorySceneSchema.parse(
        buildReusableDemo({
          ...settings,
          middleText: "Changed",
          middleDelay: 9,
        }),
      );
    expect(first.nodes.find((n) => n.id === "marker1__body")).toMatchObject({
      x: 112,
      y: 839,
    });
    expect(first.nodes.find((n) => n.id === "marker3__body")).toMatchObject({
      x: 1528,
      y: 839,
    });
    expect(changed.nodes.filter((n) => !n.id.startsWith("marker2__"))).toEqual(
      first.nodes.filter((n) => !n.id.startsWith("marker2__")),
    );
    expect(
      indexStoryEvents(changed).find((e) => e.id === "marker2__rise")?.start,
    ).toBe(33);
    retimeStoryEvents(
      changed,
      [],
      {},
      { marker2__rise: { start: 40, end: 58 } },
    );
    expect(
      indexStoryEvents(changed).find((e) => e.id === "marker2__rise")?.start,
    ).toBe(40);
    expect(
      indexStoryEvents(changed).find((e) => e.id === "marker1__rise"),
    ).toEqual(indexStoryEvents(first).find((e) => e.id === "marker1__rise"));
  });
  it("isolates a component while preserving declared annotation targets", () => {
    const settings = ReusableDemoSchema.parse({
      schemaVersion: "reusable-demo-1",
      mode: "isolated",
    });
    const markers = buildReusableDemo(settings);
    expect(markers.nodes.every((n) => n.id.startsWith("marker"))).toBe(true);
    const leader = buildReusableDemo({ ...settings, example: "leader" });
    expect(leader.nodes.some((n) => n.id === "heading")).toBe(false);
    expect(leader.nodes.some((n) => n.id === "subject-art")).toBe(true);
    expect(leader.nodes.some((n) => n.id === "subject-b")).toBe(false);
  });
  it("preserves image states, shared asset identities and explicit exported handles", () => {
    const asset = commerceFixture.assets[0]!,
      font = CommerceSceneSchema.parse(commerceFixture).fonts[0]!;
    const image = ComponentDefinitionSchema.parse({
      schemaVersion: "component-1",
      bounds: { x: 0, y: 0, width: 50, height: 60 },
      assets: [asset],
      fonts: [font],
      exports: { art: "image" },
      nodes: [
        { id: "root", type: "group", width: 50, height: 60 },
        {
          id: "image",
          type: "image",
          parent: "root",
          width: 50,
          height: 60,
          states: [
            { asset: asset.id },
            { asset: asset.id, crop: [0, 0, 100, 100] },
          ],
        },
      ],
    });
    const a = instantiateComponent(image, { id: "a" }),
      b = instantiateComponent(image, { id: "b" });
    expect(a.nodes[1]!.parent).toBe("a__root");
    expect(a.exports.art).toBe("a__image");
    const merged = addCommerceComponents(
      CommerceSceneSchema.parse(commerceFixture),
      [a, b],
    );
    expect(merged.assets.filter((x) => x.id === asset.id)).toHaveLength(1);
    expect(merged.fonts.filter((x) => x.id === font.id)).toHaveLength(1);
    b.assets[0]!.path = "conflicting.png";
    expect(() =>
      addCommerceComponents(CommerceSceneSchema.parse(commerceFixture), [a, b]),
    ).toThrow(/conflict|Conflicting/);
    expect(image.assets[0]!.path).toBe(asset.path);
    expect(() =>
      ComponentDefinitionSchema.parse({ ...image, effects: [] }),
    ).toThrow();
  });
  it("rejects expanded limits and overlapping motion ownership", () => {
    const scene = CommerceSceneSchema.parse(commerceFixture),
      part = definition();
    part.motions.push({ ...part.motions[0]!, id: "conflict" });
    expect(() =>
      addCommerceComponents(scene, [instantiateComponent(part, { id: "a" })]),
    ).toThrow(/overlap|Overlapping|Conflicting/);
    expect(() =>
      repeatComponent(scene, definition(), {
        ids: Array.from({ length: 101 }, (_, i) => "copy" + i),
      }),
    ).toThrow(/200 nodes/);
    const many = repeatComponent(scene, definition(), {
      ids: Array.from({ length: 41 }, (_, i) => "copy" + i),
    });
    expect(() =>
      addStoryComponents(StorySceneSchema.parse(storyFixture.scene), many),
    ).toThrow(/40/);
  });
  it.each(["commerce", "story"] as const)(
    "maps annotation points through nested transforms and %s camera",
    (mode) => {
      const source = buildReusableDemo(
        ReusableDemoSchema.parse({
          schemaVersion: "reusable-demo-1",
          mode,
          example: "outline",
        }),
      );
      const target = source.nodes.find(
        (n) => n.id === (mode === "commerce" ? "subject-a" : "house-a"),
      )!;
      target.rotation = 17;
      const scene = compilePreparedScene(source);
      if (
        scene.schemaVersion !== "commerce-scene-1" &&
        scene.schemaVersion !== "story-scene-1"
      )
        throw new Error("scene");
      const path = scene.nodes.find((n) => n.id === "focus__line")!;
      if (path.type !== "path") throw new Error("path");
      for (const frame of [0, 80, 191, 40, 80]) {
        const expected = transformPoint(
          worldMatrix(scene, target, frame),
          [-18, -18],
        );
        const actual = evaluateComponentAnnotation(scene, path, frame);
        const projected = transformPoint(
          worldMatrix(scene, path, frame),
          actual.points[0]!,
        );
        expect(projected[0]).toBeCloseTo(expected[0], 9);
        expect(projected[1]).toBeCloseTo(expected[1], 9);
      }
    },
  );
  it("honors source crops and rejects lines crossing protected product regions", () => {
    const source = CommerceSceneSchema.parse(
      buildReusableDemo(
        ReusableDemoSchema.parse({
          schemaVersion: "reusable-demo-1",
          example: "outline",
        }),
      ),
    );
    const image = source.nodes.find((n) => n.id === "subject-art")!;
    if (image.type !== "image") throw new Error("image");
    image.states[0]!.crop = [100, 100, 500, 600];
    const scene = compilePreparedScene(source);
    if (scene.schemaVersion !== "commerce-scene-1") throw new Error("scene");
    const anchor = ComponentAnchorSchema.parse({
      node: image.id,
      point: [100, 100],
      space: "source",
    });
    expect(
      resolveComponentAnchor(scene, anchor, 20).every(Number.isFinite),
    ).toBe(true);
    expect(() =>
      resolveComponentAnchor(scene, { ...anchor, point: [50, 50] }, 20),
    ).toThrow(/crop/);
    source.geometry![0]!.protectedRegions = [[200, 200, 100, 100]];
    source.componentData!.annotations[0] = {
      path: "focus__line",
      protect: [image.id],
      points: [
        ComponentAnchorSchema.parse({ ...anchor, point: [150, 250] }),
        ComponentAnchorSchema.parse({ ...anchor, point: [350, 250] }),
      ],
    };
    const protectedScene = compilePreparedScene(source);
    if (protectedScene.schemaVersion !== "commerce-scene-1")
      throw new Error("scene");
    expect(() => validateComponentAnnotations(protectedScene)).toThrow(
      /protected/,
    );
  });
  it.each(["commerce", "story"] as const)(
    "uses one source for decimal text and bar, with exact endpoints in %s",
    (mode) => {
      const source = buildReusableDemo(
          ReusableDemoSchema.parse({
            schemaVersion: "reusable-demo-1",
            mode,
            example: "value",
            from: 12.5,
            to: -4.5,
            decimals: 2,
          }),
        ),
        scene = compilePreparedScene(source);
      if (
        scene.schemaVersion !== "commerce-scene-1" &&
        scene.schemaVersion !== "story-scene-1"
      )
        throw new Error("scene");
      const number = scene.nodes.find((n) => n.id === "quantity__number")!,
        bar = scene.nodes.find((n) => n.id === "quantity__bar")!;
      expect(componentText(scene, number, 0)).toBe("12.50 units");
      expect(componentText(scene, number, 191)).toBe("-4.50 units");
      for (const frame of [12, 90, 167, 40, 90]) {
        const value = Number(
          componentText(scene, number, frame)!.split(" ")[0],
        );
        expect(evaluatePreparedNode(scene, bar, frame).reveal).toBeCloseTo(
          (value + 100) / 200,
          4,
        );
      }
      if (source.schemaVersion === "story-scene-1") {
        expect(
          indexStoryEvents(source).find((e) => e.id === "quantity__amount")
            ?.nodes,
        ).toEqual(["quantity__number", "quantity__bar"]);
        retimeStoryEvents(
          source,
          [],
          {},
          { quantity__amount: { start: 30, end: 60 } },
        );
        expect(source.componentData!.values[0]!.window).toMatchObject({
          start: 30,
          end: 60,
        });
      }
    },
  );
  it("validates numeric ownership, separators, finite input and preparation limits", () => {
    const scene = CommerceSceneSchema.parse(
      buildReusableDemo(
        ReusableDemoSchema.parse({
          schemaVersion: "reusable-demo-1",
          example: "value",
        }),
      ),
    );
    scene.events.push({
      node: "quantity__bar",
      property: "reveal",
      start: 1,
      end: 20,
      to: 1,
      easing: "linear",
    });
    expect(() => compilePreparedScene(scene)).toThrow(/ownership/);
    expect(() =>
      buildReusableDemo(
        ReusableDemoSchema.parse({
          schemaVersion: "reusable-demo-1",
          example: "value",
          from: -100,
          to: 100,
          decimals: 2,
        }),
      ),
    ).toThrow(/10000/);
    expect(() =>
      ComponentNumberFormatSchema.parse({
        decimalSeparator: ",",
        groupSeparator: ",",
      }),
    ).toThrow(/differ/);
    expect(() =>
      formatComponentValue(NaN, ComponentNumberFormatSchema.parse({})),
    ).toThrow(/finite/);
    expect(
      formatComponentValue(
        -0.0001,
        ComponentNumberFormatSchema.parse({ decimals: 2 }),
      ),
    ).toBe("0.00");
    expect(
      formatComponentValue(
        -1234.567,
        ComponentNumberFormatSchema.parse({
          rounding: "truncate",
          decimals: 2,
          decimalSeparator: ",",
          groupSeparator: ".",
        }),
      ),
    ).toBe("-1.234,56");
  });
});
