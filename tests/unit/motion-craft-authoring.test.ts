import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import {
  interpolateColor,
  sampleSpatialPath,
} from "../../packages/renderer-core/src/motion-appearance.ts";
import {
  focalMotionEvents,
  motionGraph,
  withoutFocalMotion,
} from "../../packages/renderer-core/src/motion-inspector.ts";
import {
  analyzeMotionCraft,
  measureLayerPixelEnergy,
  requireMotionCraft,
} from "../../packages/renderer-core/src/story-continuous-quality.ts";
import { expandStoryRecipe } from "../../packages/renderer-core/src/story-generic.ts";
import { PathMorphSchema } from "../../packages/scene-contract/src/motion-craft.ts";
import { sampleStoryTransition } from "../../packages/renderer-core/src/story-transition.ts";

const fixture = (name = "relationship-build") =>
  StorySceneSchema.parse(
    JSON.parse(
      readFileSync(`benchmarks/fixtures/story-motion/${name}.json`, "utf8"),
    ),
  );
const generic = () =>
  StorySceneSchema.parse({
    ...fixture(),
    motionModel: "curves-1",
    recipe: { preset: "generic", moves: [], emphasis: [] },
    connectors: [],
  });
describe("motion craft authoring and inspection", () => {
  it("expands the relationship template to generic primitives without changing any evaluated pose", () => {
    const a = compileStoryScene(fixture()),
      b = compileStoryScene(expandStoryRecipe(fixture()));
    for (let frame = 0; frame < a.frameCount; frame++)
      for (const node of a.nodes)
        expect(
          evaluatePreparedNode(
            b,
            b.nodes.find((n) => n.id === node.id)!,
            frame,
          ),
        ).toEqual(evaluatePreparedNode(a, node, frame));
  });
  it("interpolates colors in OKLab and samples spatial paths at uniform arc length", () => {
    expect(interpolateColor("#ff0000", "#0000ff", 0)).toBe("#ff0000");
    expect(interpolateColor("#ff0000", "#0000ff", 1)).toBe("#0000ff");
    expect(interpolateColor("#ff0000", "#0000ff", 0.5)).toBe("#8c53a2");
    const path = {
      node: "path",
      segments: [
        [
          [0, 0],
          [0, 100],
          [100, 100],
          [100, 0],
        ],
      ] as [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ][],
    };
    expect(sampleSpatialPath(path, 0.5).point[0]).toBeCloseTo(50, 5);
    expect(sampleSpatialPath(path, 0.5).point[1]).toBeCloseTo(75, 5);
    const lengths = Array.from({ length: 20 }, (_, i) => {
      const a = sampleSpatialPath(path, i / 20).point,
        b = sampleSpatialPath(path, (i + 1) / 20).point;
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    });
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(0.1);
    expect(
      PathMorphSchema.safeParse({
        node: "path",
        keys: [
          {
            frame: 0,
            points: [
              [0, 0],
              [1, 1],
            ],
          },
          {
            frame: 20,
            points: [
              [0, 0],
              [1, 1],
              [2, 2],
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("detects entrance pops and same-direction dead stops, but accepts a smooth chain", () => {
    const source = generic();
    source.recipe.moves = [
      {
        node: "store",
        keys: [
          { frame: 0, x: 0 },
          { frame: 20, x: 20, easing: "out-cubic" },
          { frame: 40, x: 40 },
        ],
      },
    ];
    expect(
      analyzeMotionCraft(compileStoryScene(source)).map((d) => d.code),
    ).toContain("entrance-pop");
    source.recipe.moves[0]!.keys![1]!.easing = "smoothstep";
    expect(
      analyzeMotionCraft(compileStoryScene(source)).map((d) => d.code),
    ).toContain("dead-stop-chain");
    source.recipe.moves[0]!.keys![1]!.smooth = true;
    expect(analyzeMotionCraft(compileStoryScene(source))).toEqual([]);
    const graph = motionGraph(compileStoryScene(source), "store", "x");
    const scene = compileStoryScene(source),
      node = scene.nodes.find((n) => n.id === "store")!;
    for (const sample of graph.samples)
      expect(sample.value).toBe(
        evaluatePreparedNode(scene, node, sample.frame).x,
      );
  });
  it("shows periodic layers only inside their evaluated window", () => {
    const source = generic();
    source.periodic = [
      {
        node: "store",
        property: "x",
        layer: "carrier",
        start: 10,
        end: 15,
        oscillate: { period: 4, amplitude: 10 },
      },
    ];
    const scene = compileStoryScene(source),
      node = scene.nodes.find((n) => n.id === "store")!,
      graph = motionGraph(scene, "store", "x"),
      carrier = graph.layers.find((layer) => layer.layer === "carrier")!;
    for (const frame of [1, 10, 11, 15, 16])
      expect(graph.samples[frame]!.value).toBe(
        evaluatePreparedNode(scene, node, frame).x,
      );
    for (const frame of [1, 16])
      expect(carrier.samples[frame]).toMatchObject({
        active: false,
        value: 0,
        weight: 0,
      });
    expect(carrier.samples[11]).toMatchObject({
      active: true,
      value: 10,
      weight: 1,
    });
  });
  it("uses measured layer contributions for carrier and story-peak warnings", async () => {
    const scene = compileStoryScene(generic());
    const pixels = await measureLayerPixelEnergy(
      3,
      async (frame, disabled) =>
        new Uint8ClampedArray([
          disabled === "carrier" ? 0 : frame * 10,
          0,
          0,
          255,
        ]),
    );
    expect(pixels.layers.carrier).toEqual([0, 10, 10]);
    expect(pixels.layers.action).toEqual([0, 0, 0]);
    const warnings = analyzeMotionCraft(scene, pixels);
    expect(warnings.map((d) => d.code)).toEqual([
      "carrier-dominance",
      "peak-not-story",
    ]);
    expect(() => requireMotionCraft(warnings)).toThrow("motion-craft-gate");
    expect(() => requireMotionCraft(warnings, [])).not.toThrow();
    const source = generic();
    source.recipe.moves = [
      {
        node: "store",
        window: { start: 0, end: 20, easing: "in-out-cubic" },
        to: { x: 0 },
      },
    ];
    const calm = {
      ...pixels,
      layers: { ...pixels.layers, carrier: [0, 0, 0], action: [0, 10, 10] },
    };
    expect(
      analyzeMotionCraft(compileStoryScene(source), calm).map((d) => d.code),
    ).not.toContain("carrier-dominance");
    expect(
      analyzeMotionCraft(compileStoryScene(source), calm).map((d) => d.code),
    ).not.toContain("peak-not-story");
  });
  it("attributes a same-role fade separately from the declared focal press", async () => {
    const source = generic();
    source.recipe.moves = [
      {
        node: "store",
        window: { start: 0, end: 20, cue: "press" },
        to: { x: 80 },
        role: "action",
      },
      {
        node: "store",
        window: { start: 0, end: 20, cue: "fade" },
        to: { opacity: 0.3 },
        role: "action",
      },
    ];
    source.review = {
      essentialText: [],
      focalGroups: [{ id: "store", nodes: ["store"] }],
      focalEvents: [{ node: "store", property: "x", cue: "press" }],
    };
    const scene = compileStoryScene(source);
    expect(focalMotionEvents(scene)).toHaveLength(1);
    const withoutPress = withoutFocalMotion(scene);
    const node = scene.nodes.find((item) => item.id === "store")!;
    for (const frame of [0, 10, 20]) {
      expect(evaluatePreparedNode(withoutPress, node, frame).x).toBeCloseTo(
        evaluatePreparedNode(scene, node, 0).x,
      );
      expect(evaluatePreparedNode(withoutPress, node, frame).opacity).toBe(
        evaluatePreparedNode(scene, node, frame).opacity,
      );
    }
    const pixels = await measureLayerPixelEnergy(
      3,
      async (frame, disabled) => {
        const value =
          disabled === "focal"
            ? [0, 25, 30][frame]!
            : disabled === "action"
              ? 0
              : [0, 30, 40][frame]!;
        return new Uint8ClampedArray([value, 0, 0, 255]);
      },
      true,
    );
    expect(pixels.layers.action[1]).toBe(30);
    expect(pixels.focal).toEqual({
      contribution: [0, 5, 5],
      remainder: [0, 25, 5],
    });
    expect(
      analyzeMotionCraft(scene, pixels).map((item) => item.code),
    ).toContain("peak-not-story");
    const pressDominant = {
      ...pixels,
      focal: { contribution: [0, 25, 5], remainder: [0, 5, 5] },
    };
    expect(
      analyzeMotionCraft(scene, pressDominant).map((item) => item.code),
    ).not.toContain("peak-not-story");
    expect(
      analyzeMotionCraft(scene, {
        total: pixels.total,
        layers: pixels.layers,
      }).map((item) => item.code),
    ).toContain("peak-not-story");
  });

  it("rejects ambiguous focal cues and shared-property events", () => {
    const source = generic();
    source.recipe.moves = [
      {
        node: "store",
        window: { start: 0, end: 20, cue: "press" },
        to: { x: 80 },
      },
    ];
    source.review = {
      essentialText: [],
      focalEvents: [{ node: "store", property: "opacity", cue: "press" }],
    };
    expect(() => withoutFocalMotion(compileStoryScene(source))).toThrow(
      "focal-event-ambiguous",
    );
    source.review.focalEvents![0]!.property = "x";
    const scene = compileStoryScene(source);
    scene.motionEvents.push({
      node: "store",
      window: { start: 20, end: 40, cue: "other" },
      kind: "move",
      role: "action",
      properties: ["x"],
    });
    expect(() => withoutFocalMotion(scene)).not.toThrow();
    scene.motionEvents.at(-1)!.window.start = 19;
    expect(() => withoutFocalMotion(scene)).toThrow("focal-event-ambiguous");
  });

  it("accepts unrelated constraints but rejects constraints that can write the focal property", () => {
    const source = generic();
    const store = source.nodes.find((node) => node.id === "store")!;
    source.recipe.moves = [
      {
        node: "store",
        window: { start: 10, end: 20, cue: "press" },
        to: { x: store.x + 80 },
      },
    ];
    source.review = {
      essentialText: [],
      focalEvents: [{ node: "store", property: "x", cue: "press" }],
    };
    const scene = compileStoryScene(source);
    scene.constraints = [{ type: "look-at", target: "store", toward: "paper" }];
    expect(() => withoutFocalMotion(scene)).not.toThrow();
    scene.constraints.push({
      type: "attach",
      target: "store",
      anchor: "paper",
    });
    expect(() => withoutFocalMotion(scene)).toThrow("focal-event-ambiguous");
  });

  it("rejects focal property tracks that do not change during the named cue", () => {
    const source = generic();
    const store = source.nodes.find((node) => node.id === "store")!;
    source.recipe.moves = [
      {
        node: "store",
        window: { start: 10, end: 20, cue: "press" },
        to: { x: store.x },
      },
    ];
    source.review = {
      essentialText: [],
      focalEvents: [{ node: "store", property: "x", cue: "press" }],
    };
    expect(() => withoutFocalMotion(compileStoryScene(source))).toThrow(
      "focal-event-ambiguous",
    );
    source.recipe.moves[0]!.to!.x = store.x + 80;
    const scene = compileStoryScene(source);
    const focalEvent = scene.motionEvents.find(
      (event) => event.node === "store" && event.window.cue === "press",
    )!;
    focalEvent.window = { start: 30, end: 40, cue: "press" };
    expect(() => withoutFocalMotion(scene)).toThrow("focal-event-ambiguous");

    source.recipe.moves = [
      {
        node: "store",
        window: { start: 0, end: 20, cue: "lead" },
        to: { x: store.x + 10 },
      },
      {
        node: "store",
        window: { start: 20, end: 30, cue: "press" },
        to: { x: store.x + 10 },
      },
    ];
    expect(() => withoutFocalMotion(compileStoryScene(source))).toThrow(
      "focal-event-ambiguous",
    );
  });

  it("reports velocity discontinuities and competing focal peaks with negative controls", () => {
    const source = generic(),
      other = source.nodes.find((n) => n.id !== "store" && !n.parent)!.id;
    source.recipe.moves = [
      {
        node: "store",
        keys: [
          { frame: 0, x: 0 },
          { frame: 20, x: 20, easing: "linear" },
          { frame: 40, x: 40 },
        ],
      },
    ];
    expect(
      analyzeMotionCraft(compileStoryScene(source)).map((d) => d.code),
    ).toContain("velocity-discontinuity");
    source.recipe.moves[0]!.keys![1]!.smooth = true;
    expect(
      analyzeMotionCraft(compileStoryScene(source)).map((d) => d.code),
    ).not.toContain("velocity-discontinuity");
    source.recipe.moves = ["store", other].map((node) => ({
      node,
      window: { start: 0, end: 40, easing: "in-out-cubic" as const },
      to: { x: 1234 },
    }));
    source.review = {
      essentialText: [],
      focalGroups: [
        { id: "first", nodes: ["store"] },
        { id: "second", nodes: [other] },
      ],
    };
    expect(
      analyzeMotionCraft(compileStoryScene(source)).map((d) => d.code),
    ).toContain("competing-focus");
    source.recipe.moves[1]!.window = {
      start: 50,
      end: 90,
      easing: "in-out-cubic",
    };
    expect(
      analyzeMotionCraft(compileStoryScene(source)).map((d) => d.code),
    ).not.toContain("competing-focus");
  });
  it("expands intent-only authoring without craft warnings", () => {
    const source = generic();
    source.intentPresets = {
      schemaVersion: "story-motion-presets-1",
      motions: [
        {
          preset: "land",
          node: "store",
          amount: 25,
          window: { start: 0, end: 40 },
        },
        {
          preset: "recoil",
          node: "store",
          amount: 3,
          window: { start: 60, end: 90 },
        },
      ],
    };
    const scene = compileStoryScene(source);
    expect(scene.compiledMotion!.layers).toHaveLength(2);
    expect(analyzeMotionCraft(scene)).toEqual([]);
  });
  it("preserves Buffer Press poses without baked keys", () => {
    const raw = JSON.parse(
      readFileSync(
        "benchmarks/fixtures/motion-craft/buffer-press.json",
        "utf8",
      ),
    );
    const source = StorySceneSchema.parse(raw),
      scene = compileStoryScene(source);
    const legacy = compileStoryScene(
      StorySceneSchema.parse(
        JSON.parse(
          readFileSync(
            "benchmarks/fixtures/story-motion-buffer-press/unequal-margins.json",
            "utf8",
          ),
        ),
      ),
    );
    expect(source.recipe.moves).toHaveLength(0);
    for (let frame = 0; frame < scene.frameCount; frame++)
      for (const id of [
        "house-a",
        "house-b",
        "margin-a",
        "margin-b",
        "pressure-a",
        "pressure-b",
      ]) {
        const a = evaluatePreparedNode(
            scene,
            scene.nodes.find((n) => n.id === id)!,
            frame,
          ),
          b = evaluatePreparedNode(
            legacy,
            legacy.nodes.find((n) => n.id === id)!,
            frame,
          );
        for (const property of ["x", "y", "scaleY", "rotation"] as const)
          expect(Math.abs(a[property] - b[property])).toBeLessThan(0.001);
      }
  });
  it("samples joins with exact endpoints and keeps push coverage", () => {
    const handoff = {
      mode: "push" as const,
      frames: 12,
      direction: "left" as const,
      camera: "reset" as const,
      subjects: [],
    };
    const first = sampleStoryTransition(handoff, 0, 1920, 1080),
      last = sampleStoryTransition(handoff, 11, 1920, 1080);
    expect(first.incomingX).toBe(1920);
    expect(last.incomingX).toBe(0);
    for (let frame = 0; frame < 12; frame++) {
      const pose = sampleStoryTransition(handoff, frame, 1920, 1080);
      expect(pose.incomingX - pose.outgoingX).toBe(1920);
    }
  });
});
